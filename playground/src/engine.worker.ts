import { runEngine, runEngineWithStreaming, DebugResult, Token, DiagnosticEventInfo } from './engine.js';

function serializeToken(t: Token): any {
    return { type: t.type, value: t.value, offset: t.offset, line: t.line, col: t.col };
}

/**
 * AbortController for the current streaming session.
 * Aborted when a new expression arrives or an explicit abort message is received.
 * The AbortSignal is passed to runEngineWithStreaming to cancel the stream
 * and dispose the engine from within.
 */
let currentAbortController: AbortController | null = null;

/**
 * Serialize a DebugResult for structured-clone transfer to the main thread.
 */
function serializeResult(result: DebugResult): DebugResult {
    return {
        ...result,
        tokens: result.tokens.map(serializeToken) as any,
        rawTokens: result.rawTokens.map(serializeToken) as any,
        lineResults: result.lineResults.map(lr => ({ ...lr })),
    };
}

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

            // Consume the event stream via a reader and forward each chunk
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
                    if (currentAbortController === abortController) {
                        currentAbortController = null;
                    }
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
