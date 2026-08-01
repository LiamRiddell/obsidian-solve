import { create } from "zustand"
import type { QueryClientConfig } from "@bridge/engine"

/** Worker activity log entry. */
export interface WorkerLogEntry {
  ts: number
  source: "engine" | "query-cache"
  msg: string
  error?: boolean
}

const MAX_LOG_ENTRIES = 100
const MAX_RTT_HISTORY = 20

interface EngineMetrics {
  msgCount: number
  queueDepth: number
  /** performance.now() timestamp of last run enqueue */
  lastRunTime: number
  roundTripTimes: number[]
}

interface QueryCacheMetrics {
  totalQueries: number
  freshQueries: number
  staleQueries: number
  fetchingQueries: number
  errorQueries: number
  lastActivityTs: number
}

interface WorkersState {
  engine: EngineMetrics
  queryCache: QueryCacheMetrics
  queryClientConfig: QueryClientConfig
  activityLog: WorkerLogEntry[]

  logActivity: (source: "engine" | "query-cache", msg: string, isError?: boolean) => void
  updateEngineTelemetry: () => void
  updateQueryCacheTelemetry: (entries: { status: string }[]) => void
  updateQueryClientConfig: (config: QueryClientConfig) => void
}

export const useWorkersStore = create<WorkersState>((set, get) => ({
  engine: { msgCount: 0, queueDepth: 0, lastRunTime: 0, roundTripTimes: [] },
  queryCache: { totalQueries: 0, freshQueries: 0, staleQueries: 0, fetchingQueries: 0, errorQueries: 0, lastActivityTs: 0 },
  queryClientConfig: { staleTime: 0, gcTime: 0 },
  activityLog: [],

  logActivity: (source, msg, isError = false) => {
    set((s) => {
      const log = s.activityLog.slice()
      log.push({ ts: Date.now(), source, msg, error: isError })
      if (log.length > MAX_LOG_ENTRIES) log.shift()

      // Deduplicate consecutive identical entries
      if (log.length >= 2) {
        const prev = log[log.length - 2]
        const last = log[log.length - 1]
        if (prev.source === last.source && prev.msg === last.msg) {
          prev.msg = last.msg + " (×2)"
          log.pop()
          return { activityLog: log }
        }
        const counterMatch = prev.msg.match(/\s+\(×(\d+)\)$/)
        if (counterMatch && prev.source === last.source && prev.msg.slice(0, counterMatch.index!) === last.msg) {
          const count = parseInt(counterMatch[1]) + 1
          prev.msg = last.msg + ` (×${count})`
          log.pop()
          return { activityLog: log }
        }
      }
      return { activityLog: log }
    })
  },

  updateEngineTelemetry: () => {
    const times = get().engine.roundTripTimes
    if (times.length > MAX_RTT_HISTORY) times.shift()
  },

  updateQueryCacheTelemetry: (entries) => {
    set({
      queryCache: {
        totalQueries: entries.length,
        freshQueries: entries.filter((e) => e.status === "fresh").length,
        staleQueries: entries.filter((e) => e.status === "stale").length,
        fetchingQueries: entries.filter((e) => e.status === "fetching").length,
        errorQueries: entries.filter((e) => e.status === "error").length,
        lastActivityTs: Date.now(),
      },
    })
  },

  updateQueryClientConfig: (config) => {
    set({ queryClientConfig: { staleTime: config.staleTime, gcTime: config.gcTime } })
  },
}))

/* ── Derived helpers (mirror the Pinia store's `computed`s) ─────────────── */

function agoStr(timestamp: number): string {
  if (timestamp <= 0) return "—"
  const ago = Date.now() - timestamp
  return ago < 60_000 ? (ago < 1_000 ? "<1s ago" : (ago / 1_000).toFixed(0) + "s ago") : (ago / 60_000).toFixed(0) + "m ago"
}

function agoStrPerf(timestamp: number): string {
  if (timestamp <= 0) return "—"
  const ago = window.performance.now() - timestamp
  return ago < 60_000 ? (ago < 1_000 ? "<1s ago" : (ago / 1_000).toFixed(0) + "s ago") : (ago / 60_000).toFixed(0) + "m ago"
}

export function engineStatus(engine: EngineMetrics): "busy" | "idle" {
  return engine.queueDepth > 0 ? "busy" : "idle"
}

export function engineAvgLatency(engine: EngineMetrics): number {
  const times = engine.roundTripTimes
  if (times.length === 0) return 0
  return times.reduce((a, b) => a + b, 0) / times.length
}

export function engineLatestRtt(engine: EngineMetrics): number {
  return engine.roundTripTimes[engine.roundTripTimes.length - 1] ?? 0
}

export function engineLatencyBarPct(engine: EngineMetrics): number {
  return Math.min(100, Math.max(1, engineLatestRtt(engine)))
}

export function engineLatencyBarClass(engine: EngineMetrics): string {
  const rtt = engineLatestRtt(engine)
  return rtt > 50 ? " slow" : rtt > 25 ? " warn" : ""
}

export function engineLastRunAgo(engine: EngineMetrics): string {
  return agoStrPerf(engine.lastRunTime)
}

export function qcHasData(queryCache: QueryCacheMetrics): boolean {
  return queryCache.totalQueries > 0
}

export function qcStatus(queryCache: QueryCacheMetrics): "active" | "inactive" {
  return qcHasData(queryCache) ? "active" : "inactive"
}

export function qcLastActivityAgo(queryCache: QueryCacheMetrics): string {
  return agoStr(queryCache.lastActivityTs)
}

