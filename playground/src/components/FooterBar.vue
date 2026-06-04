<template>
  <footer class="footer-bar">
    <span>{{ dr.status === 'ready' ? 'Ready' : dr.status === 'busy' ? 'Evaluating…' : 'Error' }}</span>
    <span class="footer-sep">·</span>
    <span>{{ expressionDisplay }}</span>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useDiagnosticReportStore } from '../stores/diagnosticReport.js';

const dr = useDiagnosticReportStore();

const expressionDisplay = computed(() => {
  const expr = dr.expression;
  if (!expr) return 'No expression';
  return expr.slice(0, 60) + (expr.length > 60 ? '…' : '');
});
</script>
