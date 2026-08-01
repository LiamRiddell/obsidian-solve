import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  DebugResult,
  Token,
  LineResult,
  OpcodeInfo,
  ConstantInfo,
  PerformanceStats,
  LineStats,
  VmTraceStep,
  PageHeatmapEntry,
  ArenaStats,
  QueryCacheEntry,
  DagSnapshot,
} from '@bridge/engine';
import type { PipelineStageResult } from '@solve-js/types/DiagnosticPipelineResult';
import type { BatcherMetrics, CheckpointSnapshot, CacheSnapshot } from '@solve-js/engine/ExpressionEngine';
import type { PipelineTelemetry } from '@solve-js/telemetry/AllocationTracker';

/** Maximum number of performance history entries to keep. */
const MAX_HISTORY = 50;

/** Per-evaluation cache metrics for trend charts. */
export interface CacheHistoryEntry {
  /** Monotonic run number. */
  runId: number;
  /** Number of lines that hit the bytecode cache. */
  cacheHits: number;
  /** Number of lines that missed the cache (freshly compiled). */
  cacheMisses: number;
  /** Total bytecode cache entries after this evaluation. */
  bytecodeCacheSize: number;
}

export const useDiagnosticReportStore = defineStore('diagnosticReport', () => {
  /* ══════════════════════════════════════════════════════════════
     Result-derived State
     ══════════════════════════════════════════════════════════════ */

  /** Engine evaluation status. */
  const status = ref<'ready' | 'busy' | 'error'>('ready');

  /** Monotonic run counter — incremented per evaluation. */
  const runId = ref(0);

  /** The full DebugResult from the engine worker. */
  const result = ref<DebugResult | null>(null);

  /** Structured pipeline stages from the engine's DiagnosticPipelineResult — last evaluated line only. */
  const stages = ref<PipelineStageResult[]>([]);

  /** Structured pipeline stages per line number, so the Pipeline tab can show any selected line's real stages. */
  const stagesByLine = ref<Record<number, PipelineStageResult[]>>({});

  /** Per-line evaluation results. */
  const lineResults = ref<LineResult[]>([]);

  /** Raw tokens from the last evaluation. */
  const rawTokens = ref<Token[]>([]);

  /** Compiled opcodes from the last evaluation. */
  const opcodes = ref<any[]>([]);

  /** Constants table from the compiled program. */
  const constants = ref<ConstantInfo[]>([]);

  /** Variable names extracted from the token stream. */
  const variables = ref<string[]>([]);

  /** Per-line performance timings. */
  const lineStats = ref<LineStats[]>([]);

  /** Aggregate performance stats for the current evaluation. */
  const stats = ref<PerformanceStats | null>(null);

  /** Whether the last result was from the bytecode cache. */
  const wasCached = ref(false);

  /** Whether any line is pending async resolution. */
  const hasAsync = ref(false);

  /** DAG dependency graph snapshot. */
  const dagSnapshot = ref<DagSnapshot>({
    consumers: {},
    writes: {},
    reads: {},
    dataSourceDeps: {},
    dataSourceConsumers: {},
  });

  /** VM checkpoints snapshot. */
  const checkpoints = ref<CheckpointSnapshot[]>([]);

  /** Batcher metrics for async resolution. */
  const batcherMetrics = ref<BatcherMetrics>({
    pendingCount: 0,
    dedupCount: 0,
    workerOffloadCount: 0,
    listenerCount: 0,
  });

  /** Cache snapshot (bytecode, line cache, async cache). */
  const cacheSnapshot = ref<CacheSnapshot>({
    bytecode: [],
    lineCache: [],
    asyncCache: [],
  });

  /** Page heatmap entries. */
  const pageHeatmap = ref<PageHeatmapEntry[]>([]);

  /** TanStack Query cache entries. */
  const queryCache = ref<QueryCacheEntry[]>([]);

  /** Allocation tracker pipeline telemetry. */
  const pipelineTelemetry = ref<PipelineTelemetry | null>(null);

  /** ValueArena stats from bump-allocator. */
  const arenaStats = ref<ArenaStats>({ enabled: false, usage: 0, capacity: 0 });

  /** Registered parselet registry from the engine (prefix + infix). */
  const parseletRegistry = ref<{ prefix: Array<{ tokenType: string; bindingPower: number; category?: string }>; infix: Array<{ tokenType: string; leftBindingPower: number; rightBindingPower: number; category?: string }> }>({ prefix: [], infix: [] });

  /** VM trace steps from the last evaluation. */
  const vmTrace = ref<VmTraceStep[]>([]);

  /** Errors from the last evaluation. */
  const errors = ref<string[]>([]);

  /** Parselet info from the last evaluation. */
  const parselets = ref<any[]>([]);

  /* ══════════════════════════════════════════════════════════════
     Performance History
     ══════════════════════════════════════════════════════════════ */

  /** Rolling history of aggregate performance stats (last N evaluations). */
  const statsHistory = ref<PerformanceStats[]>([]);

  /** Rolling history of cache metrics per evaluation (last N evaluations). */
  const cacheHistory = ref<CacheHistoryEntry[]>([]);

  /* ══════════════════════════════════════════════════════════════
     Derived Computed Properties
     ══════════════════════════════════════════════════════════════ */

  /** Total raw token count (pre-normalization). */
  const tokenCount = computed(() => rawTokens.value.length);

  /** Total opcode count in the compiled program. */
  const opcodeCount = computed(() => opcodes.value.length);

  /** Number of pipeline stages (or 8 as fallback for placeholder UI). */
  const stageCount = computed(() => stages.value.length || 8);

  /** Cache status: 'hit', 'miss', or '—'. */
  const cacheStatus = computed(() =>
    wasCached.value ? 'hit' : stages.value.length > 0 ? 'miss' : '—',
  );

  /** Async status: 'yes' or 'no'. */
  const asyncStatus = computed(() => (hasAsync.value ? 'yes' : 'no'));

  /** Whether the evaluation produced errors. */
  const hasErrors = computed(() => errors.value.length > 0);

  /** Reconstructed expression from line results. */
  const expression = computed(() => {
    if (!result.value) return '';
    return lineResults.value.map((lr) => lr.expression).join('\n');
  });

  /* ══════════════════════════════════════════════════════════════
     Actions
     ══════════════════════════════════════════════════════════════ */

  /**
   * Patch a single line's result after it resolves asynchronously
   * (an OSRS price, a currency rate, ...) — called by the engine store's
   * onmessage handler when a stream event carries a `lineUpdate`.
   *
   * The worker's engine re-evaluates the line correctly as soon as the
   * fetch resolves, but that only reaches the diagnostics Stream tab as a
   * log line unless something also updates the ACTUAL rendered state here.
   * Without this, a line shows "Pending" forever even after its data has
   * successfully arrived — the editor and Output tab were never told.
   *
   * Replaces `result`/`lineResults` with new array/object references
   * (rather than mutating in place) so Vue's `watch(() => dr.result, ...)`
   * in EditorPane fires — a shallow watch does not see in-place mutation
   * of a nested array element.
   */
  function patchLineResult(update: { lineNumber: number; result: string; type: string; timedOut?: boolean }): void {
    if (!result.value) return;
    const nextLineResults = result.value.lineResults.map((lr) =>
      lr.lineNumber === update.lineNumber
        ? { ...lr, result: update.result, type: update.type, timedOut: update.timedOut, error: undefined }
        : lr
    );
    result.value = { ...result.value, lineResults: nextLineResults };
    lineResults.value = nextLineResults;
    hasAsync.value = nextLineResults.some((lr) => lr.type === 'Pending');
  }

  /**
   * Patch a single line's pipeline stages after an async resolution
   * (an OSRS price, a currency rate, ...) re-evaluates it — called
   * alongside `patchLineResult` when the stream event carries fresh
   * stage data.
   *
   * Without this, the Pipeline tab kept showing the original line's
   * "pending" Async Preflight stage (and no VM Execute/Result stages)
   * forever, even after the value had actually resolved, because
   * `patchLineResult` only ever updated `lineResults` — never the
   * per-line stage map this store exposes.
   *
   * Replaces `stagesByLine` with a new object (rather than mutating the
   * existing one in place) so Vue's reactivity — which tracks the
   * object reference, not deep mutation of a plain object handed back
   * from a worker message — actually notices the change.
   */
  function patchLineStages(lineNumber: number, newStages: PipelineStageResult[] | undefined): void {
    if (!newStages) return;
    stagesByLine.value = { ...stagesByLine.value, [lineNumber]: newStages };
  }

  /**
   * Folds async resolution wall-time (a currency rate fetch, an OSRS price
   * lookup, ...) into `stats.totalTime` as it actually happens.
   *
   * `stats` is populated once from the synchronous portion of evaluation
   * (setResult()) and never otherwise updated — so before this, "Total" on
   * the Perf tab only ever reflected lex/parse/compile/VM-until-first-
   * Pending, never how long the user actually waited to see a settled
   * result. There's no clean single "the stream is now fully settled"
   * signal to wait for (the underlying stream can legitimately stay open
   * for further edits), so this takes the simpler, always-eventually-
   * correct approach: called with each async_resolved/async_error event's
   * own `elapsedNs` (relative to the same evaluation pass's start) as it
   * arrives, and only ever grows `totalTime` — never shrinks it — so the
   * displayed figure converges to the true settle time as async work
   * actually completes, with no explicit "done" detection needed.
   */
  function recordAsyncElapsed(elapsedNs: number): void {
    if (!stats.value || elapsedNs <= stats.value.totalTime) return;
    stats.value = { ...stats.value, totalTime: elapsedNs };
  }

  /**
   * Populate ALL diagnostic data from a DebugResult.
   * This is the single entry point — called by the engine store's
   * onmessage handler. Every UI component reads from this store.
   */
  function setResult(r: DebugResult): void {
    result.value = r;
    stages.value = r.pipelineStages ?? [];
    stagesByLine.value = r.pipelineStagesByLine ?? {};
    lineResults.value = r.lineResults ?? [];
    rawTokens.value = r.rawTokens ?? [];
    opcodes.value = r.opcodes ?? [];
    constants.value = r.constants ?? [];
    variables.value = r.variables ?? [];
    lineStats.value = r.lineStats ?? [];
    stats.value = r.stats ?? null;
    wasCached.value =
      !(r.parselets?.length ?? 0) && (r.rawTokens?.length ?? 0) > 0;
    hasAsync.value = (r.lineResults ?? []).some((lr) => lr.type === 'Pending');
    dagSnapshot.value = r.dagSnapshot ?? {
      consumers: {},
      writes: {},
      reads: {},
      dataSourceDeps: {},
      dataSourceConsumers: {},
    };
    checkpoints.value = r.checkpoints ?? [];
    batcherMetrics.value = r.batcherMetrics ?? {
      pendingCount: 0,
      dedupCount: 0,
      workerOffloadCount: 0,
      listenerCount: 0,
    };
    cacheSnapshot.value = r.cacheSnapshot ?? {
      bytecode: [],
      lineCache: [],
      asyncCache: [],
    };
    pageHeatmap.value = r.pageHeatmap ?? [];
    queryCache.value = r.queryCache ?? [];
    pipelineTelemetry.value = r.pipelineTelemetry ?? null;
    arenaStats.value = r.arenaStats ?? { enabled: false, usage: 0, capacity: 0 };
    vmTrace.value = r.vmTrace ?? [];
    errors.value = r.errors ?? [];
    parselets.value = r.parselets ?? [];
    parseletRegistry.value = r.parseletRegistry ?? { prefix: [], infix: [] };

    // Accumulate performance history
    if (r.stats) {
      statsHistory.value.push({ ...r.stats });
      if (statsHistory.value.length > MAX_HISTORY) {
        statsHistory.value.shift();
      }
    }

    // Accumulate cache history for trend charts
    {
      const hits = (r.lineResults ?? []).filter(lr => lr.wasCached).length;
      const misses = (r.lineResults ?? []).filter(lr => !lr.wasCached).length;
      const bytecodeSize = r.cacheSnapshot?.bytecode?.length ?? 0;
      cacheHistory.value.push({
        runId: runId.value,
        cacheHits: hits,
        cacheMisses: misses,
        bytecodeCacheSize: bytecodeSize,
      });
      if (cacheHistory.value.length > MAX_HISTORY) {
        cacheHistory.value.shift();
      }
    }
  }

  /** Set engine status (called by engine store's evaluate/abort). */
  function setStatus(s: 'ready' | 'busy' | 'error'): void {
    status.value = s;
  }

  /** Increment run ID (called by engine store's evaluate). */
  function incrementRunId(): void {
    runId.value++;
  }

  return {
    // State
    status,
    runId,
    result,
    stages,
    stagesByLine,
    lineResults,
    rawTokens,
    opcodes,
    constants,
    variables,
    lineStats,
    stats,
    wasCached,
    hasAsync,
    dagSnapshot,
    checkpoints,
    batcherMetrics,
    cacheSnapshot,
    pageHeatmap,
    queryCache,
    pipelineTelemetry,
    arenaStats,
    vmTrace,
    errors,
    parselets,
    parseletRegistry,
    statsHistory,
    cacheHistory,
    // Derived
    tokenCount,
    opcodeCount,
    stageCount,
    cacheStatus,
    asyncStatus,
    hasErrors,
    expression,
    // Actions
    setResult,
    patchLineResult,
    patchLineStages,
    recordAsyncElapsed,
    setStatus,
    incrementRunId,
  };
});
