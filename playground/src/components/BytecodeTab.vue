<template>
  <div class="tab-panel active" id="panel-bytecode">
    <context-header label="Bytecode" :line-badge="lineBadge" :expression="activeExpression">
      <template #extra>
        <button
          v-if="hasSidebarContent"
          class="bytecode-sidebar-toggle"
          @click="sidebarOpen = !sidebarOpen"
          :title="sidebarOpen ? 'Hide constants sidebar' : 'Show constants sidebar'"
        >
          <span class="msi msi-dense">{{ sidebarOpen ? 'chevron_right' : 'chevron_left' }}</span> Constants
        </button>
      </template>
    </context-header>
    <div class="panel-toolbar">
      <span class="bytecode-count">{{ opcodes.length }} opcode{{ opcodes.length !== 1 ? 's' : '' }}</span>
      <span class="diag-legend" style="margin-left: auto; padding: 2px 8px; border: none; background: none;">
        Accumulated across all evaluated lines in this document — not scoped to one line.
      </span>
    </div>
    <div class="bytecode-layout">
      <!-- Left: Opcodes disassembly -->
      <div class="bytecode-disasm">
        <div class="bytecode-header-row">
          <span class="bytecode-col-ip">IP</span>
          <span class="bytecode-col-hex">Hex</span>
          <span class="bytecode-col-mnem">Mnemonic</span>
          <span class="bytecode-col-operand">Operand</span>
          <span class="bytecode-col-desc">Description</span>
        </div>
        <div class="panel-scroll" v-if="opcodes.length > 0">
          <div v-for="(op, i) in opcodes" :key="i" class="opcode-row">
            <span class="opcode-col-ip">{{ i }}</span>
            <span class="opcode-col-hex">{{ '0x' + op.value.toString(16).toUpperCase().padStart(2, '0') }}</span>
            <span class="opcode-col-mnem">{{ op.name }}</span>
            <span class="opcode-col-operand">{{ op.args.length > 0 ? op.args.join(', ') : '—' }}</span>
            <span class="opcode-col-desc">{{ describeOpcode(op.name, op.args) }}</span>
          </div>
        </div>
        <empty-state v-else icon="data_object" text="No opcodes" hint="Evaluate an expression to see its compiled bytecode disassembly." />
      </div>

      <!-- Right: Constants + Variables sidebar -->
      <div v-if="hasSidebarContent && sidebarOpen" class="bytecode-sidebar">
        <div class="panel-scroll">
          <constants-explorer :constants="constants" />
          <variables-chips :variables="variables" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDiagnosticReportStore } from '../stores/diagnosticReport.js';
import { usePipelineStore } from '../stores/pipeline.js';
import { describeOpcode } from '@bridge/utils';
import type { OpcodeInfo, ConstantInfo } from '@bridge/engine';
import ContextHeader from './shared/ContextHeader.vue';
import EmptyState from './shared/EmptyState.vue';
import ConstantsExplorer from './shared/ConstantsExplorer.vue';
import VariablesChips from './shared/VariablesChips.vue';

const dr = useDiagnosticReportStore();
const pl = usePipelineStore();
const sidebarOpen = ref(true);

const opcodes = computed<OpcodeInfo[]>(() => dr.opcodes);
const constants = computed<ConstantInfo[]>(() => dr.constants);
const variables = computed(() => dr.variables);

const hasSidebarContent = computed(() => constants.value.length > 0 || variables.value.length > 0);

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
