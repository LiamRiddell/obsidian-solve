<template>
  <div class="status-bar">
    <div class="status-bar-row">
      <span class="status-bar-dot" :class="'status-' + dr.status"></span>
      <span class="status-bar-text">{{ dr.status === 'ready' ? 'Ready' : dr.status === 'busy' ? 'Evaluating…' : 'Error' }}</span>
      <span class="status-bar-spacer"></span>
      <button
        class="status-bar-errors"
        :class="{ 'has-errors': errors.length > 0, open: errorsOpen }"
        @click="errorsOpen = !errorsOpen"
        :disabled="errors.length === 0"
      >
        <span class="msi msi-dense status-bar-errors-icon">warning</span>
        {{ errors.length }} error{{ errors.length !== 1 ? 's' : '' }}
        <span v-if="errors.length > 0" class="msi msi-dense status-bar-errors-chevron">{{ errorsOpen ? 'expand_more' : 'expand_less' }}</span>
      </button>
    </div>

    <!-- Overlaid drawer — only takes up space while open, doesn't reserve
         a permanent empty strip the way the old always-visible errors bar did. -->
    <div v-if="errorsOpen && errors.length > 0" class="status-bar-drawer">
      <div v-for="(err, i) in errors" :key="i" class="status-bar-error-item">{{ err }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useDiagnosticReportStore } from '../stores/diagnosticReport.js';

const dr = useDiagnosticReportStore();
const errorsOpen = ref(false);

const errors = computed(() => dr.errors);

// Auto-open the drawer when a new error arrives; auto-close once cleared.
watch(errors, (val) => {
  if (val.length > 0) errorsOpen.value = true;
  else errorsOpen.value = false;
});
</script>
