import { create } from "zustand"

// Bounds stageSnapshots (below) to avoid unbounded growth over a long
// session -- every distinct line number ever viewed in the pipeline
// dropdown, across every tab/document, added an entry here that nothing
// ever removed. FIFO eviction (oldest inserted key first) mirrors
// ExpressionEngine.ts's bytecodeCache bound -- this data is purely a
// "did this line's output change since I last looked at it" cache, so
// losing the oldest entry only means one extra pulse-animation flash the
// next time that line is revisited, never a correctness issue.
const MAX_STAGE_SNAPSHOTS = 200

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
    const snapshots = get().stageSnapshots
    if (!snapshots.has(lineKey) && snapshots.size >= MAX_STAGE_SNAPSHOTS) {
      const oldest = snapshots.keys().next().value
      if (oldest !== undefined) snapshots.delete(oldest)
    }
    snapshots.set(lineKey, snapshot)
  },
  getStageSnapshot: (lineKey) => get().stageSnapshots.get(lineKey),
  setFlamegraphFilter: (stageLabel) => set({ flamegraphFilter: stageLabel }),
  clearFlamegraphFilter: () => set({ flamegraphFilter: null }),
}))
