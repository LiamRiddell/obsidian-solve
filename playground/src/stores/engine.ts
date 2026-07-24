import { defineStore } from 'pinia';
import type { DebugResult, DiagnosticEventInfo } from '../engine.js';
import { useStreamStore } from './stream.js';
import { useWorkersStore } from './workers.js';
import { useDiagnosticReportStore } from './diagnosticReport.js';
import { usePipelineStore } from './pipeline.js';
import EngineWorker from '../engine.worker.ts?worker';

export const useEngineStore = defineStore('engine', () => {
  /* ── Engine Worker ──────────────────────────────────────── */
  const engineWorker = new EngineWorker();

  /* ── Worker Message Handler ─────────────────────────────── */
  engineWorker.onmessage = (e: MessageEvent<{
    id: number;
    result?: DebugResult;
    error?: string;
    streamEvent?: DiagnosticEventInfo;
    stream?: boolean;
  }>) => {
    const { id, result, error, streamEvent, stream } = e.data;
    const dr = useDiagnosticReportStore();

    // Streaming events — populate the StreamStore directly.
    // No more tee() branch routing; the single event stream is forwarded
    // from the worker and popped into the store here.
    if (stream && streamEvent && id === dr.runId) {
      useStreamStore().addEvent(streamEvent);
      // If this event carries a freshly resolved line value (an OSRS
      // price, a currency rate that finished fetching), patch the actual
      // rendered result too — logging it to the Stream tab alone left the
      // editor and Output tab showing "Pending" forever even after the
      // underlying data had successfully arrived.
      if (streamEvent.lineUpdate) {
        dr.patchLineResult(streamEvent.lineUpdate);
        dr.patchLineStages(streamEvent.lineUpdate.lineNumber, streamEvent.lineUpdate.stages);
      }
      return;
    }

    if (id !== dr.runId) {
      // Stale response — update telemetry only
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

    dr.setStatus('ready');

    // Reset pipeline cursor tracking on new result
    usePipelineStore().resetDropdownOverride();

    if (error) {
      ws.logActivity('engine', error, true);
      return;
    }
    if (!result) return;

    // ── Populate diagnostic report store — single source of truth ──
    dr.setResult(result);

    // Finalize streaming: initial result complete, live events may still arrive
    useStreamStore().finalize();

    // Update Query Cache telemetry
    ws.updateQueryCacheTelemetry(result.queryCache ?? []);
    ws.updateQueryClientConfig(result.queryClientConfig);
  };

  /* ── Actions ────────────────────────────────────────────── */
  let runTimeout: ReturnType<typeof setTimeout> | null = null;

  function evaluate(expression: string): void {
    if (runTimeout) clearTimeout(runTimeout);
    runTimeout = setTimeout(() => {
      if (!expression) {
        engineWorker.postMessage({ id: useDiagnosticReportStore().runId, abort: true });
        return;
      }

      // Reset stream events
      useStreamStore().reset();

      useDiagnosticReportStore().setStatus('busy');
      useDiagnosticReportStore().incrementRunId();
      const ws = useWorkersStore();
      ws.engine.queueDepth++;
      ws.engine.lastRunTime = window.performance.now();
      ws.logActivity('engine', `Enqueued run #${useDiagnosticReportStore().runId}: ${expression.slice(0, 40)}${expression.length > 40 ? '…' : ''}`);
      ws.updateEngineTelemetry();

      engineWorker.postMessage({ id: useDiagnosticReportStore().runId, expression, stream: true });
    }, 150);
  }

  function abort(): void {
    engineWorker.postMessage({ id: useDiagnosticReportStore().runId, abort: true });
    if (runTimeout) {
      clearTimeout(runTimeout);
      runTimeout = null;
    }
    useDiagnosticReportStore().setStatus('ready');
  }

  return {
    evaluate,
    abort,
  };
});
