<template>
  <div class="tab-panel active" id="panel-vmtrace">
    <context-header label="VM Trace" :line-badge="lineBadge" :expression="activeExpression">
      <template #extra>
        <input type="text" class="token-filter-input" placeholder="Filter opcodes…" spellcheck="false" v-model="filterQuery" style="max-width: 140px;" />
      </template>
    </context-header>
    <div class="panel-toolbar">
      <span class="bytecode-count">{{ filteredSteps.length }} / {{ steps.length }} steps</span>
    </div>

    <!-- Checkpoint markers -->
    <div v-if="checkpoints.length > 0" class="vm-checkpoints-bar">
      <div class="vm-checkpoints-bar-top">
        <span class="vm-checkpoints-title">Checkpoints ({{ checkpoints.length }})</span>
        <span class="vm-checkpoint-nearest" title="The checkpoint at the highest line number recorded so far — not necessarily the one closest to the last-executed instruction pointer.">
          ▼ Latest: L{{ latestCheckpoint?.lineNumber ?? '—' }}
          <span class="vm-checkpoint-nearest-vars">({{ latestCheckpoint?.variableCount ?? 0 }} vars)</span>
        </span>
      </div>
      <div class="vm-checkpoints-chips">
        <span
          v-for="cp in checkpoints"
          :key="cp.lineNumber"
          class="vm-checkpoint-chip"
          :class="{ 'vm-checkpoint-active': cp.lineNumber === latestCheckpoint?.lineNumber }"
          :title="cp.variables.length + ' variable(s): ' + cp.variables.join(', ')"
        >
          L{{ cp.lineNumber }}
          <span class="vm-checkpoint-var-count">({{ cp.variableCount }} vars)</span>
          <span v-if="cp.lineNumber === latestCheckpoint?.lineNumber" class="vm-checkpoint-arrow">◀ latest</span>
        </span>
      </div>
      <div class="vm-checkpoints-note">
        Checkpoints record VM variable state at definition lines for fast restoration.
      </div>
    </div>

    <div class="vm-trace-table">
      <div class="vm-trace-header-row">
        <span class="vm-trace-col-step">#</span>
        <span class="vm-trace-col-ip">IP</span>
        <span class="vm-trace-col-hex">Hex</span>
        <span class="vm-trace-col-op">Opcode</span>
        <span class="vm-trace-col-stack">Stack</span>
        <span class="vm-trace-col-time">Elapsed</span>
      </div>
      <div class="panel-scroll">
        <empty-state v-if="steps.length === 0" icon="bolt" text="No trace data" hint="Evaluate an expression to see its step-by-step VM execution trace." />
        <div v-else-if="filteredSteps.length === 0" class="empty" style="padding: 10px;">No steps match &ldquo;{{ filterQuery }}&rdquo;</div>
        <div v-for="(step, i) in filteredSteps" :key="i" class="vm-trace-row" :class="{ halt: step === steps[steps.length - 1] }">
          <span class="vm-trace-col-step">{{ step.instructionNumber }}</span>
          <span class="vm-trace-col-ip">{{ step.ip }}</span>
          <span class="vm-trace-col-hex">0x{{ step.opcode.toString(16).toUpperCase().padStart(2, '0') }}</span>
          <span class="vm-trace-col-op">{{ step.opcodeName }}</span>
          <span class="vm-trace-col-stack">
            <span class="vm-trace-stack-depth-badge">{{ step.stackDepth }}</span>
            <span class="vm-trace-stack-chips">
              <span v-if="(step.stack ?? []).length === 0" class="vm-stack-empty">∅</span>
              <span
                v-for="(sv, si) in step.stack ?? []"
                :key="si"
                class="vm-stack-chip"
                :class="stackValueTypeClass(sv.type)"
                :title="'Type ' + sv.type + (sv.unit ? ' Unit: ' + sv.unit : '')"
              >{{ formatStackValue(sv) }}</span>
            </span>
          </span>
          <span class="vm-trace-col-time">{{ fmt(step.elapsedNs) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDiagnosticReportStore } from '../stores/diagnosticReport.js';
import { usePipelineStore } from '../stores/pipeline.js';
import { formatStackValue, stackValueTypeClass, fmt } from '@bridge/utils';
import type { VmTraceStep, CheckpointSnapshot } from '@bridge/engine';
import ContextHeader from './shared/ContextHeader.vue';
import EmptyState from './shared/EmptyState.vue';

const dr = useDiagnosticReportStore();
const pl = usePipelineStore();
const steps = computed<VmTraceStep[]>(() => dr.vmTrace);
const checkpoints = computed<CheckpointSnapshot[]>(() => dr.checkpoints);

const filterQuery = ref('');
const filteredSteps = computed(() => {
  const q = filterQuery.value.trim().toLowerCase();
  if (!q) return steps.value;
  return steps.value.filter(s => s.opcodeName.toLowerCase().includes(q));
});

/**
 * The checkpoint at the highest line number recorded — NOT actually
 * "nearest to the current execution point" despite the label this used
 * to have (there's no correlation computed against `ip`/`instructionNumber`
 * here). Renamed to "Latest" to describe what this actually computes.
 */
const latestCheckpoint = computed<CheckpointSnapshot | null>(() => {
  const cps = checkpoints.value;
  if (cps.length === 0) return null;
  return cps.reduce((a, b) => (a.lineNumber > b.lineNumber ? a : b));
});

/* ── Context header ────────────────────────────────────────────── */
const lineBadge = computed(() => (pl.selectedLine !== null ? 'L' + pl.selectedLine : 'All Lines'));
const activeExpression = computed(() => {
  const ln = pl.selectedLine;
  if (ln !== null) {
    const lr = dr.lineResults.find(r => r.lineNumber === ln);
    return lr?.expression ?? '';
  }
  const first = dr.lineResults[0];
  return first?.expression ?? dr.expression ?? '';
});
</script>
