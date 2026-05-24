import { ExpressionResultWidget } from "@app/codemirror/widgets/ExpressionResultWidget";
import { SolveHighlightProvider } from "@app/codemirror/SolveHighlightProvider";
import { EngineProvider } from "@app/engine/EngineProvider";
import { Value } from "@solve-js/vm/Value";
import { formatValue } from "@solve-js/format/FormatEngine";
import type { ParsedLine } from "@solve-js/types/ParsingResult";
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

	private currentDoc: object | null = null;

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

		this.currentDoc = view.state.doc;
		this.decorations = this.buildDecorations(view);
	}

	update(update: ViewUpdate) {
		// Detect document switch — reset shared engine to prevent variable leaking between documents
		const newDoc = update.state?.doc;
		if (newDoc && newDoc !== this.currentDoc) {
			this.currentDoc = newDoc;
			EngineProvider.reset();
			this.highlightProvider = new SolveHighlightProvider(EngineProvider.get());
			this.lineDecorationCache.clear();
			this.dirtyLines.clear();
		}

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

				// Always clear cache for all lines after the change —
				// even if line count didn't change, text length changes
				// shift absolute positions of every subsequent line.
				const maxLine = update.view.state.doc.lines;
				for (let l = Math.min(endLine, newEndLine) + 1; l <= maxLine; l++) {
					this.lineDecorationCache.delete(l);
					this.dirtyLines.add(l);
					EngineProvider.get().getLineCache().removeAllForLine(l);
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
		const seenLines = new Set<number>();

		// Phase 1: Collect all visible uncached lines for batch evaluation
		const linesToEvaluate: Array<{ text: string; line: ReturnType<typeof view.state.doc.lineAt> }> = [];

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

				// Skip lines that are clean and cached
				if (!this.dirtyLines.has(line.number)) {
					const cached = this.lineDecorationCache.get(line.number);
					if (cached && cached.lineText === line.text) {
						nextLineTextOffset += lineTextRaw.length;
						continue;
					}
				}

				linesToEvaluate.push({ text: line.text, line });
				nextLineTextOffset += lineTextRaw.length;
			}
		}

		// Phase 2: Batch-evaluate all uncached lines in a single engine call
		// Build a lineNumber → ParsedLine map for O(1) lookup in Phase 3
		const lineResultMap = new Map<number, ParsedLine>();
		if (linesToEvaluate.length > 0) {
			const engine = EngineProvider.get();
			const lineTexts = linesToEvaluate.map(l => l.text);
			const evaluatedLines = engine.evaluateLines(lineTexts);
			for (let i = 0; i < evaluatedLines.length; i++) {
				lineResultMap.set(linesToEvaluate[i].line.number, evaluatedLines[i]);
			}
		}

		// Phase 3: Build decorations from cached + freshly evaluated lines
		seenLines.clear();
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

				// Render cached lines
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

				// Look up the batch-evaluated result for this line
				const parsedLine = lineResultMap.get(line.number);

				if (!parsedLine || parsedLine.isEmpty) {
					nextLineTextOffset += lineTextRaw.length;
					continue;
				}

				const decorations: Array<{from: number; to: number; deco: Decoration}> = [];

				this.buildLineDecorationsFromParsed(parsedLine, line.from, line.to, line.number, decorations);

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

	/**
	 * Build line decorations from an already-evaluated ParsedLine.
	 * This avoids the duplicate parseDocument() call — the line was already
	 * evaluated in the batch pass above.
	 */
	private buildLineDecorationsFromParsed(
		parsedLine: ParsedLine,
		lineFrom: number,
		lineTo: number,
		lineNumber: number,
		decorations: Array<{from: number; to: number; deco: Decoration}>
	): void {
		if (parsedLine.hasInlineSolves && parsedLine.inlineSolves.length > 0) {
			for (const solve of parsedLine.inlineSolves) {
				if (solve.expression.trim()) {
					const result = solve.result;
					if (result !== null && result !== undefined) {
						const formattedResult = formatValue(result);
						const widgetPos = lineFrom + solve.start + solve.expression.length + 3;

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

			this.addHighlightDecorations(parsedLine.text, lineFrom, lineNumber, decorations);
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