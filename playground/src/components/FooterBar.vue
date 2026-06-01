<template>
  <footer class="footer-bar">
    <span>{{ engine.status === 'ready' ? 'Ready' : engine.status === 'busy' ? 'Evaluating…' : 'Error' }}</span>
    <span class="footer-sep">·</span>
    <span>{{ expressionDisplay }}</span>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useEngineStore } from '../stores/engine.js';

const engine = useEngineStore();

const expressionDisplay = computed(() => {
  const expr = engine.expression;
  if (!expr) return 'No expression';
  return expr.slice(0, 60) + (expr.length > 60 ? '…' : '');
});
</script>
