import { create } from "zustand"

export type ActiveTab =
  | "tokens"
  | "summary"
  | "errors"
  | "qa"
  | "flow"
  | "bytecode"
  | "vmtrace"
  | "perf"
  | "workers"
  | "cache"
  | "stream"
  | "dag"
  | "parselets"
  | "normalizer"

interface UiState {
  activeTab: ActiveTab
  editorCollapsed: boolean
  diagnosticsCollapsed: boolean
  /** Pre-filled filter query for the ParseletRegistryTab (set by clicking a parselet chip in the parser stage). */
  parseletFilterQuery: string

  setActiveTab: (tab: ActiveTab) => void
  /** Navigate to the Parselets tab and pre-fill the filter for a specific token type. */
  focusParselet: (tokenType: string) => void
  setParseletFilterQuery: (query: string) => void
  toggleEditor: () => void
  toggleDiagnostics: () => void
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: "tokens",
  editorCollapsed: false,
  diagnosticsCollapsed: false,
  parseletFilterQuery: "",

  setActiveTab: (tab) => set({ activeTab: tab }),
  focusParselet: (tokenType) => set({ parseletFilterQuery: tokenType, activeTab: "parselets" }),
  setParseletFilterQuery: (query) => set({ parseletFilterQuery: query }),
  toggleEditor: () => set((s) => ({ editorCollapsed: !s.editorCollapsed })),
  toggleDiagnostics: () => set((s) => ({ diagnosticsCollapsed: !s.diagnosticsCollapsed })),
}))
