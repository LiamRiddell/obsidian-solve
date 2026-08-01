<template>
  <!--
    PipelineStage.vue — A single stage in the vertical pipeline flow diagram.

    Collapsed by default: the header row alone shows step, icon, label, a
    compact one-line data preview, time, and a chevron — enough to scan all
    ~14 stages at a glance without expanding any of them. Expanding a stage
    reveals the fuller input/output breakdown and (for stages that have one)
    a detail slot.

    The parent (PipelineTab.vue) drives rendering via data-driven stage
    arrays and passes typed stage output through named slots.
  -->

  <!--#region Stage Container ───────────────────────────────────────────────-->
  <div
    class="flow-stage"
    :class="[colorClass, {
      executed: executed,
      error: hasError,
      collapsed: collapsed,
      skipped: skipped,
      'flash-pulse': pulsing,
    }]"
  >
    <!--#endregion-->
    <!--#region Stage Header ────────────────────────────────────────────────-->
    <div
      class="flow-stage-header"
      :class="{ 'header-pulse': pulsing }"
      @click="toggle"
      role="button"
      :aria-expanded="!collapsed"
    >
      <span class="flow-stage-step">{{ stepNumber }}</span>
      <span class="msi msi-dense flow-stage-icon">{{ materialIcon }}</span>
      <span class="flow-stage-name">{{ label }}</span>
      <span
        v-if="isGate"
        class="flow-stage-gate-badge"
        title="Gate — this step can pass, fail, or branch the pipeline (e.g. skip later stages), unlike a straight-line processing step"
        >Gate</span
      >
      <span v-if="preview" class="flow-stage-preview">{{ preview }}</span>
      <span class="flow-stage-active-line">{{ activeLine }}</span>
      <span class="flow-stage-time">{{ timeLabel }}</span>
      <span class="msi msi-dense flow-stage-chevron" :class="{ expanded: !collapsed }">chevron_right</span>
    </div>
    <!--#endregion-->
    <!--#region Stage Body ──────────────────────────────────────────────────-->
    <div v-if="!collapsed" class="flow-stage-body">
      <!--
        Main content: a purpose-built breakdown for this specific stage
        type, provided by the parent's per-stage renderer (see
        `stageRenderers` in PipelineTab.vue). Previously this was preceded
        by a generic "Expression → Classification" input/arrow/label
        scaffold restating the stage's name in the abstract — removed, it
        added no information the header (label + preview) didn't already
        give, and crowded out room for the stage's actual data.
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
import { stageIcon } from '@bridge/utils';

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
  /** Emoji icon for the stage header (e.g., "⚡", "🔤"), as sent by the
   * engine's DiagnosticPipelineResult — mapped to a Material Symbols icon
   * name for display via `materialIcon` below, without touching the
   * shared engine type. */
  icon: string;
  /** Human-readable stage label (e.g., "VM Execute") */
  label: string;
  /**
   * CSS color class for the stage's left accent bar.
   * Maps to `.flow-stage.{colorClass}` in main.css
   * (e.g., "lexer", "parser", "vm", "normalizer").
   */
  colorClass: string;
  /** Formatted time label (e.g., "1.2 µs" or "—") */
  timeLabel: string;
  /** Active line indicator (e.g., "L3" or "All") */
  activeLine: string;
  /** Whether the stage is currently expanded (v-model) */
  modelValue: boolean;
  /** Compact one-line summary of this stage's output, always visible in
   * the header (both collapsed and expanded) so scanning the pipeline
   * without expanding every card is actually useful. */
  preview?: string;
  /** Whether this is the final result stage (larger output area) */
  isResult?: boolean;
  /** Whether this stage is a gate — a check or branch point that can pass, fail, or redirect the pipeline — vs. a straight-line processing step */
  isGate?: boolean;
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

const materialIcon = computed(() => stageIcon(props.icon));

//#endregion
//#region ─── Methods ──────────────────────────────────────────────────────────

/** Toggle the stage between expanded and collapsed state. */
function toggle(): void {
  emit("update:modelValue", !props.modelValue);
}

//#endregion
</script>
