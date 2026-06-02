import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { DebugResult, DiagnosticEventInfo } from '../engine.js';
import { useStreamStore } from './stream.js';
import { useWorkersStore } from './workers.js';
import { usePipelineStore } from './pipeline.js';
import EngineWorker from '../engine.worker.ts?worker';

export const useEngineStore = defineStore('engine', () => {
  /* ── State ──────────────────────────────────────────────── */
  const status = ref<'ready' | 'busy' | 'error'>('ready');
  const runId = ref(0);
  const currentResult = ref<DebugResult | null>(null);

  /* ── Engine Worker ──────────────────────────────────────── */
  const engineWorker = new EngineWorker();

  /* ── Worker Message Handler ─────────────────────────────── */
  engineWorker.onmessage = (e: MessageEvent<{
    id: number;
    result?: DebugResult;
    error?: string;
    streamEvent?: DiagnosticEventInfo;
    stream?: boolean;
    branchKey?: string;
  }>) => {
    const { id, result, error, streamEvent, stream, branchKey } = e.data;

    // Streaming events are routed by branchKey:
    //   "stream"      → StreamStore (primary consumer, existing behavior)
    //   "diagnostics" → PipelineStore (secondary consumer, tee branch)
    if (stream && streamEvent && id === runId.value) {
      if (branchKey === 'diagnostics') {
        usePipelineStore().addDiagnosticEvent(streamEvent);
      } else {
        useStreamStore().addEvent(streamEvent);
      }
      return;
    }

    if (id !== runId.value) {
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

    status.value = 'ready';

    // Reset pipeline cursor tracking on new result
    usePipelineStore().resetDropdownOverride();

    if (error) {
      ws.logActivity('engine', error, true);
      return;
    }
    if (!result) return;

    currentResult.value = result;

    // Finalize streaming: initial result complete, live events may still arrive
    useStreamStore().finalize();

    // Update DQ telemetry
    ws.updateDqTelemetry(result);
  };

  /* ── Actions ────────────────────────────────────────────── */
  let runTimeout: ReturnType<typeof setTimeout> | null = null;

  function evaluate(expression: string): void {
    if (runTimeout) clearTimeout(runTimeout);
    runTimeout = setTimeout(() => {
      if (!expression) {
        engineWorker.postMessage({ id: runId.value, abort: true });
        return;
      }

      // Reset stream events — both primary and tee'd diagnostic branches
      useStreamStore().reset();
      usePipelineStore().resetDiagnosticEvents();

      status.value = 'busy';
      runId.value++;
      const ws = useWorkersStore();
      ws.engine.queueDepth++;
      ws.engine.lastRunTime = window.performance.now();
      ws.logActivity('engine', `Enqueued run #${runId.value}: ${expression.slice(0, 40)}${expression.length > 40 ? '…' : ''}`);
      ws.updateEngineTelemetry();

      engineWorker.postMessage({ id: runId.value, expression, stream: true });
    }, 150);
  }

  function abort(): void {
    engineWorker.postMessage({ id: runId.value, abort: true });
    if (runTimeout) {
      clearTimeout(runTimeout);
      runTimeout = null;
    }
    status.value = 'ready';
  }

  /* ── Getters ────────────────────────────────────────────── */
  const hasErrors = computed(() =>
    (currentResult.value?.errors?.length ?? 0) > 0,
  );

  const lineResults = computed(() =>
    currentResult.value?.lineResults ?? [],
  );

  const expression = computed(() => {
    if (!currentResult.value) return '';
    return lineResults.value.map(lr => lr.expression).join('\n');
  });

  return {
    status,
    runId,
    currentResult,
    evaluate,
    abort,
    hasErrors,
    lineResults,
    expression,
  };
});
