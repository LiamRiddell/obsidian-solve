import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Token } from '../engine.js';

export const useTokensStore = defineStore('tokens', () => {
  /* ── State ──────────────────────────────────────────────── */
  const filterQuery = ref('');
  const groupByLine = ref(true);

  /* ── Actions ────────────────────────────────────────────── */
  function setFilterQuery(query: string): void {
    filterQuery.value = query;
  }

  function setGroupByLine(group: boolean): void {
    groupByLine.value = group;
  }

  function matchToken(t: Token, query: string): boolean {
    if (!query) return true;
    const q = query.toLowerCase();
    return t.value.toLowerCase().includes(q) || t.type.toLowerCase().includes(q);
  }

  return {
    filterQuery,
    groupByLine,
    setFilterQuery,
    setGroupByLine,
    matchToken,
  };
});
