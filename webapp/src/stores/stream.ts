import { create } from "zustand"
import type { DiagnosticEventInfo } from "@bridge/engine"

interface StreamState {
  events: DiagnosticEventInfo[]
  streamingActive: boolean

  addEvent: (event: DiagnosticEventInfo) => void
  reset: () => void
  finalize: () => void
}

/**
 * Hard cap on retained stream events.
 *
 * These are not cheap rows: an `async_resolved` event carries a full
 * `cacheUpdate` (bytecode + line + async cache snapshots) and the line's
 * complete pipeline stages. `reset()` clears them per evaluation, but a
 * document that keeps resolving async values — OSRS prices, currency
 * rates — streams events for as long as it is open with no evaluation in
 * between, so the array had no bound at all. The unconditional
 * `[...s.events, event]` copy also made appending O(n²) over a session.
 */
const MAX_STREAM_EVENTS = 500

export const useStreamStore = create<StreamState>((set) => ({
  events: [],
  streamingActive: false,

  addEvent: (event) =>
    set((s) => {
      const next = s.events.length >= MAX_STREAM_EVENTS ? s.events.slice(s.events.length - MAX_STREAM_EVENTS + 1) : s.events.slice()
      next.push(event)
      return { events: next }
    }),
  reset: () => set({ events: [], streamingActive: true }),
  finalize: () => set({ streamingActive: false }),
}))

/** Derive grouped events on demand — mirrors the Pinia store's `groupedEvents` computed. */
export function groupEvents(events: DiagnosticEventInfo[]): Map<string, DiagnosticEventInfo[]> {
  const groups = new Map<string, DiagnosticEventInfo[]>()
  for (const evt of events) {
    const key = evt.groupKey || "General"
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(evt)
  }
  return groups
}
