<template>
  <div class="tab-bar">
    <button
      v-for="tab in tabs.tabs"
      :key="tab.id"
      class="tab-bar-item"
      :class="{ active: tab.id === tabs.activeTabId }"
      @click="tabs.setActiveTab(tab.id)"
    >
      <span class="tab-bar-item-title">{{ tab.title }}</span>
      <span
        v-if="tabs.tabs.length > 1"
        class="msi msi-dense tab-bar-item-close"
        title="Close tab"
        @click.stop="tabs.closeTab(tab.id)"
      >close</span>
    </button>
    <button class="tab-bar-new" title="New tab" @click="onNewTab">
      <span class="msi msi-dense">add</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { useTabsStore } from '../stores/tabsStore.js';

const tabs = useTabsStore();

function onNewTab(): void {
  const id = tabs.createTab();
  tabs.setActiveTab(id);
}
</script>

<style scoped>
.tab-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px 0;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-subtle);
  overflow-x: auto;
}

.tab-bar-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px 6px 12px;
  background: transparent;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  max-width: 180px;
}

.tab-bar-item:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.03);
}

.tab-bar-item.active {
  background: var(--bg-primary);
  border-color: var(--border-subtle);
  color: var(--text-primary);
}

.tab-bar-item-title {
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-bar-item-close {
  font-size: 14px;
  opacity: 0.6;
  border-radius: 3px;
}

.tab-bar-item-close:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.08);
}

.tab-bar-new {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  flex-shrink: 0;
}

.tab-bar-new:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.06);
}
</style>
