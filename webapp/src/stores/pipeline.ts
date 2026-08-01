import { create } from "zustand"

interface PipelineState {
  /** Currently selected line in the pipeline dropdown (null = aggregate view). */
  selectedLine: number | null
  /** Whether the dropdown was manually changed by the user. */
  dropdownManuallyChanged: boolean
  /** Stage output snapshots per line for change detection. */
  stageSnapshots: Map<number, string[]>
  /** Active flamegraph filter stage label. */
  flamegraphFilter: string | null

  selectLine: (lineNumber: number | null, manual?: boolean) => void
  resetDropdownOverride: () => void
  saveStageSnapshot: (lineKey: number, snapshot: string[]) => void
  getStageSnapshot: (lineKey: number) => string[] | undefined
  setFlamegraphFilter: (stageLabel: string | null) => void
  clearFlamegraphFilter: () => void
}

export const usePipelineStore = create<PipelineState>((set, get) => ({
  selectedLine: null,
  dropdownManuallyChanged: false,
  stageSnapshots: new Map(),
  flamegraphFilter: null,

  selectLine: (lineNumber, manual = false) =>
    set((s) => ({ selectedLine: lineNumber, dropdownManuallyChanged: manual ? true : s.dropdownManuallyChanged })),
  resetDropdownOverride: () => set({ dropdownManuallyChanged: false }),
  saveStageSnapshot: (lineKey, snapshot) => {
    get().stageSnapshots.set(lineKey, snapshot)
  },
  getStageSnapshot: (lineKey) => get().stageSnapshots.get(lineKey),
  setFlamegraphFilter: (stageLabel) => set({ flamegraphFilter: stageLabel }),
  clearFlamegraphFilter: () => set({ flamegraphFilter: null }),
}))
