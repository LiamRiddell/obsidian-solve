import { defineStore } from 'pinia';
import { ref } from 'vue';

export const usePipelineStore = defineStore('pipeline', () => {
  /* ── State ──────────────────────────────────────────────── */
  const selectedLine = ref<number | null>(null);
  const dropdownManuallyChanged = ref(false);

  /** Per-line stage expansion state: Map<lineKey, boolean[]> */
  const stageExpansionState = ref(new Map<number, boolean[]>());

  /** Stage output snapshots per line for change detection. */
  const stageSnapshots = ref(new Map<number, string[]>());

  /** Active flamegraph filter stage label. */
  const flamegraphFilter = ref<string | null>(null);

  /* ── Actions ────────────────────────────────────────────── */
  function selectLine(lineNumber: number | null, manual = false): void {
    if (manual) dropdownManuallyChanged.value = true;
    selectedLine.value = lineNumber;
  }

  function resetDropdownOverride(): void {
    dropdownManuallyChanged.value = false;
  }

  function saveStageExpansion(lineKey: number, state: boolean[]): void {
    stageExpansionState.value.set(lineKey, state);
  }

  function getStageExpansion(lineKey: number): boolean[] | undefined {
    return stageExpansionState.value.get(lineKey);
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

  /** Reactive trigger incremented when collapse-all is clicked. */
  const collapseAllTrigger = ref(0);
  /** Reactive trigger incremented when expand-all is clicked. */
  const expandAllTrigger = ref(0);

  function collapseAllStages(): void {
    collapseAllTrigger.value++;
  }

  function expandAllStages(): void {
    expandAllTrigger.value++;
  }

  return {
    selectedLine,
    dropdownManuallyChanged,
    stageExpansionState,
    stageSnapshots,
    flamegraphFilter,
    selectLine,
    resetDropdownOverride,
    saveStageExpansion,
    getStageExpansion,
    saveStageSnapshot,
    getStageSnapshot,
    setFlamegraphFilter,
    clearFlamegraphFilter,
    collapseAllTrigger,
    expandAllTrigger,
    collapseAllStages,
    expandAllStages,
  };
});
