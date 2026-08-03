import { ExpressionResultWidget } from "@app/codemirror/widgets/ExpressionResultWidget";
import { EngineConfigMapper } from "@app/engine/EngineConfigMapper";
import { EPluginEvent } from "@app/constants/EPluginEvent";
import { pluginEventBus } from "@app/eventbus/PluginEventBus";
import {
	ExpressionEngine,
	DocumentModel,
	ThreeTierEvaluator,
	findInlineSolvesInLine,
} from "solve-engine/engine";
import type { ViewportRange, LineChange, AsyncResolutionEvent } from "solve-engine/engine";
import { Value, ValueType } from "solve-engine/vm";
import { VMCheckpointer } from "solve-engine/vm";
import { formatValue } from "solve-engine/format";
import UserSettings from "@app/settings/UserSettings";
import { logger } from "@app/utilities/Logger";
import { abortLogger } from "solve-engine/utilities";
import { LanguageService } from "solve-engine/language";
import { categoryClassName, completionItemToOption } from "solve-engine/language";
import { RangeSetBuilder } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	PluginValue,
	ViewUpdate,
} from "@codemirror/view";
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";

/** One pending decoration entry, sorted by position before being fed into the shared RangeSetBuilder. */
interface DecorationEntry {
	from: number;
	to: number;
	deco: Decoration;
}

export class MarkdownEditorViewPlugin implements PluginValue {
	/**
	 * Registry of live plugin instances keyed by their EditorView.
	 * Lets command handlers (main.ts) reach the evaluator/document state of
	 * the active editor without querying rendered DOM.
	 */
	private static readonly instances = new WeakMap<EditorView, MarkdownEditorViewPlugin>();

	/** Look up the plugin instance owning the given view, if any. */
	static forView(view: EditorView): MarkdownEditorViewPlugin | undefined {
		return MarkdownEditorViewPlugin.instances.get(view);
	}

	public decorations: DecorationSet;
	private userSettings: UserSettings;
	/** Reader for the engine's async resolution event stream (Web Streams API). */
	private eventStreamReader: ReadableStreamDefaultReader<AsyncResolutionEvent> | null = null;

	private currentDoc: object | null = null;
	/** The view this instance decorates (WeakMap key for cleanup). */
	private readonly view: EditorView;

	/**
	 * Per-editor engine instance. Each editor pane owns its own engine so
	 * variables, caches, and checkpoints never bleed between panes or
	 * documents — the old shared-singleton design meant two panes fought
	 * over one VM and a document switch in one pane reset the other.
	 */
	private engine: ExpressionEngine;

	/**
	 * Syntax-highlighting language service, sharing this pane's engine so it
	 * recognizes exactly the same tokens (including any registered
	 * package's custom ones) that real evaluation does — see
	 * LanguageService's own doc comment for why reusing the engine
	 * matters for correctness, not just performance.
	 */
	private languageService: LanguageService;

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
		this.view = view;
		MarkdownEditorViewPlugin.instances.set(view, this);

		// Per-editor engine — see the field doc for why this is not shared.
		const engine = new ExpressionEngine(
			this.userSettings.settings.engine.locale,
			false,
			EngineConfigMapper.toEngineConfig(this.userSettings)
		);
		this.engine = engine;
		this.languageService = new LanguageService(engine);

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
		this.wireAsyncResultMirror();

		this.currentDoc = view.state.doc;
		this.decorations = this.buildDecorations(view);
	}

	/**
	 * Mirror async-resolved line results straight into the DocumentModel.
	 *
	 * The batcher patches the engine's LineCache; decorations render from
	 * DocumentModel. This hook copies each resolved value across as it
	 * lands, so handleAsyncEvent only has to rebuild decorations — no
	 * mark-dirty + re-evaluation pass. Re-wired after engine.clear()
	 * (which nulls the hook) on document switch.
	 */
	private wireAsyncResultMirror(): void {
		this.engine.getBatcher().onLineResult = (lineNumber, value) => {
			const state = this.docModel.getLineAt(lineNumber);
			if (!state) return;
			if (state.results.length === 0) {
				state.results = [[value]];
			} else {
				// Replace the pending group if one exists, else the first group.
				const idx = state.results.findIndex(g => g[0]?.type === ValueType.Pending);
				state.results[idx >= 0 ? idx : 0] = [value];
			}
			state.result = state.results[0]?.[0] ?? value;
		};
	}

	update(update: ViewUpdate) {
		// Detect document switch — clear this pane's engine to prevent
		// variable leaking between documents.
		//
		// A *switch* (a different file loaded into this editor) arrives as a
		// state replacement WITHOUT an edit transaction: the doc instance
		// differs from the last one we processed but update.docChanged is
		// false. Ordinary typing always sets docChanged — CM6 documents are
		// immutable, so comparing instances alone would classify every
		// keystroke as a switch and reset the engine (destroying the bytecode
		// cache, DAG, and checkpoints) on each character typed.
		const newDoc = update.state?.doc ?? null;
		const isDocumentSwitch =
			!update.docChanged && newDoc !== null && newDoc !== this.currentDoc;
		if (newDoc) {
			this.currentDoc = newDoc;
		}

		if (isDocumentSwitch && newDoc) {
			// Abort in-flight async work from the old document
			this.abortKeystroke('Document switch');

			// Clear THIS pane's engine — variables, caches, DAG, and
			// checkpoints from the old document must not leak into the new
			// one. Other panes own their own engines and are unaffected.
			this.engine.clear();

			// New document means every line number now refers to unrelated
			// content — the language service's own text-match guard would
			// eventually self-correct without this, but clearing proactively
			// avoids carrying stale, irrelevant entries in a bounded cache.
			this.languageService.invalidateCache();

			// Terminate old evaluator's worker before recreating
			this.evaluator.terminateWorker();

			// Recreate evaluator for new document
			this.docModel = new DocumentModel();
			this.docModel.setDocument(newDoc.toString());
			const checkpointer = new VMCheckpointer(this.engine.getVM());
			this.evaluator = new ThreeTierEvaluator(this.docModel, this.engine, checkpointer);
			this.keystrokeController = new AbortController();
			abortLogger.keystrokeCreated();
			this.evaluator.evaluateAll(this.keystrokeController.signal);

			// Re-subscribe to the event stream — engine.clear() closes the
			// old stream (readers get a clean done) and creates a fresh one.
			if (this.eventStreamReader) {
				try { this.eventStreamReader.cancel(); } catch { /* already closed */ }
			}
			this.eventStreamReader = this.engine.getEventStream().getReader();
			this.startEventStreamReader(update.view);
			this.wireAsyncResultMirror();

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

			// ── Phase 5.2f: Incremental document update ──────────────
			// Instead of rebuilding the entire DocumentModel via setDocument()
			// (which destroys all bytecode), apply only the changed lines.
			// Unchanged lines keep their lineIds → bytecode survives → Tier 2.
			const lineChanges = codeMirrorChangesToLineChanges(update);
			if (lineChanges.length > 0) {
				this.evaluator.applyTransaction(lineChanges);
			}

			// Surgical highlight-cache invalidation: evict only the lines the
			// edit actually touched (derived from the same lineChanges just
			// computed above, rather than a second changes-walk), so
			// unaffected visible lines still hit the language service's
			// cache on the decoration rebuild below. Any lines beyond this
			// range that shifted position are self-correcting: the cache's
			// own text-match guard naturally misses (and re-lexes) once a
			// line number's cached text no longer matches, so this doesn't
			// need to be exhaustive to stay correct — only to stay fast.
			//
			// This cache only ever holds anything when highlighting is on
			// (it's populated exclusively by getSemanticTokens() calls in
			// buildDecorations(), which are themselves skipped when
			// disabled — see highlightingEnabled there). Gate the whole
			// Set-allocation-and-walk here too, not just the eventual
			// no-op deletes, so a disabled user pays literally nothing on
			// every keystroke, not just "nothing visible."
			if (this.userSettings.syntaxHighlight.enabled) {
				const changedLines = new Set<number>();
				for (const change of lineChanges) {
					const span = Math.max(change.deleteCount, change.insertLines.length, 1);
					for (let line = change.startLine; line < change.startLine + span; line++) {
						changedLines.add(line);
					}
				}
				this.languageService.invalidateLines(changedLines);
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
		// Tear down this pane's engine — pending resolutions, batcher
		// state, and caches die with the pane.
		this.engine.clear();
		MarkdownEditorViewPlugin.instances.delete(this.view);
	}

	// ── Commit commands (state-driven, no DOM queries) ────────────────

	/**
	 * Commit rendered results for lines in [startLine, endLine] (1-based,
	 * inclusive) by emitting the same write events a result-widget click
	 * produces. Reads evaluator state from the DocumentModel instead of
	 * querying rendered DOM, so it works for any evaluated line — not just
	 * ones whose widgets happen to be rendered — and is testable headless.
	 *
	 * Pending and Error results are skipped (their widgets are not
	 * clickable either).
	 *
	 * @returns The number of results committed.
	 */
	commitResults(startLine: number, endLine: number): number {
		let committed = 0;
		for (let line = startLine; line <= endLine; line++) {
			const state = this.docModel.getLineAt(line);
			if (!state || state.isEmpty || state.results.length === 0) continue;

			const isInline = state.inlineSolveCount > 0;
			for (let i = 0; i < state.results.length; i++) {
				const value = state.results[i]?.[0];
				if (!value) continue;
				if (value.type === ValueType.Pending || value.type === ValueType.Error) continue;

				const expression = state.expressions[i] ?? state.text.trim();
				pluginEventBus.emit(
					EPluginEvent.WriteResultToActiveDocumentLine,
					line,
					expression,
					formatValue(value),
					isInline
				);
				committed++;
			}
		}
		return committed;
	}

	/**
	 * Commit results for all currently visible lines.
	 * @returns The number of results committed.
	 */
	commitVisibleResults(): number {
		const viewport = this.getViewportFromView(this.view);
		return this.commitResults(viewport.startLine, viewport.endLine);
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
				// Resolved values were already mirrored into the DocumentModel
				// by the onLineResult hook (see wireAsyncResultMirror), so this
				// handler only rebuilds decorations — an empty dispatch alone
				// does not trigger a rebuild (update() only rebuilds on
				// docChanged/viewportChanged).
				this.decorations = this.buildDecorations(view);
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

		// Read once per rebuild rather than per line — cheap field access,
		// and users who disable highlighting pay zero cost for the
		// mark-decoration pass below.
		const highlightingEnabled = this.userSettings.syntaxHighlight.enabled;

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

				// This line's decorations (syntax-highlight marks + whatever
				// result widget(s) follow below) are collected here and sorted
				// before being fed into the shared builder — RangeSetBuilder
				// requires strictly ascending position order across ALL
				// entries, and highlight marks can fall either side of a
				// mid-line inline-solve widget position.
				const entries: DecorationEntry[] = [];

				// Syntax highlighting — attempted for every line regardless of
				// which widget branch below applies. getSemanticTokens()
				// naturally returns nothing for blank/markdown-structural
				// lines and already tokenizes the inner expression of any
				// inline solve on the line, so no special-casing is needed
				// here for the different branches that follow.
				const highlightTokens = highlightingEnabled
					? this.languageService.getSemanticTokens(line.text, line.number)
					: [];
				for (const token of highlightTokens) {
					entries.push({
						from: line.from + token.from,
						to: line.from + token.to,
						deco: Decoration.mark({ class: categoryClassName(token.category) }),
					});
				}

				// Check for inline solves (embedded s`...` in markdown text)
				// After the multi-result refactor, inline solve results are stored
				// in lineState.results[] by the ThreeTierEvaluator. The UI reads
				// from there instead of calling engine.evaluateLine() directly.
				const inlineSolves = findInlineSolvesInLine(line.text, line.number);
				if (inlineSolves.length > 0 && lineState) {
					if (lineState.inlineSolveCount > 0) {
						// Normal path: results already populated by evaluator
						this.buildInlineSolveDecorations(line, inlineSolves, lineState, entries);
					} else {
						// Fallback: evaluator hasn't populated results yet (e.g., pre-
						// evaluation render). Call engine directly as a one-off.
						this.buildInlineSolveDecorationsFallback(line, inlineSolves, entries);
					}
				} else if (lineState && !lineState.isEmpty && lineState.results.length > 0) {
					// Full-line expression result from evaluator
					const resultGroup = lineState.results[0];
					const result = resultGroup[0];
					const isPending = result.type === ValueType.Pending;
					const formattedResult = isPending ? "" : formatValue(result);
					const expression = lineState.expressions[0] ?? line.text.trim();
					const queryKey = isPending ? (result.value as string) : null;

					entries.push({
						from: line.to,
						to: line.to,
						deco: Decoration.widget({
							widget: new ExpressionResultWidget(line.number, false, expression, formattedResult, isPending, queryKey),
							side: 1,
						}),
					});
				}
				// (Empty/markdown-only lines with no inline solves and no
				// result fall through with only their highlight marks, if any.)

				entries.sort((a, b) => a.from - b.from || a.to - b.to);
				for (const entry of entries) builder.add(entry.from, entry.to, entry.deco);

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
		entries: DecorationEntry[]
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

			entries.push({
				from: widgetPos,
				to: widgetPos,
				deco: Decoration.widget({
					widget: new ExpressionResultWidget(line.number, true, solve.expression, formattedResult, isPending, queryKey),
					side: 1,
				}),
			});
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
		entries: DecorationEntry[]
	): void {
		const engine = this.engine;

		for (const solve of inlineSolves) {
			if (!solve.expression.trim()) continue;

			try {
			const [result] = engine.evaluateLine(line.number, solve.expression);
				if (result !== null && result !== undefined) {
					const isPending = result.type === ValueType.Pending;
					const formattedResult = isPending ? "" : formatValue(result);
					const queryKey = isPending ? (result.value as string) : null;
					const widgetPos = line.from + solve.start + solve.expression.length + 3;

					entries.push({
						from: widgetPos,
						to: widgetPos,
						deco: Decoration.widget({
							widget: new ExpressionResultWidget(line.number, true, solve.expression, formattedResult, isPending, queryKey),
							side: 1,
						}),
					});
				}
			} catch {
				// Inline solve parse error — skip silently
			}
		}
	}

	// FIX #3: Activate evaluateLine() for on-demand evaluation
	private evaluateLine(lineNumber: number, expression: string): string | undefined {
		try {
			const engine = this.engine;
			const [value] = engine.evaluateLine(lineNumber, expression);
			return formatValue(value);
		} catch {
			return undefined;
		}
	}

	// FIX #3: Wire evaluateLine into command-facing API
	evaluateExpression(expression: string): Value | undefined {
		try {
			const engine = this.engine;
			const [result] = engine.evaluateExpression(expression);
			return result;
		} catch {
			return undefined;
		}
	}

	// ── Autocomplete ──────────────────────────────────────────────────

	/**
	 * CM6 `CompletionSource` for this pane, delegating to the shared
	 * `languageService.getCompletions()` — independent of the syntax
	 * highlighting toggle (see settings), and checked before any engine
	 * call so a disabled user pays zero cost, not just hidden output.
	 */
	completionSource(context: CompletionContext): CompletionResult | null {
		if (!this.userSettings.completions.enabled) return null;

		const word = context.matchBefore(/[\w]+/);
		if (!word || (word.from === word.to && !context.explicit)) return null;

		const line = context.state.doc.lineAt(context.pos);
		const items = this.languageService.getCompletions(line.text, context.pos - line.from);
		if (items.length === 0) return null;

		return { from: word.from, options: items.map(completionItemToOption) };
	}
}

/**
 * Module-level `CompletionSource` registered once with CM6's `autocompletion()`
 * (see main.ts) — resolves the relevant pane's `MarkdownEditorViewPlugin`
 * instance via the same `forView` registry command handlers already use,
 * then delegates to its `completionSource()`. `CompletionContext.view` is
 * only present for interactively-triggered completions, which is the only
 * case this editor cares about.
 */
export function solveCompletionSource(context: CompletionContext): CompletionResult | null {
	const view = context.view;
	if (!view) return null;
	const plugin = MarkdownEditorViewPlugin.forView(view);
	return plugin ? plugin.completionSource(context) : null;
}

// ── Change conversion helper ──────────────────────────────────────────────

/**
 * Convert CodeMirror's byte-offset changes to line-level {@link LineChange}[]
 * suitable for {@link DocumentModel.applyChanges}.
 *
 * `DocumentModel.applyChanges` treats each `insertLines[i]` as the COMPLETE
 * new text of a line — it never merges partial line content itself, and
 * `deleteCount` old lines are wholesale discarded (their entire `LineState`,
 * not just the touched substring). CodeMirror's `iterChanges`, by contrast,
 * only reports the byte range that actually changed — for a normal keystroke
 * inside a line, `fromA`/`toA` cover just the edited character(s), not the
 * rest of the line's untouched text either side of it.
 *
 * So every touched line's untouched PREFIX (before `fromA`) and untouched
 * SUFFIX (after `toA`) must be stitched onto the first/last inserted segment
 * here, or that surrounding text silently disappears once `applyChanges`
 * replaces the line wholesale. This also means a line is always "structurally
 * replaced" (`deleteCount` >= 1) even for a zero-width pure insertion, since
 * inserting text at a position strictly inside a line conceptually splits
 * that line into new one(s) — e.g. pressing Enter contributes zero deleted
 * *characters* but still fully replaces the one old line it lands in with
 * two new lines (`fromA === toA`, yet the surrounding text must still be
 * repartitioned around the inserted "\n").
 */
export function codeMirrorChangesToLineChanges(update: ViewUpdate): LineChange[] {
	const result: LineChange[] = [];
	const oldDoc = update.startState.doc;

	update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
		const startLineInfo = oldDoc.lineAt(fromA);
		const endLineInfo = oldDoc.lineAt(toA);

		const startLine = startLineInfo.number;
		const deleteCount = endLineInfo.number - startLine + 1;

		const prefix = startLineInfo.text.slice(0, fromA - startLineInfo.from);
		const suffix = endLineInfo.text.slice(toA - endLineInfo.from);

		const insertLines = inserted.toString().split('\n');
		insertLines[0] = prefix + insertLines[0];
		insertLines[insertLines.length - 1] += suffix;

		result.push({
			startLine,
			deleteCount,
			insertLines,
		});
	});

	return result;
}