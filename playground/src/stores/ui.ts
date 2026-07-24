import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ActiveTab =
  | 'tokens'
  | 'summary'
  | 'qa'
  | 'flow'
  | 'bytecode'
  | 'vmtrace'
  | 'perf'
  | 'workers'
  | 'cache'
  | 'stream'
  | 'dag'
  | 'parselets'
  | 'normalizer';

export const useUiStore = defineStore('ui', () => {
  /* ── State ──────────────────────────────────────────────── */
  const activeTab = ref<ActiveTab>('tokens');
  const editorCollapsed = ref(false);
  const diagnosticsCollapsed = ref(false);

  /** Pre-filled filter query for the ParseletRegistryTab (set by clicking a parselet chip in the parser stage). */
  const parseletFilterQuery = ref('');

  /* ── Actions ────────────────────────────────────────────── */
  function setActiveTab(tab: ActiveTab): void {
    activeTab.value = tab;
  }

  /** Navigate to the Parselets tab and pre-fill the filter for a specific token type. */
  function focusParselet(tokenType: string): void {
    parseletFilterQuery.value = tokenType;
    activeTab.value = 'parselets';
  }

  function toggleEditor(): void {
    editorCollapsed.value = !editorCollapsed.value;
  }

  function toggleDiagnostics(): void {
    diagnosticsCollapsed.value = !diagnosticsCollapsed.value;
  }

  return {
    activeTab,
    parseletFilterQuery,
    editorCollapsed,
    diagnosticsCollapsed,
    setActiveTab,
    focusParselet,
    toggleEditor,
    toggleDiagnostics,
  };
});
