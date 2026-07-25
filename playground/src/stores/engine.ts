import { defineStore } from 'pinia';
import type { DebugResult, DiagnosticEventInfo } from '../engine.js';
import { useStreamStore } from './stream.js';
import { useWorkersStore } from './workers.js';
import { useDiagnosticReportStore } from './diagnosticReport.js';
import { usePipelineStore } from './pipeline.js';
import { useTabsStore } from './tabsStore.js';
import EngineWorker from '../engine.worker.ts?worker';

export const useEngineStore = defineStore('engine', () => {
  /* ── Engine Worker — ONE instance shared by every open tab ─── */
  const engineWorker = new EngineWorker();

  /**
   * Latest request id issued PER TAB — distinct from
   * `useDiagnosticReportStore().runId`, which tracks "the latest response
   * worth showing in the diagnostic panels" (a concept that only makes
   * sense for whichever tab is currently focused). A background tab still
   * needs its own staleness gating (a superseded keystroke in that SAME
   * background tab shouldn't overwrite a newer one), independent of
   * whether it's the active tab at all.
   */
  const latestRequestId = new Map<string, number>();
  let nextId = 0;

  /* ── Worker Message Handler ─────────────────────────────── */
  engineWorker.onmessage = (e: MessageEvent<{
    id?: number;
    tabId: string;
    result?: DebugResult;
    error?: string;
    streamEvent?: DiagnosticEventInfo;
    stream?: boolean;
    unsolicited?: boolean;
  }>) => {
    const { id, tabId, result, error, streamEvent, stream, unsolicited } = e.data;
    const dr = useDiagnosticReportStore();
    const tabs = useTabsStore();
    const isActiveTab = tabs.isActive(tabId);

    // ── Unsolicited background refresh (some OTHER tab wrote a global
    // variable this tab's last-evaluated text depends on) — always cache,
    // never subject to id-based staleness (there's no in-flight request it
    // could be stale relative to), only push into the visible diagnostic
    // report if this happens to be the focused tab.
    if (unsolicited) {
      if (error) {
        useWorkersStore().logActivity('engine', `[${tabId}] ${error}`, true);
        return;
      }
      // A background refresh's OWN async resolution (an OSRS price, a
      // currency rate) settling after the refresh itself already returned
      // — patch just that line into the tab's cache, same as an
      // interactive stream's lineUpdate. Without this, a refresh that
      // caught a line mid-fetch (or regressed an already-resolved line
      // back to Pending, since the refresh's own re-run starts from an
      // empty query cache) had no way to ever resolve it: a background
      // refresh has no interactive keystroke to eventually re-run it.
      if (streamEvent?.lineUpdate) {
        tabs.patchCachedLineResult(tabId, streamEvent.lineUpdate);
        if (isActiveTab) {
          dr.patchLineResult(streamEvent.lineUpdate);
          dr.patchLineStages(streamEvent.lineUpdate.lineNumber, streamEvent.lineUpdate.stages);
        }
        return;
      }
      if (!result) return;
      tabs.cacheResult(tabId, result);
      if (isActiveTab) dr.setResult(result);
      return;
    }

    // Streaming events. A `lineUpdate` (an OSRS price, a currency rate, a
    // global variable resolving) is patched into the tab's CACHED result
    // unconditionally — active or backgrounded. Previously this was only
    // applied when `isActiveTab`, so a line that resolved while its tab
    // wasn't focused got silently dropped: the tab's cache stayed frozen at
    // "Pending" forever, and switching back to it later (which only pushes
    // the cache into the diagnostic report, no re-evaluation) kept showing
    // stale Pending lines even though the value had long since resolved.
    // Only the ACTIVE tab additionally pushes into the live StreamStore/Perf
    // telemetry, since those are single, non-tab-keyed stores that only make
    // sense for whichever tab is currently focused.
    if (stream && streamEvent) {
      // Drop events for a superseded request in this tab (the worker aborts
      // a tab's previous streaming session before starting a new one for
      // that SAME tab, but an in-flight message can still race the abort).
      if (id !== latestRequestId.get(tabId)) return;

      if (streamEvent.lineUpdate) {
        tabs.patchCachedLineResult(tabId, streamEvent.lineUpdate);
        if (isActiveTab) {
          dr.patchLineResult(streamEvent.lineUpdate);
          dr.patchLineStages(streamEvent.lineUpdate.lineNumber, streamEvent.lineUpdate.stages);
        }
      }

      if (isActiveTab) {
        useStreamStore().addEvent(streamEvent);
        // Fold async settle time (a currency/OSRS price fetch resolving or
        // failing) into the Perf tab's "Total" as it actually happens — see
        // recordAsyncElapsed()'s doc comment for why there's no single
        // "stream settled" moment to wait for instead.
        if (streamEvent.type === 'async_resolved' || streamEvent.type === 'async_error') {
          dr.recordAsyncElapsed(streamEvent.elapsedNs);
        }
      }
      return;
    }

    // Per-tab staleness: a response for a superseded request in THIS tab
    // (regardless of whether this tab is currently focused).
    if (id !== latestRequestId.get(tabId)) {
      const ws = useWorkersStore();
      ws.engine.msgCount++;
      ws.engine.queueDepth = Math.max(0, ws.engine.queueDepth - 1);
      return;
    }

    // Update workers telemetry
    const ws = useWorkersStore();
    const rtt = window.performance.now() - ws.engine.lastRunTime;
    ws.engine.roundTripTimes.push(rtt);
    if (ws.engine.roundTripTimes.length > 20) ws.engine.roundTripTimes.shift();
    ws.engine.msgCount++;
    ws.engine.queueDepth = Math.max(0, ws.engine.queueDepth - 1);
    ws.updateEngineTelemetry();

    if (isActiveTab) dr.setStatus('ready');

    // Reset pipeline cursor tracking on new result (active tab only —
    // background tabs don't drive the Pipeline tab's selection state).
    if (isActiveTab) usePipelineStore().resetDropdownOverride();

    if (error) {
      ws.logActivity('engine', error, true);
      return;
    }
    if (!result) return;

    // Cache for every tab so switching focus later shows fresh data
    // immediately without a re-run; only the ACTIVE tab also populates the
    // live diagnostic report right now.
    tabs.cacheResult(tabId, result);
    if (isActiveTab) {
      dr.setResult(result);
      useStreamStore().finalize();
      ws.updateQueryCacheTelemetry(result.queryCache ?? []);
      ws.updateQueryClientConfig(result.queryClientConfig);
    }
  };

  /* ── Actions ────────────────────────────────────────────── */
  const runTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

  function evaluate(expression: string, tabId: string): void {
    const existing = runTimeouts.get(tabId);
    if (existing) clearTimeout(existing);

    runTimeouts.set(tabId, setTimeout(() => {
      runTimeouts.delete(tabId);
      const isActiveTab = useTabsStore().isActive(tabId);

      if (!expression) {
        engineWorker.postMessage({ id: latestRequestId.get(tabId) ?? 0, tabId, abort: true });
        return;
      }

      if (isActiveTab) {
        useStreamStore().reset();
        useDiagnosticReportStore().setStatus('busy');
        useDiagnosticReportStore().incrementRunId();
      }

      const id = nextId++;
      latestRequestId.set(tabId, id);

      const ws = useWorkersStore();
      ws.engine.queueDepth++;
      ws.engine.lastRunTime = window.performance.now();
      ws.logActivity('engine', `Enqueued run #${id} [${tabId}]: ${expression.slice(0, 40)}${expression.length > 40 ? '…' : ''}`);
      ws.updateEngineTelemetry();

      // The active tab's request drives the live diagnostic stream; a
      // background tab's own edits still get evaluated (so IT stays
      // current for when the user switches to it) but don't need the
      // streaming event overhead.
      engineWorker.postMessage({ id, tabId, expression, stream: isActiveTab });
    }, 150));
  }

  function abort(tabId: string): void {
    engineWorker.postMessage({ id: latestRequestId.get(tabId) ?? 0, tabId, abort: true });
    const existing = runTimeouts.get(tabId);
    if (existing) {
      clearTimeout(existing);
      runTimeouts.delete(tabId);
    }
    if (useTabsStore().isActive(tabId)) {
      useDiagnosticReportStore().setStatus('ready');
    }
  }

  return {
    evaluate,
    abort,
  };
});
