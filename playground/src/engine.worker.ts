//#region 📦 Module Overview
/**
 * Web Worker entry point for the Solve Engine playground.
 *
 * Runs the expression engine off the main thread so that heavy computation
 * (lexing, parsing, compilation, VM execution) does not block UI updates.
 *
 * Two operation modes are supported:
 *
 * - **One-shot mode** (`stream: false`) — evaluates the expression once
 *   and posts the result back. The engine is discarded after evaluation.
 * - **Streaming mode** (`stream: true`) — evaluates the expression and
 *   keeps the engine alive to receive async resolution events (data fetches,
 *   currency exchanges, etc.). Each chunk of the diagnostic event stream
 *   is forwarded to the main thread as it arrives.
 *
 * **Multi-tab**: there is exactly ONE Worker instance shared by every open
 * playground tab (see stores/engine.ts) — every inbound/outbound message
 * carries a `tabId` so this file can multiplex requests for many
 * simultaneously-open documents through one Worker. This matters for
 * `global :name` variables specifically: `GlobalVariableStore` (imported
 * from solve-js) is a module-level singleton, so it's naturally shared
 * across every tab's `runEngine()` call as long as they all run inside
 * this SAME Worker — no cross-Worker messaging is needed. See the
 * `sharedGlobalVariableStore.subscribe(...)` block below for the piece
 * that makes a global write in one tab silently refresh every OTHER
 * open tab's diagnostic data in the background.
 *
 * Message protocol — incoming:
 * - `{ id, tabId, expression }` — one-shot evaluation.
 * - `{ id, tabId, expression, stream: true }` — streaming evaluation with events.
 * - `{ tabId, abort: true }` — cancel the current streaming session for that tab.
 *
 * Message protocol — outgoing:
 * - `{ id, tabId, result }` — serialized evaluation result.
 * - `{ id, tabId, streamEvent, stream: true }` — diagnostic event chunk.
 * - `{ id, tabId, error }` — evaluation error.
 * - `{ tabId, result, unsolicited: true }` — a BACKGROUND tab's result,
 *   refreshed silently because some OTHER tab wrote a global variable this
 *   tab's last-evaluated text depends on. Not tied to any `id` the main
 *   thread sent — the main thread should always accept and cache these.
 *
 * @module engine.worker
 */
//#endregion

import { runEngine, runEngineWithStreaming, DebugResult, Token } from './engine.js';
import { sharedGlobalVariableStore } from '@solve-js/vm/GlobalVariableStore';

//#region Serialization — Token → transferable format
/**
 * Serialize a single Token into a plain object for structured-clone transfer.
 *
 * Workers transfer results via `postMessage()` which uses the structured
 * clone algorithm. Token instances with prototype chains or class methods
 * must be flattened to plain objects to avoid clone errors.
 *
 * @param t - The token to serialize.
 * @returns A plain object with the same fields.
 */
function serializeToken(t: Token): any {
    return { type: t.type, value: t.value, offset: t.offset, line: t.line, col: t.col };
}

/**
 * Serialize an entire DebugResult for structured-clone transfer.
 *
 * Recursively serializes all token arrays and line results so that the
 * main thread receives plain objects compatible with Vue reactivity.
 *
 * @param result - The debug result from the engine.
 * @returns A deeply-serialized copy safe for postMessage transfer.
 */
function serializeResult(result: DebugResult): DebugResult {
    return {
        ...result,
        tokens: result.tokens.map(serializeToken) as any,
        rawTokens: result.rawTokens.map(serializeToken) as any,
        lineResults: result.lineResults.map(lr => ({ ...lr })),
    };
}
//#endregion

//#region Streaming State — AbortController for in-flight sessions, per tab
/**
 * AbortController for the current streaming session, keyed by tabId.
 *
 * Aborted when a new expression arrives FOR THAT TAB or an explicit abort
 * message for that tab is received. The AbortSignal is passed to
 * `runEngineWithStreaming` to cancel the event stream and dispose the
 * engine from within.
 *
 * Only one streaming session per tab can be active at a time. Starting a
 * new session for a tab automatically aborts that SAME tab's previous one
 * — it does not affect other tabs' in-flight sessions.
 */
const abortControllers = new Map<string, AbortController>();

/**
 * Last-evaluated expression text per tab — the only new persistent state
 * needed for multi-tab (each `runEngine()` call is still a fresh,
 * from-scratch evaluation; see engine.ts). Used exclusively by the
 * cross-tab global-variable refresh below: when some tab writes a global,
 * every OTHER tab's most recently evaluated text is re-run so its
 * diagnostic data stays current even while that tab isn't focused.
 */
const tabDocuments = new Map<string, string>();
//#endregion

//#region Cross-tab global-variable propagation
/**
 * When any tab writes `global :name = value`, silently re-evaluate every
 * OTHER tab's last-known text and post the fresh result back, tagged
 * `unsolicited: true`. The main thread (stores/engine.ts) caches these
 * per-tab and only pushes them into the visible diagnostic report if that
 * tab happens to be the currently-focused one — matching the "multiple
 * documents alive, only the focused tab's diagnostics shown" design.
 *
 * Deliberately re-runs via the simple one-shot `runEngine()`, not
 * `runEngineWithStreaming()` — this is a background refresh, not a fresh
 * interactive keystroke, so there is no live event stream to forward for
 * it. If the refreshed text itself contains an unresolved async value
 * (a currency rate, another still-undeclared global), that surfaces the
 * next time that tab is actually focused and re-evaluated interactively.
 */
sharedGlobalVariableStore.subscribe((_name, _value) => {
    for (const [tabId, text] of tabDocuments) {
        try {
            const result = runEngine(text);
            const serialized = serializeResult(result);
            self.postMessage({ tabId, result: serialized, unsolicited: true });
        } catch (error) {
            self.postMessage({ tabId, error: error instanceof Error ? error.message : String(error), unsolicited: true });
        }
    }
});
//#endregion

//#region Message Handler — Inbound command dispatcher
/**
 * Handle inbound messages from the main thread.
 *
 * Supports three message types identified by the `data` shape:
 * 1. **`{ tabId, abort: true }`** — cancels the current streaming session for that tab.
 * 2. **`{ id, tabId, expression, stream: true }`** — starts a streaming evaluation.
 * 3. **`{ id, tabId, expression }`** — runs a one-shot evaluation (default).
 *
 * One-shot and streaming are mutually exclusive per message; the worker
 * resets that tab's abort controller before processing each inbound message.
 *
 * @param e - The `MessageEvent` from the main thread.
 */
self.onmessage = (e: MessageEvent<{ id: number; tabId: string; expression: string; stream?: boolean; abort?: boolean }>) => {
    const { id, tabId, expression, stream, abort } = e.data;

    // ── Handle explicit abort message (e.g., user cleared expression) ──
    if (abort) {
        const controller = abortControllers.get(tabId);
        if (controller) {
            controller.abort();
            abortControllers.delete(tabId);
        }
        return;
    }

    // Cancel this SAME tab's previous streaming session before starting a
    // new one — other tabs' in-flight sessions are unaffected.
    const previous = abortControllers.get(tabId);
    if (previous) {
        previous.abort();
        abortControllers.delete(tabId);
    }

    // Track this tab's current text for the cross-tab global-variable
    // refresh above, regardless of one-shot vs streaming mode.
    tabDocuments.set(tabId, expression);

    if (stream) {
        // ── Streaming mode: keep engine alive for async resolution events ──
        try {
            const abortController = new AbortController();
            abortControllers.set(tabId, abortController);

            const { result, stream: eventStream } = runEngineWithStreaming(expression, abortController.signal);

            // If aborted during synchronous evaluation, don't send stale result
            if (abortController.signal.aborted) {
                return;
            }

            const serialized = serializeResult(result);
            self.postMessage({ id, tabId, result: serialized });

            // ── Forward the single event stream to the main thread.
            // The engine store's onmessage handler receives each event and
            // populates the StreamStore directly — no tee() or branch routing needed.
            const reader = eventStream.getReader();
            (async () => {
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        self.postMessage({ id, tabId, streamEvent: value, stream: true });
                    }
                } catch {
                    // Stream was aborted/cancelled — expected during session cleanup
                } finally {
                    reader.releaseLock();
                    if (abortControllers.get(tabId) === abortController) {
                        abortControllers.delete(tabId);
                    }
                }
            })();
        } catch (error) {
            self.postMessage({ id, tabId, error: error instanceof Error ? error.message : String(error) });
        }
    } else {
        // ── One-shot mode: evaluate once and return (original behavior) ──
        try {
            const result = runEngine(expression);
            const serialized = serializeResult(result);
            self.postMessage({ id, tabId, result: serialized });
        } catch (error) {
            self.postMessage({ id, tabId, error: error instanceof Error ? error.message : String(error) });
        }
    }
};
//#endregion
