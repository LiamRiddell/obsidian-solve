<template>
  <div class="errors-bar" :class="{ collapsed: !expanded }">
    <div class="errors-bar-header" @click="expanded = !expanded">
      <div class="errors-bar-header-left">
        <span class="errors-bar-title">Errors</span>
        <span class="errors-bar-count" :class="{ 'has-errors': errors.length > 0 }">
          {{ errors.length }}
        </span>
      </div>
      <span class="errors-bar-toggle">{{ expanded ? '▲' : '▼' }}</span>
    </div>
    <div class="errors-bar-content">
      <div v-if="errors.length === 0" class="no-errors">✓ No errors</div>
      <div v-for="(err, i) in errors" :key="i" class="error-item">{{ err }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useDiagnosticReportStore } from '../stores/diagnosticReport.js';

const dr = useDiagnosticReportStore();
const expanded = ref(false);

const errors = computed(() => dr.errors);

// Auto-expand when errors arrive
watch(errors, (val) => {
  if (val.length > 0) expanded.value = true;
});
</script>
