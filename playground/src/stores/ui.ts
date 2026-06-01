import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ActiveTab =
  | 'tokens'
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
  const sidebarCollapsed = ref(false);
  const editorCollapsed = ref(false);
  const diagnosticsCollapsed = ref(false);

  /* ── Actions ────────────────────────────────────────────── */
  function setActiveTab(tab: ActiveTab): void {
    activeTab.value = tab;
  }

  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }

  function toggleEditor(): void {
    editorCollapsed.value = !editorCollapsed.value;
  }

  function toggleDiagnostics(): void {
    diagnosticsCollapsed.value = !diagnosticsCollapsed.value;
  }

  return {
    activeTab,
    sidebarCollapsed,
    editorCollapsed,
    diagnosticsCollapsed,
    setActiveTab,
    toggleSidebar,
    toggleEditor,
    toggleDiagnostics,
  };
});
