import { ExpressionResultWidget } from "@/codemirror/widgets/ExpressionResultWidget";
import { SolveHighlightProvider } from "@/codemirror/SolveHighlightProvider";
import { ExpressionEngine } from "@/engine/engine/ExpressionEngine";
import { MarkdownLexer } from "@/engine/lexer/MarkdownLexer";
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

const DEBUG_MODE_ENABLED = false;

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
	private lexer: MarkdownLexer;

	constructor(view: EditorView) {
		logger.debug(`[SolveViewPlugin] Constructor`);

		this.userSettings = UserSettings.getInstance();
		this.highlightProvider = new SolveHighlightProvider();
		this.expressionEngine = new ExpressionEngine(this.userSettings.settings.engine.locale);
		this.lexer = new MarkdownLexer(this.userSettings.settings.engine.locale, "main");

		this.decorations = this.buildDecorations(view);
	}

update(update: ViewUpdate) {
		if (update.docChanged) {
			this.highlightProvider.invalidateCache();
			update.changes.iterChanges((fromA, toA) => {
				const startLine = update.view.state.doc.lineAt(fromA).number;
				const endLine = update.view.state.doc.lineAt(toA).number;
				for (let l = startLine; l <= endLine; l++) {
					this.lineDecorationCache.delete(l);
					this.dirtyLines.add(l);
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

				if (!line.text.trim() || line.text.trim().length === 0) {
					nextLineTextOffset += lineTextRaw.length;
					continue;
				}

				// Check if the line is a markdown construct using the lexer
				if (this.isMarkdownConstruct(line.text)) {
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

	private isMarkdownConstruct(lineText: string): boolean {
		// Check for multi-line constructs (code blocks, MathJax blocks)
		// This is a simple heuristic and may not be perfect
		if (lineText.trim().startsWith("$$") || lineText.trim().endsWith("$$")) {
			return true;
		}
		if (lineText.trim().startsWith("```") || lineText.trim().endsWith("```")) {
			return true;
		}

		// Use the lexer to check for single-line markdown constructs
		this.lexer.reset(lineText);
		const firstToken = this.lexer.next();
		if (firstToken && firstToken.type.startsWith("MD_")) {
			return true;
		}

		return false;
	}

	private buildLineDecorations(
		lineText: string,
		lineFrom: number,
		lineTo: number,
		lineNumber: number,
		decorations: Array<{from: number; to: number; deco: Decoration}>
	): void {
		const inlineSolvePositions = this.findInlineSolves(lineText);

		if (inlineSolvePositions.length > 0) {
			let offset = 0;
			for (const isp of inlineSolvePositions) {
				const expr = isp.expression;
				const lineExpr = expr.trim();
				if (!lineExpr) continue;

				const result = this.evaluateLine(lineNumber, lineExpr);
				if (result === undefined) continue;

				const widgetPos = lineFrom + isp.start + 3 + offset;
				decorations.push({
					from: widgetPos,
					to: widgetPos,
					deco: Decoration.widget({
						widget: new ExpressionResultWidget(lineNumber, true, lineExpr, result),
						side: 1,
					}),
				});
			}

			this.addHighlightDecorations(lineText, lineFrom, lineNumber, decorations);
		} else {
			const expression = lineText.trim();
			if (!expression) return;

			const result = this.evaluateLine(lineNumber, expression);
			if (result !== undefined) {
				decorations.push({
					from: lineTo,
					to: lineTo,
					deco: Decoration.widget({
						widget: new ExpressionResultWidget(lineNumber, false, expression, result),
						side: 1,
					}),
				});
			}

			this.addHighlightDecorations(lineText, lineFrom, lineNumber, decorations);
		}
	}

	private findInlineSolves(lineText: string): Array<{start: number; expression: string}> {
		const results: Array<{start: number; expression: string}> = [];
		const regex = /s`([^`]*)`/g;
		let match: RegExpExecArray | null;
		while ((match = regex.exec(lineText)) !== null) {
			results.push({ start: match.index, expression: match[1] });
		}
		return results;
	}

	private evaluateLine(lineNumber: number, expression: string): string | undefined {
		try {
			const value = this.expressionEngine.evaluateLine(lineNumber, expression);
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
