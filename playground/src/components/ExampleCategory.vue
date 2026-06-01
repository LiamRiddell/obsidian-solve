<template>
  <div class="example-category">
    <div class="example-category-header" @click="expanded = !expanded">
      <span class="category-name">{{ category.name }}</span>
      <span class="category-toggle">{{ expanded ? '▼' : '▶' }}</span>
    </div>
    <div class="example-category-content" :class="{ collapsed: !expanded }">
      <div
        v-for="ex in category.examples"
        :key="ex.name"
        class="example-item"
        @click="$emit('select', ex.expression)"
      >
        <div class="example-name">{{ ex.name }}</div>
        <div class="example-expression">{{ ex.expression }}</div>
        <div class="example-description">{{ ex.description }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { ExampleCategory as ExampleCategoryType } from '../examples.js';

defineProps<{ category: ExampleCategoryType }>();
defineEmits<{ select: [expression: string] }>();

const expanded = ref(false);
</script>
