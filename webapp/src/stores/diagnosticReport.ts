import { create } from "zustand"
import type {
  DebugResult,
  Token,
  LineResult,
  ConstantInfo,
  OpcodeInfo,
  PerformanceStats,
  LineStats,
  VmTraceStep,
  PageHeatmapEntry,
  ArenaStats,
  QueryCacheEntry,
  DagSnapshot,
} from "@bridge/engine"
import type { PipelineStageResult } from "@solve-js/types/DiagnosticPipelineResult"
import type { BatcherMetrics, CheckpointSnapshot, CacheSnapshot } from "@solve-js/engine/ExpressionEngine"
import type { PipelineTelemetry } from "@solve-js/telemetry/AllocationTracker"

/** Maximum number of performance history entries to keep. */
const MAX_HISTORY = 50

/** Per-evaluation cache metrics for trend charts. */
export interface CacheHistoryEntry {
  /** Monotonic run number. */
  runId: number
  /** Number of lines that hit the bytecode cache. */
  cacheHits: number
  /** Number of lines that missed the cache (freshly compiled). */
  cacheMisses: number
  /** Total bytecode cache entries after this evaluation. */
  bytecodeCacheSize: number
}

const EMPTY_DAG_SNAPSHOT: DagSnapshot = {
  consumers: {},
  writes: {},
  reads: {},
  dataSourceDeps: {},
  dataSourceConsumers: {},
}

const EMPTY_BATCHER_METRICS: BatcherMetrics = {
  pendingCount: 0,
  dedupCount: 0,
  workerOffloadCount: 0,
  listenerCount: 0,
}

const EMPTY_CACHE_SNAPSHOT: CacheSnapshot = { bytecode: [], lineCache: [], asyncCache: [] }
const EMPTY_ARENA_STATS: ArenaStats = { enabled: false, usage: 0, capacity: 0 }
const EMPTY_PARSELET_REGISTRY: DebugResult["parseletRegistry"] = { prefix: [], infix: [] }

interface DiagnosticReportState {
  /* Result-derived state */
  status: "ready" | "busy" | "error"
  /** Monotonic run counter — incremented per evaluation. */
  runId: number
  result: DebugResult | null
  /** Structured pipeline stages — last evaluated line only. */
  stages: PipelineStageResult[]
  /** Structured pipeline stages per line number, so the Pipeline tab can show any selected line's real stages. */
  stagesByLine: Record<number, PipelineStageResult[]>
  lineResults: LineResult[]
  rawTokens: Token[]
  opcodes: OpcodeInfo[]
  constants: ConstantInfo[]
  variables: string[]
  lineStats: LineStats[]
  stats: PerformanceStats | null
  wasCached: boolean
  hasAsync: boolean
  dagSnapshot: DagSnapshot
  checkpoints: CheckpointSnapshot[]
  batcherMetrics: BatcherMetrics
  cacheSnapshot: CacheSnapshot
  pageHeatmap: PageHeatmapEntry[]
  queryCache: QueryCacheEntry[]
  pipelineTelemetry: PipelineTelemetry | null
  arenaStats: ArenaStats
  parseletRegistry: DebugResult["parseletRegistry"]
  vmTrace: VmTraceStep[]
  errors: string[]
  parselets: DebugResult["parselets"]

  /* Performance history */
  statsHistory: PerformanceStats[]
  cacheHistory: CacheHistoryEntry[]

  /* Actions */
  /** Patch a single line's result after it resolves asynchronously (an OSRS price, a currency rate, ...). */
  patchLineResult: (
    update: Pick<
      LineResult,
      "lineNumber" | "result" | "type" | "timedOut" | "error" | "errorCode" | "errorCategory" | "errorExpected" | "errorFound" | "errorSuggestion" | "errorRecoverable"
    >,
  ) => void
  patchLineStages: (lineNumber: number, newStages: PipelineStageResult[] | undefined) => void
  /** Folds async resolution wall-time into stats.totalTime as it actually happens. */
  recordAsyncElapsed: (elapsedNs: number) => void
  /**
   * Refresh the Cache tab's async-related panels after a streamed async
   * resolution — `cacheSnapshot`/`queryCache` otherwise only ever get set
   * once from the INITIAL `setResult`, taken before any async data source
   * had resolved, so the Async Resolver Cache / Query Cache (TanStack)
   * panels would stay stuck showing "fetching" / in-flight forever even
   * after `patchLineResult` has already updated the visible line value.
   */
  patchCacheUpdate: (cacheSnapshot: CacheSnapshot, queryCache: QueryCacheEntry[]) => void
  /** Populate ALL diagnostic data from a DebugResult — the single entry point, called by the engine store's onmessage handler. */
  setResult: (r: DebugResult) => void
  setStatus: (s: "ready" | "busy" | "error") => void
  incrementRunId: () => void
}

export const useDiagnosticReportStore = create<DiagnosticReportState>((set, get) => ({
  status: "ready",
  runId: 0,
  result: null,
  stages: [],
  stagesByLine: {},
  lineResults: [],
  rawTokens: [],
  opcodes: [],
  constants: [],
  variables: [],
  lineStats: [],
  stats: null,
  wasCached: false,
  hasAsync: false,
  dagSnapshot: EMPTY_DAG_SNAPSHOT,
  checkpoints: [],
  batcherMetrics: EMPTY_BATCHER_METRICS,
  cacheSnapshot: EMPTY_CACHE_SNAPSHOT,
  pageHeatmap: [],
  queryCache: [],
  pipelineTelemetry: null,
  arenaStats: EMPTY_ARENA_STATS,
  parseletRegistry: EMPTY_PARSELET_REGISTRY,
  vmTrace: [],
  errors: [],
  parselets: [],
  statsHistory: [],
  cacheHistory: [],

  patchLineResult: (update) => {
    const { result } = get()
    if (!result) return
    const nextLineResults = result.lineResults.map((lr) =>
      lr.lineNumber === update.lineNumber
        ? {
            ...lr,
            result: update.result,
            type: update.type,
            timedOut: update.timedOut,
            // Explicitly cleared (not just left stale) when this update has
            // no error — a line moving from "errored" to "resolved
            // successfully" on re-evaluation must drop its old error state,
            // not just overwrite result/type and leave a stale error badge.
            error: update.error,
            errorCode: update.errorCode,
            errorCategory: update.errorCategory,
            errorExpected: update.errorExpected,
            errorFound: update.errorFound,
            errorSuggestion: update.errorSuggestion,
            errorRecoverable: update.errorRecoverable,
          }
        : lr,
    )
    set({
      result: { ...result, lineResults: nextLineResults },
      lineResults: nextLineResults,
      hasAsync: nextLineResults.some((lr) => lr.type === "Pending"),
    })
  },

  patchLineStages: (lineNumber, newStages) => {
    if (!newStages) return
    set((s) => ({ stagesByLine: { ...s.stagesByLine, [lineNumber]: newStages } }))
  },

  recordAsyncElapsed: (elapsedNs) => {
    const { stats } = get()
    if (!stats || elapsedNs <= stats.totalTime) return
    set({ stats: { ...stats, totalTime: elapsedNs } })
  },

  patchCacheUpdate: (cacheSnapshot, queryCache) => {
    const { result } = get()
    set({
      cacheSnapshot,
      queryCache,
      result: result ? { ...result, cacheSnapshot, queryCache } : result,
    })
  },

  setResult: (r) => {
    const wasCached = !(r.parselets?.length ?? 0) && (r.rawTokens?.length ?? 0) > 0
    const hasAsync = (r.lineResults ?? []).some((lr) => lr.type === "Pending")

    set((s) => {
      const statsHistory = r.stats ? [...s.statsHistory, { ...r.stats }].slice(-MAX_HISTORY) : s.statsHistory

      const hits = (r.lineResults ?? []).filter((lr) => lr.wasCached).length
      const misses = (r.lineResults ?? []).filter((lr) => !lr.wasCached).length
      const bytecodeSize = r.cacheSnapshot?.bytecode?.length ?? 0
      const cacheHistory = [
        ...s.cacheHistory,
        { runId: s.runId, cacheHits: hits, cacheMisses: misses, bytecodeCacheSize: bytecodeSize },
      ].slice(-MAX_HISTORY)

      return {
        result: r,
        stages: r.pipelineStages ?? [],
        stagesByLine: r.pipelineStagesByLine ?? {},
        lineResults: r.lineResults ?? [],
        rawTokens: r.rawTokens ?? [],
        opcodes: r.opcodes ?? [],
        constants: r.constants ?? [],
        variables: r.variables ?? [],
        lineStats: r.lineStats ?? [],
        stats: r.stats ?? null,
        wasCached,
        hasAsync,
        dagSnapshot: r.dagSnapshot ?? EMPTY_DAG_SNAPSHOT,
        checkpoints: r.checkpoints ?? [],
        batcherMetrics: r.batcherMetrics ?? EMPTY_BATCHER_METRICS,
        cacheSnapshot: r.cacheSnapshot ?? EMPTY_CACHE_SNAPSHOT,
        pageHeatmap: r.pageHeatmap ?? [],
        queryCache: r.queryCache ?? [],
        pipelineTelemetry: r.pipelineTelemetry ?? null,
        arenaStats: r.arenaStats ?? EMPTY_ARENA_STATS,
        vmTrace: r.vmTrace ?? [],
        errors: r.errors ?? [],
        parselets: r.parselets ?? [],
        parseletRegistry: r.parseletRegistry ?? EMPTY_PARSELET_REGISTRY,
        statsHistory,
        cacheHistory,
      }
    })
  },

  setStatus: (s) => set({ status: s }),
  incrementRunId: () => set((s) => ({ runId: s.runId + 1 })),
}))

/* ── Derived helpers (mirror the Pinia store's `computed`s) ─────────────── */

export function tokenCount(s: DiagnosticReportState): number {
  return s.rawTokens.length
}
export function opcodeCount(s: DiagnosticReportState): number {
  return s.opcodes.length
}
export function stageCount(s: DiagnosticReportState): number {
  return s.stages.length || 8
}
export function cacheStatus(s: DiagnosticReportState): "hit" | "miss" | "—" {
  return s.wasCached ? "hit" : s.stages.length > 0 ? "miss" : "—"
}
export function asyncStatus(s: DiagnosticReportState): "yes" | "no" {
  return s.hasAsync ? "yes" : "no"
}
export function hasErrors(s: DiagnosticReportState): boolean {
  return s.errors.length > 0
}
export function expression(s: DiagnosticReportState): string {
  if (!s.result) return ""
  return s.lineResults.map((lr) => lr.expression).join("\n")
}
