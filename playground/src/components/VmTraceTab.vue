<template>
  <div class="tab-panel active" id="panel-vmtrace">
    <div class="panel-toolbar">
      <span class="bytecode-count">{{ steps.length }} steps</span>
      <span class="toggle-label" style="font-size:10px;color:var(--text-muted)">vmTraceEnabled mode</span>
    </div>
    <div class="vm-trace-table">
      <div class="vm-trace-header-row">
        <span class="vm-trace-col-step">#</span>
        <span class="vm-trace-col-ip">IP</span>
        <span class="vm-trace-col-op">Opcode</span>
        <span class="vm-trace-col-stack">Stack</span>
        <span class="vm-trace-col-time">Elapsed</span>
      </div>
      <div class="panel-scroll">
        <span v-if="steps.length === 0" class="empty">No trace data — enable vmTraceEnabled mode</span>
        <div v-for="(step, i) in steps" :key="i" class="vm-trace-row" :class="{ halt: i === steps.length - 1 }">
          <span class="vm-trace-col-step">{{ step.instructionNumber }}</span>
          <span class="vm-trace-col-ip">{{ step.ip }}</span>
          <span class="vm-trace-col-op" :title="'Opcode 0x' + step.opcode.toString(16).toUpperCase().padStart(2, '0')">{{ step.opcodeName }}</span>
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
          <span class="vm-trace-col-time">{{ (step.elapsedNs / 1_000_000).toFixed(2) }} ms</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useEngineStore } from '../stores/engine.js';
import { formatStackValue, stackValueTypeClass } from '../utils.js';
import type { VmTraceStep } from '../engine.js';

const engine = useEngineStore();
const steps = computed<VmTraceStep[]>(() => engine.currentResult?.vmTrace ?? []);
</script>
