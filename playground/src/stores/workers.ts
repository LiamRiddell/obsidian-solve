import { defineStore } from 'pinia';
import { ref, reactive, computed } from 'vue';
import type { DebugResult, QueryClientConfig } from '../engine.js';

/** Worker activity log entry. */
export interface WorkerLogEntry {
  ts: number;
  source: 'engine' | 'query-cache';
  msg: string;
  error?: boolean;
}

const MAX_LOG_ENTRIES = 100;
const MAX_RTT_HISTORY = 20;

/** Format a "time ago" string. */
function agoStr(timestamp: number): string {
  if (timestamp <= 0) return '—';
  const ago = Date.now() - timestamp;
  return ago < 60_000
    ? (ago < 1_000 ? '<1s ago' : (ago / 1_000).toFixed(0) + 's ago')
    : (ago / 60_000).toFixed(0) + 'm ago';
}

/** Format a performance.now()-based "time ago" string. */
function agoStrPerf(timestamp: number): string {
  if (timestamp <= 0) return '—';
  const ago = window.performance.now() - timestamp;
  return ago < 60_000
    ? (ago < 1_000 ? '<1s ago' : (ago / 1_000).toFixed(0) + 's ago')
    : (ago / 60_000).toFixed(0) + 'm ago';
}

export const useWorkersStore = defineStore('workers', () => {
  /* ── Engine Worker Metrics ──────────────────────────────── */
  const engine = reactive({
    msgCount: 0,
    queueDepth: 0,
    /** performance.now() timestamp of last run enqueue */
    lastRunTime: 0,
    roundTripTimes: [] as number[],
  });

  /* ── Query Cache Metrics (TanStack Query) ────────────────── */
  const queryCache = reactive({
    totalQueries: 0,
    freshQueries: 0,
    staleQueries: 0,
    fetchingQueries: 0,
    errorQueries: 0,
    lastActivityTs: 0,
  });

  /* ── QueryClient Configuration ────────────────────────────── */
  const queryClientConfig = reactive<QueryClientConfig>({
    staleTime: 0,
    gcTime: 0,
  });

  /* ── Compilation Worker Metrics (placeholder — real data from engine) ── */
  const compilationWorker = reactive({
    isActive: false,
    activeCompilations: 0,
    bytecodeStored: 0,
    bytecodeDiscarded: 0,
    transferSize: '0 B',
  });

  /* ── Activity Log ───────────────────────────────────────── */
  const activityLog = ref<WorkerLogEntry[]>([]);

  /* ── Derived: Engine Worker ─────────────────────────────── */
  const engineStatus = computed(() =>
    engine.queueDepth > 0 ? 'busy' : 'idle',
  );

  const engineAvgLatency = computed(() => {
    const times = engine.roundTripTimes;
    if (times.length === 0) return 0;
    return times.reduce((a, b) => a + b, 0) / times.length;
  });

  const engineLatestRtt = computed(() =>
    engine.roundTripTimes[engine.roundTripTimes.length - 1] ?? 0,
  );

  const engineLatencyBarPct = computed(() =>
    Math.min(100, Math.max(1, engineLatestRtt.value)),
  );

  const engineLatencyBarClass = computed(() =>
    engineLatestRtt.value > 50 ? ' slow' : engineLatestRtt.value > 25 ? ' warn' : '',
  );

  const engineLastRunAgo = computed(() =>
    agoStrPerf(engine.lastRunTime),
  );

  /* ── Derived: Query Cache ───────────────────────────────── */
  const qcHasData = computed(() => queryCache.totalQueries > 0);
  const qcStatus = computed(() => qcHasData.value ? 'active' : 'inactive');
  const qcLastActivityAgo = computed(() => agoStr(queryCache.lastActivityTs));

  /* ── Actions ────────────────────────────────────────────── */
  function logActivity(source: 'engine' | 'query-cache', msg: string, isError = false): void {
    const log = activityLog.value;
    log.push({ ts: Date.now(), source, msg, error: isError });
    if (log.length > MAX_LOG_ENTRIES) log.shift();

    // Deduplicate consecutive identical entries
    if (log.length >= 2) {
      const prev = log[log.length - 2];
      const last = log[log.length - 1];
      if (prev.source === last.source && prev.msg === last.msg) {
        prev.msg = last.msg + ' (×2)';
        log.pop();
        return;
      }
      const counterMatch = prev.msg.match(/\s+\(×(\d+)\)$/);
      if (counterMatch && prev.source === last.source &&
        prev.msg.slice(0, counterMatch.index!) === last.msg) {
        const count = parseInt(counterMatch[1]) + 1;
        prev.msg = last.msg + ` (×${count})`;
        log.pop();
        return;
      }
    }
  }

  function updateEngineTelemetry(): void {
    // Cap roundTripTimes history
    if (engine.roundTripTimes.length > MAX_RTT_HISTORY) {
      engine.roundTripTimes.shift();
    }
  }

  /** Update query cache metrics from the TanStack Query client snapshot. */
  function updateQueryCacheTelemetry(entries: { status: string }[]): void {
    queryCache.totalQueries = entries.length;
    queryCache.freshQueries = entries.filter(e => e.status === 'fresh').length;
    queryCache.staleQueries = entries.filter(e => e.status === 'stale').length;
    queryCache.fetchingQueries = entries.filter(e => e.status === 'fetching').length;
    queryCache.errorQueries = entries.filter(e => e.status === 'error').length;
    queryCache.lastActivityTs = Date.now();
  }

  /** Update QueryClient default configuration. */
  function updateQueryClientConfig(config: QueryClientConfig): void {
    queryClientConfig.staleTime = config.staleTime;
    queryClientConfig.gcTime = config.gcTime;
  }

  return {
    engine,
    queryCache,
    queryClientConfig,
    compilationWorker,
    activityLog,
    // Derived
    engineStatus,
    engineAvgLatency,
    engineLatestRtt,
    engineLatencyBarPct,
    engineLatencyBarClass,
    engineLastRunAgo,
    qcHasData,
    qcStatus,
    qcLastActivityAgo,
    // Actions
    logActivity,
    updateEngineTelemetry,
    updateQueryCacheTelemetry,
    updateQueryClientConfig,
  };
});
