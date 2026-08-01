/**
 * Debug logging for the AbortController lifecycle in the "One AbortController
 * Per Keystroke" pattern.
 *
 * Enabled when `process.env.DEBUG_ABORTCTRL === "true"`.
 *
 * This is **opt-in only** — even in development mode you must explicitly
 * set the flag to avoid log noise from large documents.
 *
 * Logs controller creation, abortion, signal linking, keystroke signal
 * propagation, and stale-data discard guards.  All messages are output via
 * `console.debug` with an `[AbortCtrl]` prefix so they can be filtered
 * in the DevTools console.
 *
 * ── Usage ─────────────────────────────────────────────────────────────
 * import { abortLogger } from "@solve-js/utilities/AbortControllerLogger";
 *
 * // Enable explicitly (before the plugin boots):
 * //   process.env.DEBUG_ABORTCTRL = "true";
 *
 * abortLogger.keystrokeCreated();
 * abortLogger.localControllerCreated("executeAndStore");
 * abortLogger.signalLinked("executeAndStore", "keystroke");
 * abortLogger.keystrokeAborted("New keystroke");
 * abortLogger.staleDataDiscarded("USD:GBP", "signal aborted");
 * abortLogger.keystrokeSignalSet(true);  // signal set, not aborted
 * abortLogger.keystrokeSignalCleared();
 */
const isDebugEnabled = typeof process !== "undefined" && process.env.DEBUG_ABORTCTRL === "true";

export const abortLogger = {
	/** Whether debug logging is currently active. */
	get enabled(): boolean {
		return isDebugEnabled;
	},

	// ── Keystroke-level controller (MarkdownEditorViewPlugin) ──────

	/**
	 * Log creation of the keystroke-level AbortController.
	 * Called in the plugin constructor and on each new keystroke.
	 */
	keystrokeCreated(): void {
		if (!isDebugEnabled) return;
		console.debug("[AbortCtrl] KEYSTROKE CREATED");
	},

	/**
	 * Log abortion of the keystroke-level AbortController.
	 * @param reason Why the keystroke was aborted (e.g. "New keystroke",
	 *   "Document switch", "Plugin destroyed").
	 */
	keystrokeAborted(reason: string): void {
		if (!isDebugEnabled) return;
		console.debug(`[AbortCtrl] KEYSTROKE ABORTED: ${reason}`);
	},

	// ── Local per-evaluation controllers (ExpressionEngine) ─────────

	/**
	 * Log creation of a local AbortController that is linked to the
	 * keystroke signal.
	 * @param source Which code path created the controller
	 *   (e.g. "executeAndStore", "executeRaw", "preflight", "vm").
	 */
	localControllerCreated(source: string): void {
		if (!isDebugEnabled) return;
		console.debug(`[AbortCtrl] LOCAL CREATED (${source})`);
	},

	/**
	 * Log that a local AbortController was linked to the keystroke signal.
	 * When the keystroke signal is aborted, this local controller will
	 * be aborted automatically.
	 * @param source The code path that created the controller.
	 */
	signalLinked(source: string): void {
		if (!isDebugEnabled) return;
		console.debug(`[AbortCtrl] LOCAL LINKED (${source}) → keystroke`);
	},

	/**
	 * Log that a local AbortController's listener was removed from the
	 * keystroke signal (cleanup).
	 * @param source The code path.
	 */
	signalUnlinked(source: string): void {
		if (!isDebugEnabled) return;
		console.debug(`[AbortCtrl] LOCAL UNLINKED (${source})`);
	},

	// ── Keystroke signal propagation (ThreeTierEvaluator → ExpressionEngine) ──

	/**
	 * Log that the keystroke signal was propagated INTO the engine.
	 * @param isAborted Whether the signal was already aborted when set.
	 */
	keystrokeSignalSet(isAborted: boolean): void {
		if (!isDebugEnabled) return;
		console.debug(
			`[AbortCtrl] KEYSTROKE_SIGNAL → engine (aborted=${isAborted})`,
		);
	},

	/**
	 * Log that the keystroke signal was CLEARED from the engine
	 * (typically in the evaluator's finally block).
	 */
	keystrokeSignalCleared(): void {
		if (!isDebugEnabled) return;
		console.debug("[AbortCtrl] KEYSTROKE_SIGNAL cleared (null)");
	},

	// ── Stale-data discard guards (resolveAsync) ────────────────────

	/**
	 * Log that a stale async result was discarded because its signal
	 * was aborted.
	 * @param queryKey The cache key for the discarded result.
	 * @param context Additional context (e.g. "after await", "after error").
	 */
	staleDataDiscarded(queryKey: string, context: string): void {
		if (!isDebugEnabled) return;
		console.debug(
			`[AbortCtrl] STALE DISCARD: ${queryKey} (${context})`,
		);
	},
};
