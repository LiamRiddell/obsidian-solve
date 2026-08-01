import { create } from "zustand"
import type { DebugResult, LineResult } from "@bridge/engine"
import type { PipelineStageResult } from "@solve-js/types/DiagnosticPipelineResult"
import { useDiagnosticReportStore } from "./diagnosticReport"
// Circular by nature (engine.ts imports this store back), but safe: both
// sides only reach across at call time, and `closeTab` is a hoisted
// function declaration, so the binding exists whichever module initialises
// first. Kept here rather than in TabBar.tsx so no future close path can
// forget to release the worker's per-tab state.
import { closeTab as releaseWorkerTab } from "./engine"

export interface PlaygroundTab {
  id: string
  title: string
  text: string
}

let nextTabId = 1
const DEFAULT_TEXT = [
  "10 + 5 * 2",
  "osrs(Iron Axe)",
  "30 fps * 3 minutes",
  "7:30 to 20:45",
  "1 < 2 && 3 < 4",
  "if 10 > 5 then 1 else 0",
  "255 as hex",
  "0.5 as fraction",
  "average of 2, 4, 6",
  "clamp 15 between 0 and 10",
  "5 km is to 500m as 5 cm is to what",
  "gcd(12, 18)",
  "2.5k + 1000",
  "hex(255)",
  "tax on 300 at 20%",
  "6pm Sydney in Chicago",
  "01:02:03:04 at 30 fps",
  "workdays in 3 weeks",
  "1733823083000 to date",
  "what is $500 from 1970",
  "300g butter in cups",
  "double(x) = 2 * x",
  "double(21)",
  "42",
  "prev + 8",
].join("\n")

/** Plain (non-reactive) cache keyed by tabId — read/written directly, never subscribed to. */
const resultsByTab = new Map<string, DebugResult>()

interface TabsState {
  tabs: PlaygroundTab[]
  activeTabId: string

  createTab: () => string
  /**
   * Opens a whole set of named documents at once and focuses the first.
   *
   * Unlike `insertExample`, this cannot go through the editor's imperative
   * handle: the CodeMirror views for these tabs do not exist yet. Seeding
   * `text` on the tab up front is what makes them work — EditorPane builds
   * each view from `tab.text` when its container mounts and evaluates it
   * immediately, so every document in the set is live (and therefore
   * publishing its globals) without the user having to visit its tab.
   */
  openDocumentSet: (documents: readonly { title: string; content: string }[]) => void
  closeTab: (id: string) => void
  /** Switch focus — pushes that tab's cached result (if any) into the diagnostic report immediately, no re-evaluation needed. */
  setActiveTab: (id: string) => void
  updateTabText: (id: string, text: string) => void
  isActive: (id: string) => boolean
  /** Cache a tab's latest result. Call this for EVERY tab's result, active or not. */
  cacheResult: (id: string, result: DebugResult) => void
  getCachedResult: (id: string) => DebugResult | undefined
  /** Patch a single line's result (and pipeline stages) into a tab's CACHED DebugResult after an async resolution. */
  patchCachedLineResult: (
    id: string,
    update: Pick<
      LineResult,
      "lineNumber" | "result" | "type" | "timedOut" | "error" | "errorCode" | "errorCategory" | "errorExpected" | "errorFound" | "errorSuggestion" | "errorRecoverable"
    > & { stages?: PipelineStageResult[] },
  ) => void
}

/**
 * Multiple simultaneously-open playground documents ("tabs"), each with its
 * own text and its own persistent ExpressionEngine's worth of state living
 * inside the shared Worker (see engine.worker.ts — one Worker, multiplexed
 * by tabId). Every tab's evaluation keeps running in the background (so
 * `global :name` writes in one tab visibly propagate to others), but only
 * the currently ACTIVE tab's diagnostic data is pushed into
 * useDiagnosticReportStore() — none of the diagnostic tab components need
 * to become multi-instance-aware for this.
 */
export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [{ id: `tab-${nextTabId++}`, title: "Untitled 1", text: DEFAULT_TEXT }],
  activeTabId: "",

  createTab: () => {
    const id = `tab-${nextTabId++}`
    set((s) => ({ tabs: [...s.tabs, { id, title: `Untitled ${s.tabs.length + 1}`, text: "" }] }))
    return id
  },

  openDocumentSet: (documents) => {
    if (documents.length === 0) return
    const created = documents.map((d) => ({ id: `tab-${nextTabId++}`, title: d.title, text: d.content }))
    set((s) => ({ tabs: [...s.tabs, ...created] }))
    get().setActiveTab(created[0].id)
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get()
    if (tabs.length <= 1) return // always keep at least one tab open
    const idx = tabs.findIndex((t) => t.id === id)
    if (idx === -1) return
    const nextTabs = tabs.slice()
    nextTabs.splice(idx, 1)
    resultsByTab.delete(id)
    releaseWorkerTab(id)
    set({ tabs: nextTabs })
    if (activeTabId === id) {
      const fallback = nextTabs[Math.max(0, idx - 1)]
      get().setActiveTab(fallback.id)
    }
  },

  setActiveTab: (id) => {
    if (!get().tabs.some((t) => t.id === id)) return
    set({ activeTabId: id })
    const cached = resultsByTab.get(id)
    if (cached) useDiagnosticReportStore.getState().setResult(cached)
  },

  updateTabText: (id, text) => {
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, text } : t)) }))
  },

  isActive: (id) => id === get().activeTabId,

  cacheResult: (id, result) => {
    resultsByTab.set(id, result)
  },

  getCachedResult: (id) => resultsByTab.get(id),

  patchCachedLineResult: (id, update) => {
    const cached = resultsByTab.get(id)
    if (!cached) return
    const nextLineResults = cached.lineResults.map((lr) =>
      lr.lineNumber === update.lineNumber
        ? {
            ...lr,
            result: update.result,
            type: update.type,
            timedOut: update.timedOut,
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
    const nextStagesByLine = update.stages
      ? { ...cached.pipelineStagesByLine, [update.lineNumber]: update.stages }
      : cached.pipelineStagesByLine
    resultsByTab.set(id, { ...cached, lineResults: nextLineResults, pipelineStagesByLine: nextStagesByLine })
  },
}))

// Initialize activeTabId to the first tab (mirrors the Pinia store's `ref(tabs.value[0].id)`).
useTabsStore.setState({ activeTabId: useTabsStore.getState().tabs[0].id })

export function activeTab(s: TabsState): PlaygroundTab {
  return s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0]
}
