import { ExpressionResultWidget } from "@app/codemirror/widgets/ExpressionResultWidget";
import { SolveHighlightProvider } from "@app/codemirror/SolveHighlightProvider";
import { EngineProvider } from "@app/engine/EngineProvider";
import { Value } from "@solve-js/vm/Value";
import { formatValue } from "@solve-js/format/FormatEngine";
import UserSettings from "@app/settings/UserSettings";
import { logger } from "@app/utilities/Logger";
import { DocumentModel, ViewportRange, LineChange } from "@solve-js/engine/DocumentModel";
import { ThreeTierEvaluator } from "@solve-js/engine/ThreeTierEvaluator";
import { VMCheckpointer } from "@solve-js/vm/VMCheckpoints";
import { findInlineSolvesInLine } from "@solve-js/engine/ExpressionEngineSafety";
import { RangeSetBuilder } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	PluginValue,
	ViewUpdate,
} from "@codemirror/view";
import { dataQueryService } from "@solve-js/services/DataQueryService";

export class MarkdownEditorViewPlugin implements PluginValue {
	public decorations: DecorationSet;
	private userSettings: UserSettings;
	private highlightProvider: SolveHighlightProvider;
	private cacheUpdateUnsubscribe: () => void;

	private currentDoc: object | null = null;

	// ── Three-tier evaluator (Phase 5.2 integration) ─────────────────
	private docModel: DocumentModel;
	private evaluator: ThreeTierEvaluator;

	constructor(view: EditorView) {
		logger.debug(`[SolveViewPlugin] Constructor`);

		this.userSettings = UserSettings.getInstance();

		// FIX #1: Use shared engine instead of creating own instance
		const engine = EngineProvider.get();

		this.highlightProvider = new SolveHighlightProvider(engine);

		// ── Initialize DocumentModel + ThreeTierEvaluator ────────────
		this.docModel = new DocumentModel();
		this.docModel.setDocument(view.state.doc.toString());
		const checkpointer = new VMCheckpointer(engine.getVM());
		this.evaluator = new ThreeTierEvaluator(this.docModel, engine, checkpointer);

		// First full evaluation to populate bytecode cache + checkpoints
		this.evaluator.evaluateAll();

		// Dispatch background compilation for lines beyond viewport
		this.evaluator.dispatchBackgroundCompiles(this.getViewportFromView(view));

		// Subscribe to cache updates from DataQueryService
		this.cacheUpdateUnsubscribe = dataQueryService.onCacheUpdate((dataSourceId, queryKey, data) => {
			// Mark only affected lines as dirty using the dependency graph
			const affectedLines = engine.getDag().getAffectedLinesByDataSource(dataSourceId, queryKey);
			for (const line of affectedLines) {
				this.docModel.markDirtyByLineNumber(line);
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

			// Terminate old evaluator's worker before recreating
			this.evaluator.terminateWorker();

			// Recreate evaluator for new document
			const engine = EngineProvider.get();
			this.docModel = new DocumentModel();
			this.docModel.setDocument(newDoc.toString());
			const checkpointer = new VMCheckpointer(engine.getVM());
			this.evaluator = new ThreeTierEvaluator(this.docModel, engine, checkpointer);
			this.evaluator.evaluateAll();

			this.decorations = this.buildDecorations(update.view);

			// Background compilation for new document
			this.evaluator.dispatchBackgroundCompiles(this.getViewportFromView(update.view));
			return; // Skip docChanged/viewportChanged path — already handled above
		}

		if (update.docChanged) {
			this.highlightProvider.invalidateCache();

			// ── Phase 5.2f: Incremental document update ──────────────
			// Instead of rebuilding the entire DocumentModel via setDocument()
			// (which destroys all bytecode), apply only the changed lines.
			// Unchanged lines keep their lineIds → bytecode survives → Tier 2.
			const lineChanges = codeMirrorChangesToLineChanges(update);
			if (lineChanges.length > 0) {
				this.evaluator.applyTransaction(lineChanges);
			}
		}

		if (update.docChanged || update.viewportChanged) {
			// Determine viewport range from visible ranges
			const viewport = this.getViewportFromView(update.view);

			if (update.docChanged) {
				// Document changed — full evaluation from line 1
				this.evaluator.evaluate(viewport);
			} else {
				// Viewport-only change (scroll) — optimized zero-allocation path
				this.evaluator.setViewport(viewport);
			}

			this.decorations = this.buildDecorations(update.view);

			// Phase 5.2h: Dispatch background compilation to worker for
			// invisible dirty lines. Worker compiles bytecode and transfers
			// ArrayBuffers back (zero-copy) for future Tier-2 scrolls.
			this.evaluator.dispatchBackgroundCompiles(viewport);
		}
	}

	destroy() {
		logger.debug(`[SolveViewPlugin] Destroyed`);
		if (this.cacheUpdateUnsubscribe) {
			this.cacheUpdateUnsubscribe();
		}
		// Phase 5.2h: Clean up compilation worker through evaluator
		this.evaluator.terminateWorker();
	}

	// ── Viewport extraction ──────────────────────────────────────────

	/**
	 * Extract the visible line range from the editor view.
	 * Returns the start and end line numbers (1-based, inclusive).
	 */
	private getViewportFromView(view: EditorView): ViewportRange {
		const ranges = view.visibleRanges;
		if (ranges.length === 0) {
			return { startLine: 1, endLine: 1 };
		}

		const startLine = view.state.doc.lineAt(ranges[0].from).number;
		const endLine = view.state.doc.lineAt(ranges[ranges.length - 1].to).number;
		return { startLine, endLine };
	}

	// ── Decoration building ──────────────────────────────────────────

	buildDecorations(view: EditorView): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();

		const visibleRanges = view.visibleRanges;
		const seenLines = new Set<number>();

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

				const lineState = this.docModel.getLineAt(line.number);

				// Check for inline solves (embedded s`...` in markdown text)
				const inlineSolves = findInlineSolvesInLine(line.text, 0);
				if (inlineSolves.length > 0) {
					this.buildInlineSolveDecorations(line, inlineSolves, builder);
					nextLineTextOffset += lineTextRaw.length;
					continue;
				}

				// Skip empty/markdown-only lines (no expression)
				if (lineState?.isEmpty || !lineState?.result) {
					nextLineTextOffset += lineTextRaw.length;
					continue;
				}

				// Full-line expression result from evaluator
				const result = lineState.result;
				const formattedResult = formatValue(result);
				const expression = lineState.expression ?? line.text.trim();

				builder.add(
					line.to,
					line.to,
					Decoration.widget({
						widget: new ExpressionResultWidget(line.number, false, expression, formattedResult),
						side: 1,
					}),
				);

				this.addHighlightDecorations(line.text, line.number);

				nextLineTextOffset += lineTextRaw.length;
			}
		}

		return builder.finish();
	}

	/**
	 * Build decorations for inline solve expressions (s`...`) embedded in markdown text.
	 * These are evaluated directly via the engine since the ThreeTierEvaluator focuses
	 * on full-line expressions.
	 */
	private buildInlineSolveDecorations(
		line: ReturnType<typeof EditorView.prototype.state.doc.lineAt>,
		inlineSolves: ReturnType<typeof findInlineSolvesInLine>,
		builder: RangeSetBuilder<Decoration>
	): void {
		const engine = EngineProvider.get();

		for (const solve of inlineSolves) {
			if (!solve.expression.trim()) continue;

			try {
				const result = engine.evaluateLine(line.number, solve.expression);
				if (result !== null && result !== undefined) {
					const formattedResult = formatValue(result);
					const widgetPos = line.from + solve.start + solve.expression.length + 3;

					builder.add(
						widgetPos,
						widgetPos,
						Decoration.widget({
							widget: new ExpressionResultWidget(line.number, true, solve.expression, formattedResult),
							side: 1,
						}),
					);
				}
			} catch {
				// Inline solve parse error — skip silently
			}
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

	private addHighlightDecorations(lineText: string, lineNumber: number): void {
		this.highlightProvider.getLineHighlights(lineText, lineNumber);
	}
}

// ── Change conversion helper ──────────────────────────────────────────────

/**
 * Convert CodeMirror's byte-offset changes to line-level {@link LineChange}[]
 * suitable for {@link DocumentModel.applyChanges}.
 *
 * CodeMirror's `iterChanges` provides byte offsets (fromA, toA, fromB, toB)
 * relative to the old document. This function maps those to 1-based line
 * numbers and extracts the inserted text split by newlines.
 */
function codeMirrorChangesToLineChanges(update: ViewUpdate): LineChange[] {
	const result: LineChange[] = [];

	update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
		const oldDoc = update.startState.doc;

		// Determine the starting line (1-based) in the old document
		const startLine = oldDoc.lineAt(fromA).number;

		// Determine how many lines were deleted.
		// toA is exclusive; find the line containing byte toA-1.
		let deleteCount = 0;
		if (toA > fromA) {
			const lastDeletedLine = oldDoc.lineAt(toA - 1).number;
			deleteCount = lastDeletedLine - startLine + 1;
		}

		// Split inserted text into lines
		const insertedText = inserted.toString();
		const insertLines = insertedText ? insertedText.split('\n') : [];

		result.push({
			startLine,
			deleteCount,
			insertLines,
		});
	});

	return result;
}