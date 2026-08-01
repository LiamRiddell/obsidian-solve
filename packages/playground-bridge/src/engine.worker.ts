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
 * - `{ tabId, close: true }` — the tab was closed; drop every per-tab
 *   structure held for it. The main thread MUST send this on tab close, or
 *   the document's text stays in `tabDocuments` for the lifetime of the
 *   page and keeps being re-evaluated by the cross-tab refresh below.
 *
 * Message protocol — outgoing:
 * - `{ id, tabId, result }` — serialized evaluation result.
 * - `{ id, tabId, streamEvent, stream: true }` — diagnostic event chunk.
 * - `{ id, tabId, error }` — evaluation error.
 * - `{ tabId, result, unsolicited: true }` — a BACKGROUND tab's result,
 *   refreshed silently because some OTHER tab wrote a global variable this
 *   tab's last-evaluated text depends on. Not tied to any `id` the main
 *   thread sent — the main thread should always accept and cache these.
 * - `{ tabId, streamEvent, unsolicited: true }` — an async resolution (an
 *   OSRS price, a currency rate) settling AFTER one of the refreshes above
 *   already ran. Also untied to any `id` — patch the tab's cached line the
 *   same way an interactive stream's `lineUpdate` is patched.
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

/**
 * AbortController for the current cross-tab BACKGROUND refresh, keyed by
 * tabId — separate from `abortControllers` above (which track interactive,
 * keystroke-driven sessions). If several global writes fire in quick
 * succession, each new refresh for a tab cancels that SAME tab's own
 * previous (now-superseded) refresh.
 */
const refreshAbortControllers = new Map<string, AbortController>();

/**
 * The tab whose evaluation is currently ON THE STACK, if any.
 *
 * A `global :x = ...` line writes its value from inside the VM, i.e. from
 * deep inside a `runEngine*()` call, and the store notifies listeners
 * synchronously. Without knowing which tab is mid-evaluation, the
 * cross-tab refresh below would queue a refresh for the very document that
 * is already being evaluated with its current text — the self-sustaining
 * edge of the cycle described in `scheduleRefreshDrain()`.
 */
let evaluatingTabId: string | null = null;

/** Tabs that need a background refresh once the current evaluation unwinds. */
const pendingRefreshTabs = new Set<string>();

/** True while a drain is already queued — keeps N writes collapsing into ONE pass. */
let refreshScheduled = false;

/**
 * How many drains have run back-to-back without the system going quiet.
 * Reset to 0 as soon as a drain settles (see `drainRefreshQueue`).
 */
let refreshGeneration = 0;

/**
 * Cap on consecutive refresh generations. Documents that genuinely cycle
 * (A writes x, B reads x and writes y, A reads y and writes x, ...) would
 * otherwise never settle. Four passes is far more than any legitimate
 * propagation chain needs; past that we stop rather than spin.
 */
const MAX_REFRESH_GENERATIONS = 4;
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
 * Uses `runEngineWithStreaming()`, not the simpler one-shot `runEngine()`.
 * A one-shot run's fresh, empty-cache engine can't wait for an OSRS price
 * or currency rate to resolve — it just returns "Pending" and is discarded.
 * If the refreshed tab's line had ALREADY resolved before this refresh
 * fired, that one-shot re-run would regress it back to "Pending" with NO
 * way to ever complete it again (nothing keeps that discarded engine's
 * fetch alive, and no future event patches the cache). Streaming instead
 * means this refresh's own async resolutions eventually arrive as
 * `lines-updated` events, forwarded below and patched into the tab's cache
 * — the same lineUpdate mechanism the interactive path already uses.
 */
sharedGlobalVariableStore.subscribe((_name, _value) => {
    for (const tabId of tabDocuments.keys()) {
        // Never queue the document that is mid-evaluation right now: it is
        // already running against its current text, and re-running it is
        // what closed the loop into a cycle.
        if (tabId === evaluatingTabId) continue;
        pendingRefreshTabs.add(tabId);
    }
    scheduleRefreshDrain();
});

/**
 * Queue a refresh pass instead of running one inline.
 *
 * This listener fires from inside the VM, part-way through an evaluation.
 * Refreshing synchronously from here — as this code originally did — meant
 * every refresh re-ran `STORE_GLOBAL_VAR`, which re-entered this listener,
 * which refreshed again. `GlobalVariableStore.MAX_NOTIFY_DEPTH` bounded the
 * recursion's DEPTH at 64 but never its BREADTH, so the work per keystroke
 * was O((tabs × global-writes)^64): a single-tab document with one `global`
 * line cost 65 full engine runs, and two tabs ran past 5,000 before being
 * cut off — each one also posting a fully-serialized DebugResult (tokens,
 * opcodes, VM trace, per-line pipeline stages) to the main thread. The main
 * thread could not drain that queue faster than the worker filled it, so
 * the retained messages grew without bound until the tab was OOM-killed.
 *
 * Deferring to a macrotask fixes it structurally: the drain runs only after
 * the in-flight evaluation has fully unwound, so a refresh can never nest
 * inside the evaluation that triggered it. That also keeps the module-level
 * ValueArena toggle sound — `enableValueArena`/`disableValueArena` is a
 * single non-reentrant flag, and a nested evaluation used to reset the
 * arena out from under the still-running outer one (the same hazard
 * ThreeTierEvaluator's own subscriber documents and avoids by never
 * evaluating synchronously).
 */
function scheduleRefreshDrain(): void {
    if (refreshScheduled || pendingRefreshTabs.size === 0) return;
    if (refreshGeneration >= MAX_REFRESH_GENERATIONS) {
        // A genuine write cycle between documents. Stop propagating rather
        // than spin; the stored values are correct either way, and the next
        // user edit resets the counter and re-propagates.
        pendingRefreshTabs.clear();
        return;
    }
    refreshScheduled = true;
    setTimeout(drainRefreshQueue, 0);
}

/** Run one refresh pass for every tab queued since the last drain. */
function drainRefreshQueue(): void {
    refreshScheduled = false;

    const tabIds = [...pendingRefreshTabs];
    pendingRefreshTabs.clear();
    if (tabIds.length === 0) {
        refreshGeneration = 0;
        return;
    }
    refreshGeneration++;

    for (const tabId of tabIds) {
        const text = tabDocuments.get(tabId);
        // Skip tabs closed between being queued and being drained.
        if (text === undefined) continue;
        refreshTab(tabId, text);
    }

    // Refreshing writes globals of its own, which re-queues via the
    // subscriber above. An empty queue here means the system settled, so
    // the next unrelated write starts from a clean generation budget.
    if (pendingRefreshTabs.size === 0) refreshGeneration = 0;
    else scheduleRefreshDrain();
}

/** Silently re-evaluate one background tab and post its fresh result. */
function refreshTab(tabId: string, text: string): void {
    const previousRefresh = refreshAbortControllers.get(tabId);
    if (previousRefresh) previousRefresh.abort();

    const refreshController = new AbortController();
    refreshAbortControllers.set(tabId, refreshController);

    try {
        // Marked as evaluating for the whole SYNCHRONOUS body of
        // runEngineWithStreaming — that is the window in which this
        // document's own STORE_GLOBAL_VAR opcodes fire the subscriber.
        const previousEvaluatingTabId = evaluatingTabId;
        evaluatingTabId = tabId;
        let result, stream;
        try {
            ({ result, stream } = runEngineWithStreaming(text, refreshController.signal));
        } finally {
            evaluatingTabId = previousEvaluatingTabId;
        }

        const serialized = serializeResult(result);
        self.postMessage({ tabId, result: serialized, unsolicited: true });

        const reader = stream.getReader();
        (async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (value.lineUpdate) {
                        self.postMessage({ tabId, streamEvent: value, unsolicited: true });
                    }
                }
            } catch {
                // Aborted by a newer write to the same tab, or the
                // stream's own natural cancellation — expected.
            } finally {
                reader.releaseLock();
                if (refreshAbortControllers.get(tabId) === refreshController) {
                    refreshAbortControllers.delete(tabId);
                }
            }
        })();
    } catch (error) {
        self.postMessage({ tabId, error: error instanceof Error ? error.message : String(error), unsolicited: true });
    }
}
//#endregion

//#region Message Handler — Inbound command dispatcher
/**
 * Handle inbound messages from the main thread.
 *
 * Supports four message types identified by the `data` shape:
 * 1. **`{ tabId, abort: true }`** — cancels the current streaming session for that tab.
 * 2. **`{ tabId, close: true }`** — the tab was closed; drop all state held for it.
 * 3. **`{ id, tabId, expression, stream: true }`** — starts a streaming evaluation.
 * 4. **`{ id, tabId, expression }`** — runs a one-shot evaluation (default).
 *
 * One-shot and streaming are mutually exclusive per message; the worker
 * resets that tab's abort controller before processing each inbound message.
 *
 * @param e - The `MessageEvent` from the main thread.
 */
self.onmessage = (e: MessageEvent<{ id: number; tabId: string; expression: string; stream?: boolean; abort?: boolean; close?: boolean }>) => {
    const { id, tabId, expression, stream, abort, close } = e.data;

    // ── Handle explicit abort message (e.g., user cleared expression) ──
    if (abort) {
        const controller = abortControllers.get(tabId);
        if (controller) {
            controller.abort();
            abortControllers.delete(tabId);
        }
        return;
    }

    // ── Tab closed — release every per-tab structure. Without this,
    // `tabDocuments` grew for the lifetime of the page and every closed
    // document kept being re-evaluated by the cross-tab refresh above,
    // forever. ──
    if (close) {
        abortControllers.get(tabId)?.abort();
        abortControllers.delete(tabId);
        refreshAbortControllers.get(tabId)?.abort();
        refreshAbortControllers.delete(tabId);
        tabDocuments.delete(tabId);
        pendingRefreshTabs.delete(tabId);
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

    // A fresh user action — allow cross-tab propagation a full generation
    // budget again, even if a previous cascade exhausted it.
    refreshGeneration = 0;

    if (stream) {
        // ── Streaming mode: keep engine alive for async resolution events ──
        try {
            const abortController = new AbortController();
            abortControllers.set(tabId, abortController);

            const previousEvaluatingTabId = evaluatingTabId;
            evaluatingTabId = tabId;
            let result, eventStream;
            try {
                ({ result, stream: eventStream } = runEngineWithStreaming(expression, abortController.signal));
            } finally {
                evaluatingTabId = previousEvaluatingTabId;
            }

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
            const previousEvaluatingTabId = evaluatingTabId;
            evaluatingTabId = tabId;
            let result;
            try {
                result = runEngine(expression);
            } finally {
                evaluatingTabId = previousEvaluatingTabId;
            }
            const serialized = serializeResult(result);
            self.postMessage({ id, tabId, result: serialized });
        } catch (error) {
            self.postMessage({ id, tabId, error: error instanceof Error ? error.message : String(error) });
        }
    }
};
//#endregion
