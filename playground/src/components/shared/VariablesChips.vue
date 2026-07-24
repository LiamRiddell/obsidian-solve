<!--
  VariablesChips.vue — the `:varname` chip list, extracted from two
  previously identical implementations in PipelineTab and BytecodeTab.
-->
<template>
  <div v-if="variables.length > 0" class="diag-section">
    <div class="diag-section-header" @click="expanded = !expanded" role="button" :aria-expanded="expanded">
      <span class="diag-section-title"><span class="msi msi-dense">list_alt</span> Variables</span>
      <span class="diag-section-tag">{{ variables.length }} variable{{ variables.length !== 1 ? 's' : '' }}</span>
      <span class="msi msi-dense diag-section-chevron" :class="{ expanded }">chevron_right</span>
    </div>
    <div v-if="expanded" class="diag-section-body" style="display: flex; flex-wrap: wrap; gap: 6px;">
      <span v-for="v in variables" :key="v" class="variable-chip" :title="'Variable: :' + v">:{{ v }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

defineProps<{
  variables: string[];
}>();

const expanded = ref(true);
</script>
