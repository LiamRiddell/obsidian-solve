import { ExpressionResultWidget } from "@app/codemirror/widgets/ExpressionResultWidget";
import { SolveHighlightProvider } from "@app/codemirror/SolveHighlightProvider";
import { EngineProvider } from "@app/engine/EngineProvider";
import { Value } from "@solve-js/vm/Value";
import { formatValue } from "@solve-js/format/FormatEngine";
import UserSettings from "@app/settings/UserSettings";
import { logger } from "@app/utilities/Logger";
import { RangeSetBuilder } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	PluginValue,
	ViewUpdate,
} from "@codemirror/view";
import { dataQueryService } from "@solve-js/services/DataQueryService";

interface CachedLineDecorations {
	lineText: string;
	decorations: Array<{from: number; to: number; deco: Decoration}>;
}

export class MarkdownEditorViewPlugin implements PluginValue {
	public decorations: DecorationSet;
	private userSettings: UserSettings;
	private highlightProvider: SolveHighlightProvider;
	private lineDecorationCache: Map<number, CachedLineDecorations> = new Map();
	private dirtyLines: Set<number> = new Set();
	private cacheUpdateUnsubscribe: () => void;

	constructor(view: EditorView) {
		logger.debug(`[SolveViewPlugin] Constructor`);

		this.userSettings = UserSettings.getInstance();

		// FIX #1: Use shared engine instead of creating own instance
		const engine = EngineProvider.get();

		this.highlightProvider = new SolveHighlightProvider(engine);

		// Subscribe to cache updates from DataQueryService
		this.cacheUpdateUnsubscribe = dataQueryService.onCacheUpdate((dataSourceId, queryKey, data) => {
			// Mark only affected lines as dirty using the dependency graph
			const affectedLines = engine.getDag().getAffectedLinesByDataSource(dataSourceId, queryKey);
			for (const line of affectedLines) {
				this.dirtyLines.add(line);
			}
			// Trigger a re-render by dispatching a dummy transaction
			view.dispatch({});
		});

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
					EngineProvider.get().getLineCache().removeAllForLine(l);
				}

				// If line count changed, clear cache for all lines after the change
				if (newEndLine !== endLine) {
					const maxLine = update.view.state.doc.lines;
					for (let l = Math.min(endLine, newEndLine) + 1; l <= maxLine; l++) {
						this.lineDecorationCache.delete(l);
						this.dirtyLines.add(l);
						EngineProvider.get().getLineCache().removeAllForLine(l);
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
		if (this.cacheUpdateUnsubscribe) {
			this.cacheUpdateUnsubscribe();
		}
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

				// Use the shared engine's unified parsing to check if line is empty
				const engine = EngineProvider.get();
				const parsingResult = engine.parseDocument(line.text, { inputType: 'markdown' });
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
		const engine = EngineProvider.get();
		// Use the shared engine's unified parsing to get inline solve positions
		const parsingResult = engine.parseDocument(lineText, { inputType: 'markdown' });

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

	// FIX #3: Activate evaluateLine() for on-demand evaluation
	private evaluateLine(lineNumber: number, expression: string): string | undefined {
		try {
			const engine = EngineProvider.get();
			const value: Value = engine.evaluateLine(lineNumber, expression);
			return formatValue(value);
		} catch {
			return undefined;
		}
	}

	// FIX #3: Wire evaluateLine into command-facing API
	evaluateExpression(expression: string): Value | undefined {
		try {
			const engine = EngineProvider.get();
			return engine.evaluateExpression(expression);
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
		this.highlightProvider.getLineHighlights(lineText, lineNumber);
		// Highlighting is handled separately by SolveHighlightProvider
	}
}