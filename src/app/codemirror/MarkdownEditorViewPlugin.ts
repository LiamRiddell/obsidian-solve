import { ExpressionResultWidget } from "@app/codemirror/widgets/ExpressionResultWidget";
import { SolveHighlightProvider } from "@app/codemirror/SolveHighlightProvider";
import { EngineProvider } from "@app/engine/EngineProvider";
import { Value, ValueType } from "@solve-js/vm/Value";
import { formatValue } from "@solve-js/format/FormatEngine";
import UserSettings from "@app/settings/UserSettings";
import { logger } from "@app/utilities/Logger";
import { abortLogger } from "@app/utilities/AbortControllerLogger";
import { DocumentModel, ViewportRange, LineChange } from "@solve-js/engine/DocumentModel";
import { ThreeTierEvaluator } from "@solve-js/engine/ThreeTierEvaluator";
import { VMCheckpointer } from "@solve-js/vm/VMCheckpoints";
import { findInlineSolvesInLine } from "@solve-js/engine/ExpressionEngineSafety";
import type { AsyncResolutionEvent } from "@solve-js/engine/AsyncResolutionBatcher";
import { RangeSetBuilder } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	PluginValue,
	ViewUpdate,
} from "@codemirror/view";

export class MarkdownEditorViewPlugin implements PluginValue {
	public decorations: DecorationSet;
	private userSettings: UserSettings;
	private highlightProvider: SolveHighlightProvider;
	/** Reader for the engine's async resolution event stream (Web Streams API). */
	private eventStreamReader: ReadableStreamDefaultReader<AsyncResolutionEvent> | null = null;

	private currentDoc: object | null = null;

	// ── Three-tier evaluator (Phase 5.2 integration) ─────────────────
	private docModel: DocumentModel;
	private evaluator: ThreeTierEvaluator;

	// ── Keystroke-level cancellation (One AbortController Per Keystroke) ──
	// When the user types, we abort the previous keystroke's AbortController.
	// This automatically cancels all in-flight async fetches, pending batcher
	// flushes, and stale preflight checks from the previous keystroke.
	// The signal propagates through: evaluator → engine → executeAndStore/executeRaw → resolveAsync.
	private keystrokeController: AbortController | null = null;

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
		this.keystrokeController = new AbortController();
		abortLogger.keystrokeCreated();
		this.evaluator.evaluateAll(this.keystrokeController.signal);

		// Dispatch background compilation for lines beyond viewport
		this.evaluator.dispatchBackgroundCompiles(this.getViewportFromView(view));

		// Subscribe to batcher event stream — the SINGLE async resolution pipeline.
		// Uses the Web Streams API via getEventStream().getReader() for built-in
		// cancellation, backpressure, and proper resource cleanup.
		const eventStream = engine.getEventStream();
		this.eventStreamReader = eventStream.getReader();
		this.startEventStreamReader(view);

		this.currentDoc = view.state.doc;
		this.decorations = this.buildDecorations(view);
	}

	update(update: ViewUpdate) {
		// Detect document switch — reset shared engine to prevent variable leaking between documents
		const newDoc = update.state?.doc;
		if (newDoc && newDoc !== this.currentDoc) {
			// Abort in-flight async work from the old document
			this.abortKeystroke('Document switch');

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
			this.keystrokeController = new AbortController();
			abortLogger.keystrokeCreated();
			this.evaluator.evaluateAll(this.keystrokeController.signal);

			this.decorations = this.buildDecorations(update.view);

			// Background compilation for new document
			this.evaluator.dispatchBackgroundCompiles(this.getViewportFromView(update.view));
			return; // Skip docChanged/viewportChanged path — already handled above
		}

		if (update.docChanged) {
			// ── One AbortController Per Keystroke ────────────────────
			// Abort all in-flight async work from the PREVIOUS keystroke.
			// This cancels pending fetches, preflight checks, and batcher
			// flushes that were triggered by the text that just changed.
			// The new keystroke gets a fresh AbortController.
			this.abortKeystroke('New keystroke');
			this.keystrokeController = new AbortController();
			abortLogger.keystrokeCreated();

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
			const signal = this.keystrokeController?.signal;

			if (update.docChanged) {
				// Document changed — full evaluation from line 1
				this.evaluator.evaluate(viewport, signal);
			} else {
				// Viewport-only change (scroll) — optimized zero-allocation path
				this.evaluator.setViewport(viewport, signal);
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
		// Abort all in-flight async work before teardown
		this.abortKeystroke('Plugin destroyed');
		// Cancel the event stream reader to stop receiving async events
		if (this.eventStreamReader) {
			try { this.eventStreamReader.cancel(); } catch { /* already closed */ }
			this.eventStreamReader = null;
		}
		// Phase 5.2h: Clean up compilation worker through evaluator
		this.evaluator.terminateWorker();
	}

	// ── Keystroke cancellation ─────────────────────────────────────────

	/**
	 * Abort the current keystroke's AbortController, canceling all in-flight
	 * async work: pending fetches, preflight checks, and batcher flushes.
	 *
	 * This implements the "One AbortController Per Keystroke" pattern:
	 * every keystroke gets a fresh AbortController; when the user types
	 * again, the old controller is aborted, and all async work from the
	 * old keystroke is canceled atomically.
	 *
	 * The signal propagates through: evaluator → engine → executeAndStore /
	 * executeRaw → resolveAsync, where `signal.aborted` guards prevent
	 * stale data from being stored or re-evaluated.
	 */
	private abortKeystroke(reason: string): void {
		if (this.keystrokeController) {
			abortLogger.keystrokeAborted(reason);
			this.keystrokeController.abort(reason);
			this.keystrokeController = null;
		}
	}

	// ── Event stream reader ───────────────────────────────────────────

	/**
	 * Start reading from the engine's event stream via the Web Streams API.
	 *
	 * Runs as a fire-and-forget async IIFE. Each event is dispatched to
	 * {@link handleAsyncEvent} for view refresh or error logging.
	 * The reader is cancelled in {@link destroy}.
	 */
	private startEventStreamReader(view: EditorView): void {
		const reader = this.eventStreamReader;
		if (!reader) return;

		(async () => {
			try {
				while (true) {
					const { done, value: event } = await reader.read();
					if (done) break;
					this.handleAsyncEvent(event, view);
				}
			} catch {
				// Reader cancelled — expected during teardown or document switch.
			}
		})();
	}

	// ── Async event handler ───────────────────────────────────────────

	/**
	 * Handle async resolution events from the batcher.
	 *
	 * - `lines-updated`: marks affected lines dirty and dispatches view refresh.
	 * - `error`: logs the error for debugging/transient toast display.
	 */
	private handleAsyncEvent(event: AsyncResolutionEvent, view: EditorView): void {
		switch (event.type) {
			case "lines-updated": {
				// Batcher already updated LineCache with fresh results.
				// Just trigger a view re-render — no need to mark dirty
				// (avoids double re-evaluation by ThreeTierEvaluator).
				view.dispatch({});
				break;
			}
			case "error": {
				logger.warn(
					`[SolveViewPlugin] Async resolution error for ${event.packageId}:${event.queryKey}: ${event.error.message}`,
				);
				break;
			}
		}
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
				// After the multi-result refactor, inline solve results are stored
				// in lineState.results[] by the ThreeTierEvaluator. The UI reads
				// from there instead of calling engine.evaluateLine() directly.
				const inlineSolves = findInlineSolvesInLine(line.text, line.number);
				if (inlineSolves.length > 0 && lineState) {
					if (lineState.inlineSolveCount > 0) {
						// Normal path: results already populated by evaluator
						this.buildInlineSolveDecorations(line, inlineSolves, lineState, builder);
					} else {
						// Fallback: evaluator hasn't populated results yet (e.g., pre-
						// evaluation render). Call engine directly as a one-off.
						this.buildInlineSolveDecorationsFallback(line, inlineSolves, builder);
					}
					nextLineTextOffset += lineTextRaw.length;
					continue;
				}

				// Skip empty/markdown-only lines (no expression)
				if (!lineState || lineState.isEmpty || lineState.results.length === 0) {
					nextLineTextOffset += lineTextRaw.length;
					continue;
				}

				// Full-line expression result from evaluator
				const resultGroup = lineState.results[0];
				const result = resultGroup[0];
				const isPending = result.type === ValueType.Pending;
				const formattedResult = isPending ? "" : formatValue(result);
				const expression = lineState.expressions[0] ?? line.text.trim();
				const queryKey = isPending ? (result.value as string) : null;

				builder.add(
					line.to,
					line.to,
					Decoration.widget({
						widget: new ExpressionResultWidget(line.number, false, expression, formattedResult, isPending, queryKey),
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
	 * Results are read from {@link LineState.results} which was populated by the
	 * ThreeTierEvaluator during Tier 1 evaluation — no more direct engine calls.
	 */
	private buildInlineSolveDecorations(
		line: ReturnType<typeof EditorView.prototype.state.doc.lineAt>,
		inlineSolves: ReturnType<typeof findInlineSolvesInLine>,
		lineState: ReturnType<typeof DocumentModel.prototype.getLineAt>,
		builder: RangeSetBuilder<Decoration>
	): void {
		if (!lineState) return;

		const results = lineState.results;
		for (let i = 0; i < inlineSolves.length; i++) {
			const solve = inlineSolves[i];
			if (!solve.expression.trim()) continue;

			const resultGroup = i < results.length ? results[i] : null;
			if (resultGroup === null || resultGroup === undefined || resultGroup.length === 0) continue;

			const result = resultGroup[0];
			const isPending = result.type === ValueType.Pending;
			const formattedResult = isPending ? "" : formatValue(result);
			const queryKey = isPending ? (result.value as string) : null;
			const widgetPos = line.from + solve.start + solve.expression.length + 3;

			builder.add(
				widgetPos,
				widgetPos,
				Decoration.widget({
					widget: new ExpressionResultWidget(line.number, true, solve.expression, formattedResult, isPending, queryKey),
					side: 1,
				}),
			);
		}
	}

	/**
	 * Fallback inline solve renderer used when the evaluator hasn't populated
	 * lineState.inlineSolveCount yet (pre-evaluation render path). Calls the
	 * engine directly as a one-off — once the evaluator runs, the normal
	 * buildInlineSolveDecorations path (reading from state.results[]) takes over.
	 */
	private buildInlineSolveDecorationsFallback(
		line: ReturnType<typeof EditorView.prototype.state.doc.lineAt>,
		inlineSolves: ReturnType<typeof findInlineSolvesInLine>,
		builder: RangeSetBuilder<Decoration>
	): void {
		const engine = EngineProvider.get();

		for (const solve of inlineSolves) {
			if (!solve.expression.trim()) continue;

			try {
			const [result] = engine.evaluateLine(line.number, solve.expression);
				if (result !== null && result !== undefined) {
					const isPending = result.type === ValueType.Pending;
					const formattedResult = isPending ? "" : formatValue(result);
					const queryKey = isPending ? (result.value as string) : null;
					const widgetPos = line.from + solve.start + solve.expression.length + 3;

					builder.add(
						widgetPos,
						widgetPos,
						Decoration.widget({
							widget: new ExpressionResultWidget(line.number, true, solve.expression, formattedResult, isPending, queryKey),
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
			const [value] = engine.evaluateLine(lineNumber, expression);
			return formatValue(value);
		} catch {
			return undefined;
		}
	}

	// FIX #3: Wire evaluateLine into command-facing API
	evaluateExpression(expression: string): Value | undefined {
		try {
			const engine = EngineProvider.get();
			const [result] = engine.evaluateExpression(expression);
			return result;
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