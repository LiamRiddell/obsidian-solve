<template>
  <aside class="sidebar" id="sidebar" :class="{ collapsed: ui.sidebarCollapsed }">
    <div class="sidebar-header">
      <h2>Examples</h2>
      <select class="full-doc-select" @change="onFullDocSelect">
        <option value="">📄 Full Documents…</option>
        <option v-for="doc in fullDocumentExamples" :key="doc.name" :value="doc.content">
          {{ doc.name }}
        </option>
      </select>
    </div>
    <div class="sidebar-content">
      <ExampleCategory
        v-for="cat in exampleData"
        :key="cat.name"
        :category="cat"
        @select="onExampleSelect"
      />
    </div>
  </aside>

  <!-- Right-edge tab when sidebar is collapsed -->
  <div
    class="sidebar-right-tab"
    :class="{ active: ui.sidebarCollapsed }"
    @click="ui.toggleSidebar()"
    :title="ui.sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'"
  >
    <span class="sidebar-right-tab-text">Examples</span>
  </div>
</template>

<script setup lang="ts">
import { useUiStore } from '../stores/ui.js';
import { useEditorStore } from '../stores/editor.js';
import { exampleData, fullDocumentExamples } from '../examples.js';
import ExampleCategory from './ExampleCategory.vue';

const ui = useUiStore();
const editor = useEditorStore();

function onExampleSelect(expression: string): void {
  editor.insertExample(expression);
}

function onFullDocSelect(e: Event): void {
  const sel = e.target as HTMLSelectElement;
  if (sel.value) {
    editor.insertExample(sel.value);
    sel.value = '';
  }
}
</script>
