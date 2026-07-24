<!--
  ContextHeader.vue — sticky "what am I looking at" header shown at the
  top of a diagnostic tab: an eyebrow label, the active line badge
  (`L{n}` or "All Lines"), and the expression text being diagnosed.

  Extracted from three near-identical bespoke implementations that used
  to live separately in PipelineTab, NormalizerTab, and
  ParseletRegistryTab. Also used by BytecodeTab and VmTraceTab, which
  previously had no context header at all.
-->
<template>
  <div class="diag-context-header">
    <div class="diag-context-left">
      <span class="diag-context-label">{{ label }}</span>
      <span class="diag-context-badge">{{ lineBadge }}</span>
    </div>
    <span class="diag-context-expr" :title="expression">{{ expression || '(empty expression)' }}</span>
    <div v-if="$slots.extra" class="diag-context-extra">
      <slot name="extra" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  /** Eyebrow label, e.g. "Normalizing", "Pipeline", "Parselets". */
  label: string;
  /** Compact line indicator, e.g. "L3" or "All Lines". */
  lineBadge: string;
  /** The active expression text being diagnosed. */
  expression: string;
}>();
</script>
