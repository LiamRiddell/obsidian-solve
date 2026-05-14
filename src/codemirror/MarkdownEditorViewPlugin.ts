import { ExpressionResultWidget } from "@/codemirror/widgets/ExpressionResultWidget";
import { SolveHighlightProvider } from "@/codemirror/SolveHighlightProvider";
import { ExpressionEngine } from "@/engine/engine/ExpressionEngine";
import { Value } from "@/engine/vm/Value";
import { formatValue } from "@/engine/format/FormatEngine";
import UserSettings from "@/settings/UserSettings";
import { logger } from "@/utilities/Logger";
import { RangeSetBuilder } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	PluginValue,
	ViewUpdate,
} from "@codemirror/view";

interface CachedLineDecorations {
	lineText: string;
	decorations: Array<{from: number; to: number; deco: Decoration}>;
}

export class MarkdownEditorViewPlugin implements PluginValue {
	public decorations: DecorationSet;
	private userSettings: UserSettings;
	private highlightProvider: SolveHighlightProvider;
	private expressionEngine: ExpressionEngine;
	private lineDecorationCache: Map<number, CachedLineDecorations> = new Map();
	private dirtyLines: Set<number> = new Set();

	constructor(view: EditorView) {
		logger.debug(`[SolveViewPlugin] Constructor`);

		this.userSettings = UserSettings.getInstance();
		this.highlightProvider = new SolveHighlightProvider();
		this.expressionEngine = new ExpressionEngine(this.userSettings.settings.engine.locale);

		this.decorations = this.buildDecorations(view);
	}

	update(update: ViewUpdate) {
		if (update.docChanged) {
			this.highlightProvider.invalidateCache();
			update.changes.iterChanges((fromA, toA, fromB, toB) => {
				const startLine = update.view.state.doc.lineAt(fromA).number;
				const endLine = update.view.state.doc.lineAt(toA).number;
				const newEndLine = update.view.state.doc.lineAt(toB).number;
				
				// Clear cache for affected lines
				for (let l = startLine; l <= endLine; l++) {
					this.lineDecorationCache.delete(l);
					this.dirtyLines.add(l);
				}
				
				// If line count changed, clear cache for all lines after the change
				if (newEndLine !== endLine) {
					const maxLine = update.view.state.doc.lines;
					for (let l = Math.min(endLine, newEndLine) + 1; l <= maxLine; l++) {
						this.lineDecorationCache.delete(l);
						this.dirtyLines.add(l);
					}
				}
			});
		}

		if (update.docChanged || update.viewportChanged) {
			this.decorations = this.buildDecorations(update.view);
		}
	}

	destroy() {
		logger.debug(`[SolveViewPlugin] Destroyed`);
		this.lineDecorationCache.clear();
		this.dirtyLines.clear();
	}

	buildDecorations(view: EditorView): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();

		const visibleRanges = view.visibleRanges;
		const seenLines = new Set();

		for (const { from, to } of visibleRanges) {
			const range = view.state.doc.iterRange(from, to);
			let nextLineTextOffset = 0;

			for (const lineTextRaw of range) {
				const linePosition = from + nextLineTextOffset;
				const line = view.state.doc.lineAt(linePosition);

				if (seenLines.has(line.number)) {
					nextLineTextOffset += lineTextRaw.length;
					continue;
				}
				seenLines.add(line.number);

				if (!this.dirtyLines.has(line.number)) {
					const cached = this.lineDecorationCache.get(line.number);
					if (cached && cached.lineText === line.text) {
						for (const d of cached.decorations) {
							builder.add(d.from, d.to, d.deco);
						}
						nextLineTextOffset += lineTextRaw.length;
						continue;
					}
				}

				// Use the engine's unified parsing to check if line is empty
				const parsingResult = this.expressionEngine.parseDocument(line.text, { inputType: 'markdown' });
				if (parsingResult.lines.length > 0 && parsingResult.lines[0].isEmpty) {
					nextLineTextOffset += lineTextRaw.length;
					continue;
				}

				const decorations: Array<{from: number; to: number; deco: Decoration}> = [];

				this.buildLineDecorations(line.text, line.from, line.to, line.number, decorations);

				decorations.sort((a, b) => a.from - b.from || (a.deco.spec.side ?? 0) - (b.deco.spec.side ?? 0));
				for (const d of decorations) {
					builder.add(d.from, d.to, d.deco);
				}

				this.lineDecorationCache.set(line.number, { lineText: line.text, decorations });
				this.dirtyLines.delete(line.number);

				nextLineTextOffset += lineTextRaw.length;
			}
		}

		return builder.finish();
	}

	private buildLineDecorations(
		lineText: string,
		lineFrom: number,
		lineTo: number,
		lineNumber: number,
		decorations: Array<{from: number; to: number; deco: Decoration}>
	): void {
		// Use the engine's unified parsing to get inline solve positions
		const parsingResult = this.expressionEngine.parseDocument(lineText, { inputType: 'markdown' });
		
		if (parsingResult.lines.length === 0) return;
		
		const parsedLine = parsingResult.lines[0];
		
		if (parsedLine.hasInlineSolves && parsedLine.inlineSolves.length > 0) {
			for (const solve of parsedLine.inlineSolves) {
				if (solve.expression.trim()) {
					const result = solve.result;
					if (result !== null && result !== undefined) {
						const formattedResult = formatValue(result);
						// Calculate widget position using the integrated coordinate system
						const widgetPos = lineFrom + solve.start + solve.expression.length + 3; // "s`" + expression + "`"
						
						decorations.push({
							from: widgetPos,
							to: widgetPos,
							deco: Decoration.widget({
								widget: new ExpressionResultWidget(lineNumber, true, solve.expression, formattedResult),
								side: 1,
							}),
						});
					}
				}
			}

			// Note: We intentionally do NOT call addHighlightDecorations here
			// because the line may contain markdown syntax (e.g., "# Result: s`1 + 2`")
			// and we only want to highlight the expression parts, not the surrounding text.
		} else if (parsedLine.expression) {
			const result = parsedLine.result;
			if (result !== null && result !== undefined) {
				const formattedResult = formatValue(result);
				decorations.push({
					from: lineTo,
					to: lineTo,
					deco: Decoration.widget({
						widget: new ExpressionResultWidget(lineNumber, false, parsedLine.expression, formattedResult),
						side: 1,
					}),
				});
			}

			this.addHighlightDecorations(lineText, lineFrom, lineNumber, decorations);
		}
	}

	private evaluateLine(lineNumber: number, expression: string): string | undefined {
		try {
			const value: Value = this.expressionEngine.evaluateLine(lineNumber, expression);
			return formatValue(value);
		} catch {
			return undefined;
		}
	}

	private addHighlightDecorations(
		lineText: string,
		lineFrom: number,
		lineNumber: number,
		decorations: Array<{from: number; to: number; deco: Decoration}>
	): void {
		const ranges = this.highlightProvider.getLineHighlights(lineText, lineNumber);
		for (const r of ranges) {
			decorations.push({
				from: lineFrom + r.from,
				to: lineFrom + r.to,
				deco: Decoration.mark({ class: r.className }),
			});
		}
	}
}
