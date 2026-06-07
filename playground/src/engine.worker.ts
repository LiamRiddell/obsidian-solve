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
 * Message protocol — incoming:
 * - `{ id, expression }` — one-shot evaluation.
 * - `{ id, expression, stream: true }` — streaming evaluation with events.
 * - `{ abort: true }` — cancel the current streaming session.
 *
 * Message protocol — outgoing:
 * - `{ id, result }` — serialized evaluation result.
 * - `{ id, streamEvent, stream: true }` — diagnostic event chunk.
 * - `{ id, error }` — evaluation error.
 *
 * @module engine.worker
 */
//#endregion

import { runEngine, runEngineWithStreaming, DebugResult, Token } from './engine.js';

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

//#region Streaming State — AbortController for in-flight sessions
/**
 * AbortController for the current streaming session.
 *
 * Aborted when a new expression arrives or an explicit abort message
 * is received. The AbortSignal is passed to `runEngineWithStreaming`
 * to cancel the event stream and dispose the engine from within.
 *
 * Only one streaming session can be active at a time. Starting a new
 * session automatically aborts the previous one.
 */
let currentAbortController: AbortController | null = null;
//#endregion

//#region Message Handler — Inbound command dispatcher
/**
 * Handle inbound messages from the main thread.
 *
 * Supports three message types identified by the `data` shape:
 * 1. **`{ abort: true }`** — cancels the current streaming session.
 * 2. **`{ expression, stream: true }`** — starts a streaming evaluation.
 * 3. **`{ expression }`** — runs a one-shot evaluation (default).
 *
 * One-shot and streaming are mutually exclusive per message; the worker
 * resets the abort controller before processing each inbound message.
 *
 * @param e - The `MessageEvent` from the main thread.
 */
self.onmessage = (e: MessageEvent<{ id: number; expression: string; stream?: boolean; abort?: boolean }>) => {
    const { id, expression, stream, abort } = e.data;

    // ── Handle explicit abort message (e.g., user cleared expression) ──
    if (abort) {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
        return;
    }

    // Cancel any previous streaming session before starting a new one
    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
    }

    if (stream) {
        // ── Streaming mode: keep engine alive for async resolution events ──
        try {
            const abortController = new AbortController();
            currentAbortController = abortController;

            const { result, stream: eventStream } = runEngineWithStreaming(expression, abortController.signal);

            // If aborted during synchronous evaluation, don't send stale result
            if (abortController.signal.aborted) {
                return;
            }

            const serialized = serializeResult(result);
            self.postMessage({ id, result: serialized });

            // ── Forward the single event stream to the main thread.
            // The engine store's onmessage handler receives each event and
            // populates the StreamStore directly — no tee() or branch routing needed.
            const reader = eventStream.getReader();
            (async () => {
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        self.postMessage({ id, streamEvent: value, stream: true });
                    }
                } catch {
                    // Stream was aborted/cancelled — expected during session cleanup
                } finally {
                    reader.releaseLock();
                    currentAbortController = null;
                }
            })();
        } catch (error) {
            self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
        }
    } else {
        // ── One-shot mode: evaluate once and return (original behavior) ──
        try {
            const result = runEngine(expression);
            const serialized = serializeResult(result);
            self.postMessage({ id, result: serialized });
        } catch (error) {
            self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
        }
    }
};
//#endregion
