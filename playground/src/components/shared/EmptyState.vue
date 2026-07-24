<!--
  EmptyState.vue — the icon + text + hint "nothing to show yet" pattern,
  standardized across all diagnostic tabs. Previously only Normalizer and
  Parselets had this treatment; other tabs used plain text or nothing.
-->
<template>
  <div class="diag-empty-state">
    <div class="msi msi-lg diag-empty-icon">{{ icon }}</div>
    <div class="diag-empty-text">{{ text }}</div>
    <div v-if="hint" class="diag-empty-hint">{{ hint }}</div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  /** Material Symbols icon name (e.g. "database", "bolt") — not an emoji. */
  icon: string;
  text: string;
  hint?: string;
}>();
</script>
