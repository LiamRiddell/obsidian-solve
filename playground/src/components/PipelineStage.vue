<template>
  <!--
    PipelineStage.vue — A single stage in the vertical pipeline flow diagram.

    Each stage shows a header (step number, icon, label, timing) and an
    expandable body with input description, output data, and an optional
    detail slot for richer content (e.g., the normalizer's fusion table).

    The parent (PipelineTab.vue) drives rendering via data-driven stage
    arrays and passes typed stage output through named slots.
  -->

  <!--#region Stage Container ───────────────────────────────────────────────-->
  <div
    class="flow-stage"
    :class="{
      executed: executed,
      error: hasError,
      collapsed: collapsed,
      skipped: skipped,
      'flash-pulse': pulsing,
    }"
  >
    <!--#endregion-->
    <!--#region Stage Header ────────────────────────────────────────────────-->
    <div
      class="flow-stage-header"
      :class="[colorClass, { 'header-pulse': pulsing }]"
      @click="toggle"
    >
      <span class="flow-stage-step">{{ stepNumber }}</span>
      <span class="flow-stage-icon">{{ icon }}</span>
      <span class="flow-stage-name">{{ label }}</span>
      <span class="flow-stage-active-line">{{ activeLine }}</span>
      <span class="flow-stage-time">{{ timeLabel }}</span>
    </div>
    <!--#endregion-->
    <!--#region Stage Body ──────────────────────────────────────────────────-->
    <div class="flow-stage-body">
      <!-- Human-readable transformation description (e.g., "Tokens → AST") -->
      <div v-if="input" class="flow-stage-input">{{ input }}</div>

      <!-- Downward arrow between input and output -->
      <div v-if="showArrow" class="flow-stage-arrow">↓</div>

      <!-- Output category label (e.g., "Tokens", "Opcodes") -->
      <div v-if="outputLabel" class="flow-stage-output-label">{{ outputLabel }}</div>

      <!--
        Output content area.
        Two variants:
        - result: larger, accent-colored for the final result
        - default: standard monospace output area for intermediate stages
      -->
      <div v-if="isResult" class="flow-stage-output-result">
        <slot name="output">
          <span class="empty">—</span>
        </slot>
      </div>
      <div v-else class="flow-stage-output">
        <slot name="output">
          <span class="empty">—</span>
        </slot>
      </div>

      <!--
        Expandable detail section.
        Rendered only when the parent provides content via the #detail slot.
        Used by the normalizer stage to show the fusion table.
      -->
      <div v-if="$slots.detail" class="flow-stage-detail">
        <slot name="detail" />
      </div>
    </div>
    <!--#endregion-->
  </div>
</template>

<script setup lang="ts">
//#region ─── Imports ──────────────────────────────────────────────────────────

import { computed } from "vue";

//#endregion
//#region ─── Props ────────────────────────────────────────────────────────────

/**
 * Props for a single pipeline stage in the flow diagram.
 *
 * The parent (PipelineTab.vue) passes these from the engine's
 * DiagnosticPipelineResult.stages[] array.
 */
const props = defineProps<{
  /** Sequential step number (1–15) displayed in the circular badge */
  stepNumber: number;
  /** Emoji icon for the stage header (e.g., "⚡", "🔤") */
  icon: string;
  /** Human-readable stage label (e.g., "VM Execute") */
  label: string;
  /**
   * CSS color class for the stage header.
   * Maps to `.flow-stage-header.{colorClass}` in main.css
   * (e.g., "lexer", "parser", "vm", "normalizer").
   */
  colorClass: string;
  /** Formatted time label (e.g., "1.2 µs" or "—") */
  timeLabel: string;
  /** Active line indicator (e.g., "L3" or "All") */
  activeLine: string;
  /** Whether the stage is currently expanded (v-model) */
  modelValue: boolean;
  /** Input transformation description (e.g., "Expression → Tokens") */
  input?: string;
  /** Output category label (e.g., "Tokens", "Opcodes") */
  outputLabel?: string;
  /** Whether to show the downward arrow between input and output */
  showArrow?: boolean;
  /** Whether this is the final result stage (larger output area) */
  isResult?: boolean;
  /** Whether the pipeline has executed (enables executed styling) */
  executed?: boolean;
  /** Whether this stage encountered an error */
  hasError?: boolean;
  /** Whether this stage was skipped (greyed-out display) */
  skipped?: boolean;
  /** Whether this stage is currently pulsing (data change animation) */
  pulsing?: boolean;
}>();

//#endregion
//#region ─── Emits ────────────────────────────────────────────────────────────

const emit = defineEmits<{
  /** Fired when the user clicks the stage header to toggle expand/collapse */
  (e: "update:modelValue", value: boolean): void;
}>();

//#endregion
//#region ─── Computed ─────────────────────────────────────────────────────────

/** Whether the stage body is collapsed (inverse of modelValue). */
const collapsed = computed(() => props.modelValue);

//#endregion
//#region ─── Methods ──────────────────────────────────────────────────────────

/** Toggle the stage between expanded and collapsed state. */
function toggle(): void {
  emit("update:modelValue", !props.modelValue);
}

//#endregion
</script>
