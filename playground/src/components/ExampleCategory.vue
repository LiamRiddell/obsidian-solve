<template>
  <div class="example-category">
    <div class="example-category-header" @click="expanded = !expanded">
      <span class="category-name">{{ category.name }}</span>
      <span class="category-count">{{ category.examples.length }}</span>
      <span class="msi msi-dense category-toggle">{{ isExpanded ? 'expand_more' : 'chevron_right' }}</span>
    </div>
    <div class="example-category-content" :class="{ collapsed: !isExpanded }">
      <div
        v-for="ex in category.examples"
        :key="ex.name"
        class="example-item"
        :title="ex.description"
        @click="$emit('select', ex.expression)"
      >
        <div class="example-name">{{ ex.name }}</div>
        <div class="example-expression">{{ ex.expression }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { ExampleCategory as ExampleCategoryType } from '@bridge/examples';

const props = defineProps<{ category: ExampleCategoryType; forceExpanded?: boolean }>();
defineEmits<{ select: [expression: string] }>();

const expanded = ref(false);
const isExpanded = computed(() => props.forceExpanded || expanded.value);
</script>
