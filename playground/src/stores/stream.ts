import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { DiagnosticEventInfo } from '../engine.js';

export const useStreamStore = defineStore('stream', () => {
  /* ── State ──────────────────────────────────────────────── */
  const events = ref<DiagnosticEventInfo[]>([]);
  const streamingActive = ref(false);

  /* ── Getters ────────────────────────────────────────────── */
  const groupedEvents = computed(() => {
    const groups = new Map<string, DiagnosticEventInfo[]>();
    for (const evt of events.value) {
      const key = evt.groupKey || 'General';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(evt);
    }
    return groups;
  });

  /* ── Actions ────────────────────────────────────────────── */
  function addEvent(event: DiagnosticEventInfo): void {
    events.value.push(event);
  }

  function reset(): void {
    events.value = [];
    streamingActive.value = true;
  }

  function finalize(): void {
    streamingActive.value = false;
  }

  return {
    events,
    streamingActive,
    groupedEvents,
    addEvent,
    reset,
    finalize,
  };
});
