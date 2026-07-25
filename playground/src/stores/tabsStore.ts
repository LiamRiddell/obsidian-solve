import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { DebugResult } from '../engine.js';
import type { PipelineStageResult } from '@/solve-js/src/types/DiagnosticPipelineResult';
import { useDiagnosticReportStore } from './diagnosticReport.js';

export interface PlaygroundTab {
  id: string;
  title: string;
  text: string;
}

let nextTabId = 1;

const DEFAULT_TEXT = '10 + 5 * 2\nosrs(Iron Axe)';

/**
 * Multiple simultaneously-open playground documents ("tabs"), each with its
 * own text and its own persistent ExpressionEngine's worth of state living
 * inside the shared Worker (see engine.worker.ts — one Worker, multiplexed
 * by tabId). This store is deliberately lightweight, per the chosen scope:
 * every tab's evaluation keeps running in the background (so `global :name`
 * writes in one tab visibly propagate to others), but only the currently
 * ACTIVE tab's diagnostic data is pushed into `useDiagnosticReportStore()` —
 * none of the ~13 diagnostic tab components (DagTab, PerfTab, ...) needed to
 * become multi-instance-aware for this.
 *
 * `resultsByTab` is a plain (non-reactive) Map, not a ref — it's a cache
 * keyed by tabId that stores/engine.ts writes into and this store reads
 * from on tab-switch; nothing needs to reactively re-render off its
 * contents directly, only off `activeTabId` (which IS reactive) and
 * whatever `useDiagnosticReportStore().setResult()` triggers.
 */
export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref<PlaygroundTab[]>([
    { id: `tab-${nextTabId++}`, title: 'Untitled 1', text: DEFAULT_TEXT },
  ]);
  const activeTabId = ref<string>(tabs.value[0].id);

  const resultsByTab = new Map<string, DebugResult>();

  const activeTab = computed(() => tabs.value.find(t => t.id === activeTabId.value) ?? tabs.value[0]);

  function createTab(): string {
    const id = `tab-${nextTabId++}`;
    tabs.value.push({ id, title: `Untitled ${tabs.value.length + 1}`, text: '' });
    return id;
  }

  function closeTab(id: string): void {
    if (tabs.value.length <= 1) return; // always keep at least one tab open
    const idx = tabs.value.findIndex(t => t.id === id);
    if (idx === -1) return;
    tabs.value.splice(idx, 1);
    resultsByTab.delete(id);
    if (activeTabId.value === id) {
      const fallback = tabs.value[Math.max(0, idx - 1)];
      setActiveTab(fallback.id);
    }
  }

  /** Switch focus — pushes that tab's cached result (if any) into the diagnostic report immediately, no re-evaluation needed. */
  function setActiveTab(id: string): void {
    if (!tabs.value.some(t => t.id === id)) return;
    activeTabId.value = id;
    const cached = resultsByTab.get(id);
    if (cached) useDiagnosticReportStore().setResult(cached);
  }

  function updateTabText(id: string, text: string): void {
    const tab = tabs.value.find(t => t.id === id);
    if (tab) tab.text = text;
  }

  function isActive(id: string): boolean {
    return id === activeTabId.value;
  }

  /** Cache a tab's latest result. Call this for EVERY tab's result, active or not — the active-tab check for whether to also push into the diagnostic report happens at the call site (stores/engine.ts), since that decision also needs run-id staleness gating this store doesn't know about. */
  function cacheResult(id: string, result: DebugResult): void {
    resultsByTab.set(id, result);
  }

  function getCachedResult(id: string): DebugResult | undefined {
    return resultsByTab.get(id);
  }

  /**
   * Patch a single line's result (and pipeline stages) into a tab's CACHED
   * DebugResult after it resolves asynchronously (an OSRS price, a currency
   * rate, a global variable) — mirrors `diagnosticReportStore.patchLineResult`/
   * `patchLineStages`, but against the per-tab cache rather than the live
   * report.
   *
   * Without this, a background (non-focused) tab's async resolution events
   * were silently dropped by stores/engine.ts's onmessage handler — its
   * cached snapshot stayed frozen at whatever "Pending" state existed the
   * moment the user switched away, forever, even after the underlying value
   * actually resolved in the worker. Switching back to that tab later would
   * show stale Pending lines that a fresh re-evaluation of the ACTIVE tab
   * would have already resolved. `setActiveTab()` pushes the cached result
   * straight into the diagnostic report with no re-evaluation, so the cache
   * itself must already be correct.
   */
  function patchCachedLineResult(
    id: string,
    update: { lineNumber: number; result: string; type: string; timedOut?: boolean; stages?: PipelineStageResult[] }
  ): void {
    const cached = resultsByTab.get(id);
    if (!cached) return;
    const nextLineResults = cached.lineResults.map((lr) =>
      lr.lineNumber === update.lineNumber
        ? { ...lr, result: update.result, type: update.type, timedOut: update.timedOut, error: undefined }
        : lr
    );
    const nextStagesByLine = update.stages
      ? { ...cached.pipelineStagesByLine, [update.lineNumber]: update.stages }
      : cached.pipelineStagesByLine;
    resultsByTab.set(id, { ...cached, lineResults: nextLineResults, pipelineStagesByLine: nextStagesByLine });
  }

  return {
    tabs,
    activeTabId,
    activeTab,
    createTab,
    closeTab,
    setActiveTab,
    updateTabText,
    isActive,
    cacheResult,
    getCachedResult,
    patchCachedLineResult,
  };
});
