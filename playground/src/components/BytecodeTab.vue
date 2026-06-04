<template>
  <div class="tab-panel active" id="panel-bytecode">
    <div class="panel-toolbar">
      <span class="bytecode-count">{{ opcodes.length }} opcodes</span>
      <button
        v-if="hasSidebarContent"
        class="bytecode-sidebar-toggle"
        @click="sidebarOpen = !sidebarOpen"
        :title="sidebarOpen ? 'Hide constants sidebar' : 'Show constants sidebar'"
      >
        {{ sidebarOpen ? '◀' : '▶' }} Constants
      </button>
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
            <span class="opcode-col-desc">{{ describeOpcode(op.value, op.args) }}</span>
          </div>
        </div>
        <span v-else class="empty" style="padding:10px;display:block">No opcodes</span>
      </div>

      <!-- Right: Constants + Variables sidebar -->
      <div v-if="hasSidebarContent && sidebarOpen" class="bytecode-sidebar">
        <div class="panel-scroll">
          <!-- Constants grouped by type -->
          <div class="bytecode-sidebar-section">
            <div class="bytecode-sidebar-section-title">📦 Constants</div>
            <div
              v-for="group in constantGroups"
              :key="group.type"
              class="bytecode-sidebar-group"
            >
              <div
                class="bytecode-sidebar-group-header"
                @click="group.expanded = !group.expanded"
              >
                <span class="bytecode-sidebar-group-dot" :class="'dot-' + group.type"></span>
                <span class="bytecode-sidebar-group-label">{{ group.label }}</span>
                <span class="bytecode-sidebar-group-count">{{ group.items.length }}</span>
                <span class="bytecode-sidebar-group-chevron" :class="{ expanded: group.expanded }">▸</span>
              </div>
              <table v-if="group.expanded" class="bytecode-sidebar-table">
                <thead>
                  <tr>
                    <th class="bytecode-sidebar-col-idx">#</th>
                    <th class="bytecode-sidebar-col-val">Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in group.items" :key="item.index" class="bytecode-sidebar-row">
                    <td class="bytecode-sidebar-col-idx">{{ item.index }}</td>
                    <td class="bytecode-sidebar-col-val">
                      <code class="bytecode-sidebar-value" :class="'val-' + group.type">
                        <template v-if="group.type === 'string'">"{{ item.value }}"</template>
                        <template v-else-if="group.type === 'hex'">0x{{ item.value }}</template>
                        <template v-else-if="group.type === 'bigint'">{{ item.value }}n</template>
                        <template v-else>{{ item.value }}</template>
                      </code>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Variables -->
          <div v-if="variables.length > 0" class="bytecode-sidebar-section">
            <div class="bytecode-sidebar-section-title">📋 Variables</div>
            <div class="bytecode-sidebar-chips">
              <span
                v-for="v in variables"
                :key="v"
                class="variable-chip"
                :title="'Variable: :' + v"
              >:{{ v }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDiagnosticReportStore } from '../stores/diagnosticReport.js';
import { describeOpcode } from '../utils.js';
import type { OpcodeInfo, ConstantInfo } from '../engine.js';

const dr = useDiagnosticReportStore();
const sidebarOpen = ref(true);

const opcodes = computed<OpcodeInfo[]>(() => dr.opcodes);
const constants = computed<ConstantInfo[]>(() => dr.constants);
const variables = computed(() => dr.variables);

const hasSidebarContent = computed(() => constants.value.length > 0 || variables.value.length > 0);

/* ── Constants grouped by type ──────────────────────────────────── */
interface ConstantGroup {
  readonly type: ConstantInfo['type'];
  readonly label: string;
  readonly items: readonly ConstantInfo[];
  expanded: boolean;
}

const constantGroups = computed<ConstantGroup[]>(() => {
  const typeOrder: ConstantInfo['type'][] = ['number', 'string', 'bigint', 'hex'];
  const typeLabel: Record<ConstantInfo['type'], string> = {
    number: 'Numbers',
    string: 'Strings',
    bigint: 'BigInts',
    hex: 'Hex Values',
  };

  const groups = new Map<ConstantInfo['type'], ConstantInfo[]>();
  for (const c of constants.value) {
    if (!groups.has(c.type)) groups.set(c.type, []);
    groups.get(c.type)!.push(c);
  }

  return typeOrder
    .filter(t => groups.has(t))
    .map(t => ({
      type: t,
      label: typeLabel[t],
      items: groups.get(t)!,
      expanded: false,
    }));
});

</script>
