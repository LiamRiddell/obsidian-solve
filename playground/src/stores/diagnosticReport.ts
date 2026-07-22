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
} from '../engine.js';
import type { PipelineStageResult } from '@/solve-js/src/types/DiagnosticPipelineResult';
import type { BatcherMetrics, CheckpointSnapshot } from '@/solve-js/src/engine/ExpressionEngine';
import type { PipelineTelemetry } from '@/solve-js/src/telemetry/AllocationTracker';

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

  /** Structured pipeline stages from the engine's DiagnosticPipelineResult. */
  const stages = ref<PipelineStageResult[]>([]);

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
   * Populate ALL diagnostic data from a DebugResult.
   * This is the single entry point — called by the engine store's
   * onmessage handler. Every UI component reads from this store.
   */
  function setResult(r: DebugResult): void {
    result.value = r;
    stages.value = r.pipelineStages ?? [];
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
    setStatus,
    incrementRunId,
  };
});
