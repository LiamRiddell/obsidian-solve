import { create } from "zustand"
import type { Token } from "@bridge/engine"

interface TokensState {
  filterQuery: string
  groupByLine: boolean

  setFilterQuery: (query: string) => void
  setGroupByLine: (group: boolean) => void
}

export const useTokensStore = create<TokensState>((set) => ({
  filterQuery: "",
  groupByLine: true,

  setFilterQuery: (query) => set({ filterQuery: query }),
  setGroupByLine: (group) => set({ groupByLine: group }),
}))

export function matchToken(t: Token, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return t.value.toLowerCase().includes(q) || t.type.toLowerCase().includes(q)
}
