<template>
  <div class="examples-menu" v-click-outside="close">
    <button class="examples-menu-trigger" :class="{ open }" @click="open = !open">
      <span class="msi msi-dense">menu_book</span> Examples <span class="examples-menu-count">{{ totalExampleCount }}</span>
      <span class="msi msi-dense examples-menu-chevron">{{ open ? 'expand_less' : 'expand_more' }}</span>
    </button>

    <div v-if="open" class="examples-menu-panel">
      <div class="examples-menu-filter-row">
        <input
          ref="filterInputRef"
          type="text"
          class="sidebar-filter-input"
          placeholder="Filter examples…"
          spellcheck="false"
          v-model="filterQuery"
        />
        <select class="full-doc-select" @change="onFullDocSelect">
          <option value="">Full Documents…</option>
          <option v-for="doc in fullDocumentExamples" :key="doc.name" :value="doc.content">
            {{ doc.name }}
          </option>
        </select>
      </div>
      <div class="examples-menu-list">
        <div v-if="filterQuery && filteredCategories.length === 0" class="sidebar-no-matches">No examples match &ldquo;{{ filterQuery }}&rdquo;</div>
        <ExampleCategory
          v-for="cat in filteredCategories"
          :key="cat.name"
          :category="cat"
          :force-expanded="filterQuery.length > 0"
          @select="onExampleSelect"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, type Directive } from 'vue';
import { useEditorStore } from '../stores/editor.js';
import { exampleData, fullDocumentExamples } from '@bridge/examples';
import ExampleCategory from './ExampleCategory.vue';

const editor = useEditorStore();

const open = ref(false);
const filterQuery = ref('');
const filterInputRef = ref<HTMLInputElement | null>(null);

const totalExampleCount = computed(() => exampleData.reduce((n, c) => n + c.examples.length, 0));

const filteredCategories = computed(() => {
  const q = filterQuery.value.trim().toLowerCase();
  if (!q) return exampleData;
  return exampleData
    .map(cat => ({
      ...cat,
      examples: cat.examples.filter(ex =>
        ex.name.toLowerCase().includes(q) ||
        ex.expression.toLowerCase().includes(q) ||
        ex.description.toLowerCase().includes(q),
      ),
    }))
    .filter(cat => cat.examples.length > 0);
});

function close(): void {
  open.value = false;
}

watch(open, (val) => {
  if (val) nextTick(() => filterInputRef.value?.focus());
  else filterQuery.value = '';
});

function onExampleSelect(expression: string): void {
  editor.insertExample(expression);
  close();
}

function onFullDocSelect(e: Event): void {
  const sel = e.target as HTMLSelectElement;
  if (sel.value) {
    editor.insertExample(sel.value);
    sel.value = '';
    close();
  }
}

/** Minimal click-outside directive — closes the dropdown when clicking anywhere else. */
const vClickOutside: Directive<HTMLElement, () => void> = {
  mounted(el, binding) {
    (el as any)._clickOutsideHandler = (e: MouseEvent) => {
      if (!el.contains(e.target as Node)) binding.value();
    };
    document.addEventListener('mousedown', (el as any)._clickOutsideHandler);
  },
  unmounted(el) {
    document.removeEventListener('mousedown', (el as any)._clickOutsideHandler);
  },
};
</script>
