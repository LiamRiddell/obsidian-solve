import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { PerformanceStats, LineStats } from '../engine.js';

/** Maximum number of performance history entries to keep. */
const MAX_HISTORY = 50;

export const usePerfStore = defineStore('perf', () => {
  /* ── State ──────────────────────────────────────────────── */
  const statsHistory = ref<PerformanceStats[]>([]);
  const currentLineStats = ref<LineStats[] | null>(null);

  /* ── Actions ────────────────────────────────────────────── */
  function pushStats(stats: PerformanceStats): void {
    statsHistory.value.push({ ...stats });
    if (statsHistory.value.length > MAX_HISTORY) {
      statsHistory.value.shift();
    }
  }

  function setLineStats(lineStats: LineStats[] | null): void {
    currentLineStats.value = lineStats;
  }

  return {
    statsHistory,
    currentLineStats,
    pushStats,
    setLineStats,
  };
});
