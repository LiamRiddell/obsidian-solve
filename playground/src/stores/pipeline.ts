import { defineStore } from 'pinia';
import { ref } from 'vue';

export const usePipelineStore = defineStore('pipeline', () => {
  /* ── UI State ──────────────────────────────────────────── */
  /** Currently selected line in the pipeline dropdown (null = aggregate view). */
  const selectedLine = ref<number | null>(null);
  /** Whether the dropdown was manually changed by the user. */
  const dropdownManuallyChanged = ref(false);

  /** Stage output snapshots per line for change detection. */
  const stageSnapshots = ref(new Map<number, string[]>());

  /** Active flamegraph filter stage label. */
  const flamegraphFilter = ref<string | null>(null);

  /* ── Actions ──────────────────────────────────────────── */

  function selectLine(lineNumber: number | null, manual = false): void {
    if (manual) dropdownManuallyChanged.value = true;
    selectedLine.value = lineNumber;
  }

  function resetDropdownOverride(): void {
    dropdownManuallyChanged.value = false;
  }

  function saveStageSnapshot(lineKey: number, snapshot: string[]): void {
    stageSnapshots.value.set(lineKey, snapshot);
  }

  function getStageSnapshot(lineKey: number): string[] | undefined {
    return stageSnapshots.value.get(lineKey);
  }

  function setFlamegraphFilter(stageLabel: string | null): void {
    flamegraphFilter.value = stageLabel;
  }

  function clearFlamegraphFilter(): void {
    flamegraphFilter.value = null;
  }

  return {
    // UI state
    selectedLine,
    dropdownManuallyChanged,
    stageSnapshots,
    flamegraphFilter,
    // Actions
    selectLine,
    resetDropdownOverride,
    saveStageSnapshot,
    getStageSnapshot,
    setFlamegraphFilter,
    clearFlamegraphFilter,
  };
});
