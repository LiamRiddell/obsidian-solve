import { defineStore } from 'pinia';
import { ref, reactive, computed } from 'vue';
import type { DebugResult } from '../engine.js';

/** Worker activity log entry. */
export interface WorkerLogEntry {
  ts: number;
  source: 'engine' | 'dataquery';
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

  /* ── DataQuery Worker Metrics ───────────────────────────── */
  const dataquery = reactive({
    activeRequests: 0,
    fetches: 0,
    sources: 0,
    lastActivityTs: 0,
    sourceNames: [] as string[],
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

  /* ── Derived: DataQuery Worker ──────────────────────────── */
  const dqHasData = computed(() =>
    dataquery.fetches > 0 || dataquery.activeRequests > 0 || dataquery.sources > 0,
  );

  const dqStatus = computed(() =>
    dqHasData.value ? 'active' : 'inactive',
  );

  const dqLastActivityAgo = computed(() =>
    agoStr(dataquery.lastActivityTs),
  );

  /* ── Actions ────────────────────────────────────────────── */
  function logActivity(source: 'engine' | 'dataquery', msg: string, isError = false): void {
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

  function updateDqTelemetry(result: DebugResult): void {
    dataquery.activeRequests = result.dqMetrics.pendingQueries;
    dataquery.fetches = result.dqMetrics.queryCount;
    dataquery.sources = result.dqMetrics.dataSources;
    dataquery.sourceNames = result.dqMetrics.dataSourceNames;
    dataquery.lastActivityTs = Date.now();
  }

  return {
    engine,
    dataquery,
    compilationWorker,
    activityLog,
    // Derived
    engineStatus,
    engineAvgLatency,
    engineLatestRtt,
    engineLatencyBarPct,
    engineLatencyBarClass,
    engineLastRunAgo,
    dqHasData,
    dqStatus,
    dqLastActivityAgo,
    // Actions
    logActivity,
    updateEngineTelemetry,
    updateDqTelemetry,
  };
});
