<template>
  <div class="tab-panel active" id="panel-flow">
    <!-- Line selector bar -->
    <div class="pipeline-line-selector">
      <label class="pipeline-line-label">
        <span class="pipeline-line-icon">#</span>
        <span class="pipeline-line-text">Line</span>
      </label>
      <select class="pipeline-line-select" v-model="lineSelectVal">
        <option value="0">All Lines (aggregate)</option>
        <option v-for="lr in lineResults" :key="lr.lineNumber" :value="String(lr.lineNumber)">
          Line {{ lr.lineNumber }}: {{ lr.expression.slice(0, 30) }}{{ lr.expression.length > 30 ? '…' : '' }}
        </option>
      </select>
      <span class="pipeline-active-line-badge">{{ activeLineStr }}</span>
    </div>

    <!-- Stage connectors are between stages -->

    <!-- Pipeline flow stages -->
    <div class="pipeline-flow">

      <pipeline-stage
        :step-number="1" icon="🔤" label="Lexer" color-class="lexer"
        :time-label="fmt(s.lexerTime)" :active-line="stageLabel"
        input="Expression → Tokens" output-label="Tokens" show-arrow
        :output-html="lexerOutput" :executed="hasResult"
        :model-value="stagesCollapsed[0]"
        :pulsing="pulsingStages.includes(0)"
        @update:model-value="(v: boolean) => onStageToggle(0, v)"
      />
      <div class="flow-stage-connector"><span class="connector-arrow">▼</span></div>

      <pipeline-stage
        :step-number="2" icon="🛡️" label="Validation" color-class="validate"
        :time-label="'—'" :active-line="stageLabel"
        input="Length + Complexity" output-label="Status"
        :output-html="validateOutput" :executed="hasResult"
        :has-error="hasErrors"
        :model-value="stagesCollapsed[1]"
        :pulsing="pulsingStages.includes(1)"
        @update:model-value="(v: boolean) => onStageToggle(1, v)"
      />
      <div class="flow-stage-connector"><span class="connector-arrow">▼</span></div>

      <pipeline-stage
        :step-number="3" icon="💾" label="Cache Check" color-class="cache"
        :time-label="'—'" :active-line="stageLabel"
        input="Bytecode Lookup" output-label="Status"
        :output-html="cacheOutput" :executed="hasResult"
        :model-value="stagesCollapsed[2]"
        :pulsing="pulsingStages.includes(2)"
        @update:model-value="(v: boolean) => onStageToggle(2, v)"
      />
      <div class="flow-stage-connector"><span class="connector-arrow">▼</span></div>

      <pipeline-stage
        :step-number="4" icon="🌳" label="Parser" color-class="parser"
        :time-label="fmt(s.parserTime)" :active-line="stageLabel"
        input="Tokens → AST" output-label="Parselets"
        :output-html="parserOutput" :executed="hasResult"
        :model-value="stagesCollapsed[3]"
        :pulsing="pulsingStages.includes(3)"
        @update:model-value="(v: boolean) => onStageToggle(3, v)"
      />
      <div class="flow-stage-connector"><span class="connector-arrow">▼</span></div>

      <pipeline-stage
        :step-number="5" icon="⚙️" label="Compiler" color-class="compiler"
        :time-label="fmt(s.bytecodeTime)" :active-line="stageLabel"
        input="AST → Bytecode" output-label="Opcodes"
        :output-html="compilerOutput" :executed="hasResult"
        :model-value="stagesCollapsed[4]"
        :pulsing="pulsingStages.includes(4)"
        @update:model-value="(v: boolean) => onStageToggle(4, v)"
      />
      <div class="flow-stage-connector"><span class="connector-arrow">▼</span></div>

      <pipeline-stage
        :step-number="6" icon="🔮" label="Async Preflight" color-class="async"
        :time-label="'—'" :active-line="stageLabel"
        input="Resolver Registry" output-label="Path"
        :output-html="asyncOutput" :executed="hasResult"
        :model-value="stagesCollapsed[5]"
        :pulsing="pulsingStages.includes(5)"
        @update:model-value="(v: boolean) => onStageToggle(5, v)"
      />
      <div class="flow-stage-connector"><span class="connector-arrow">▼</span></div>

      <pipeline-stage
        :step-number="7" icon="⚡" label="VM Execute" color-class="vm"
        :time-label="fmt(s.executionTime)" :active-line="stageLabel"
        input="Bytecode → Stack" output-label="Type"
        :output-html="vmOutput" :executed="hasResult"
        :model-value="stagesCollapsed[6]"
        :pulsing="pulsingStages.includes(6)"
        @update:model-value="(v: boolean) => onStageToggle(6, v)"
      />
      <div class="flow-stage-connector"><span class="connector-arrow">▼</span></div>

      <pipeline-stage
        :step-number="8" icon="✓" label="Result" color-class="result"
        :time-label="fmt(result?.stats?.totalTime ?? 0)" :active-line="stageLabel"
        :output-html="resultOutput" :executed="hasResult"
        :is-result="true"
        :model-value="stagesCollapsed[7]"
        :pulsing="pulsingStages.includes(7)"
        @update:model-value="(v: boolean) => onStageToggle(7, v)"
      />
    </div>

    <!-- Pipeline summary stats -->
    <div class="pipeline-detail">
      <div class="detail-row"><span class="detail-label">Tokens</span><span class="detail-value">{{ tokenCount }}</span></div>
      <div class="detail-row"><span class="detail-label">Opcodes</span><span class="detail-value">{{ opcodeCount }}</span></div>
      <div class="detail-row"><span class="detail-label">Cache</span><span class="detail-value">{{ cacheStatus }}</span></div>
      <div class="detail-row"><span class="detail-label">Async</span><span class="detail-value">{{ asyncStatus }}</span></div>
    </div>

    <!-- Bytecode Constants Table -->
    <div v-if="allConstants.length > 0" class="constants-table-section">
      <div
        class="constants-section-header"
        @click="constantsExpanded = !constantsExpanded"
        role="button"
        :aria-expanded="constantsExpanded"
      >
        <span class="constants-section-title">📦 Constants</span>
        <span class="constants-section-total">{{ filteredTotal }}</span>
        <span class="constants-section-chevron" :class="{ expanded: constantsExpanded }">▸</span>
      </div>

      <!-- Filter input (visible when expanded) -->
      <div v-if="constantsExpanded" class="constants-filter-row" @click.stop>
        <input
          class="constants-filter-input"
          type="text"
          v-model="constantsFilter"
          placeholder="Filter by index or value…"
          spellcheck="false"
        />
      </div>

      <template v-if="constantsExpanded">
        <!-- Per-type groups -->
        <div
          v-for="group in filteredConstantGroups"
          :key="group.type"
          class="constant-group"
        >
          <div
            class="constant-group-header"
            @click="group.expanded = !group.expanded"
            role="button"
            :aria-expanded="group.expanded"
          >
            <span class="constant-group-dot" :class="'dot-' + group.type"></span>
            <span class="constant-group-label">{{ group.label }}</span>
            <span class="constant-group-count">{{ group.matchCount ?? group.items.length }}</span>
            <span class="constant-group-chevron" :class="{ expanded: group.expanded }">▸</span>
          </div>

          <table v-if="group.expanded" class="constant-table">
            <thead>
              <tr>
                <th class="constant-col-idx">#</th>
                <th class="constant-col-val">Value</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in (group.filteredItems ?? group.items)"
                :key="item.index"
                class="constant-row"
                :class="'row-' + group.type"
              >
                <td class="constant-col-idx">{{ item.index }}</td>
                <td class="constant-col-val">
                  <code class="constant-value" :class="'val-' + group.type">
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
      </template>
    </div>

    <!-- Variables (matching vanilla renderVariables) -->
    <div v-if="allVariables.length > 0" class="variables-section">
      <div
        class="variables-section-header"
        @click="variablesExpanded = !variablesExpanded"
        role="button"
        :aria-expanded="variablesExpanded"
      >
        <span class="variables-section-title">📋 Variables</span>
        <span class="variables-section-total">{{ allVariables.length }} variable{{ allVariables.length !== 1 ? 's' : '' }}</span>
        <span class="variables-section-chevron" :class="{ expanded: variablesExpanded }">▸</span>
      </div>

      <div v-if="variablesExpanded" class="variables-chips">
        <span
          v-for="v in allVariables"
          :key="v"
          class="variable-chip"
          :title="'Variable: :' + v"
        >:{{ v }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useEngineStore } from '../stores/engine.js';
import { usePipelineStore } from '../stores/pipeline.js';
import { fmt, escHtml, describeOpcode } from '../utils.js';
import PipelineStage from './PipelineStage.vue';
import type { Token, LineResult, ConstantInfo } from '../engine.js';

const engine = useEngineStore();
const pipeline = usePipelineStore();

const result = computed(() => engine.currentResult);
const hasResult = computed(() => !!result.value);
const lineResults = computed<LineResult[]>(() => result.value?.lineResults ?? []);
const NUM_STAGES = 8;

/* ── Stage collapse state (driven by store) ────────────────── */
const stagesCollapsed = ref<boolean[]>(
  Array(NUM_STAGES).fill(true),
);

function saveCurrentExpansion(): void {
  const lineKey = pipeline.selectedLine ?? 0;
  pipeline.saveStageExpansion(lineKey, [...stagesCollapsed.value]);
}

function onStageToggle(index: number, value: boolean): void {
  stagesCollapsed.value[index] = value;
  saveCurrentExpansion();
}

/* ── Respond to HeaderBar collapse/expand buttons ───────────── */
watch(() => pipeline.collapseAllTrigger, () => {
  stagesCollapsed.value = Array(NUM_STAGES).fill(true);
  saveCurrentExpansion();
});

watch(() => pipeline.expandAllTrigger, () => {
  stagesCollapsed.value = Array(NUM_STAGES).fill(false);
  saveCurrentExpansion();
});

/* ── Flash-pulse snapshot logic ─────────────────────────────── */
const pulsingStages = ref<number[]>([]);
let pulseTimer: ReturnType<typeof setTimeout> | null = null;

/** Compute text snapshot of all 8 stage outputs for change detection. */
const stageOutputs = computed<string[]>(() => [
  lexerOutput.value,
  validateOutput.value,
  cacheOutput.value,
  parserOutput.value,
  compilerOutput.value,
  asyncOutput.value,
  vmOutput.value,
  resultOutput.value,
]);

/** Clean up flash-pulse timer on unmount. */
onUnmounted(() => {
  if (pulseTimer) clearTimeout(pulseTimer);
});

/** Compare current outputs with saved snapshot and pulse changed stages. */
function detectAndPulseChanges(): void {
  const lineKey = pipeline.selectedLine ?? 0;
  const oldSnapshot = pipeline.getStageSnapshot(lineKey);
  const newSnapshot = stageOutputs.value;

  if (oldSnapshot && oldSnapshot.length === NUM_STAGES) {
    const changed: number[] = [];
    for (let i = 0; i < NUM_STAGES; i++) {
      if (oldSnapshot[i] !== newSnapshot[i]) {
        changed.push(i);
      }
    }
    if (changed.length > 0) {
      pulsingStages.value = changed;
      if (pulseTimer) clearTimeout(pulseTimer);
      pulseTimer = setTimeout(() => {
        pulsingStages.value = [];
        pulseTimer = null;
      }, 650); // 600ms animation + 50ms buffer
    }
  }

  // Save new snapshot for next comparison
  pipeline.saveStageSnapshot(lineKey, [...newSnapshot]);
}

/* ── Flash-pulse on line switch ────────────────────────────── */
watch(() => pipeline.selectedLine, () => {
  detectAndPulseChanges();
});

/* ── Selected line data ───────────────────────────────────────── */
const lineSelectVal = ref('0');

watch(lineSelectVal, (val) => {
  const ln = val === '0' ? null : Number(val);
  // If selectedLine already matches, this was a sync from the other watcher — skip
  if (ln === pipeline.selectedLine) return;
  pipeline.selectLine(ln, true);
});

// Sync from engine cursor tracking (when not manually changed)
watch(() => pipeline.selectedLine, (ln) => {
  if (!pipeline.dropdownManuallyChanged) {
    lineSelectVal.value = ln === null ? '0' : String(ln);
  }
});

const activeLineStr = computed(() =>
  pipeline.selectedLine !== null ? 'Line ' + pipeline.selectedLine : 'All Lines',
);

const stageLabel = computed(() =>
  pipeline.selectedLine !== null ? 'L' + pipeline.selectedLine : 'All',
);

const selectedLine = computed(() => pipeline.selectedLine);

/* ── Per-line filtering ───────────────────────────────────────── */
const lineTokens = computed<Token[]>(() => {
  const t = result.value?.rawTokens ?? [];
  if (selectedLine.value === null) return t;
  return t.filter(tk => (tk as any).line === selectedLine.value);
});

const perLineResult = computed(() =>
  selectedLine.value !== null
    ? lineResults.value.find(lr => lr.lineNumber === selectedLine.value) ?? null
    : null,
);

const s = computed(() => result.value?.stats ?? { lexerTime: 0, parserTime: 0, bytecodeTime: 0, executionTime: 0, totalTime: 0 });

const hasErrors = computed(() => perLineResult.value?.error ? true : (selectedLine.value === null && (result.value?.errors?.length ?? 0) > 0));
const wasCached = computed(() => !(result.value?.parselets?.length ?? 0) && (result.value?.rawTokens?.length ?? 0) > 0);
const hasAsync = computed(() =>
  selectedLine.value !== null
    ? perLineResult.value?.type === 'Pending'
    : lineResults.value.some(lr => lr.type === 'Pending'),
);

const totalLines = computed(() => lineResults.value.length);

/* ── Stage outputs ────────────────────────────────────────────── */
const lexerOutput = computed(() => {
  const tokens = lineTokens.value.filter(t => t.type != null && t.type !== 'WS' && t.type !== 'NEWLINE');
  if (selectedLine.value === null && tokens.length > 0) {
    const typeCounts = new Map<string, number>();
    for (const t of tokens) typeCounts.set(t.type, (typeCounts.get(t.type) ?? 0) + 1);
    let html = '<span style="color:var(--text-secondary);font-size:10px;font-weight:500">' + tokens.length + ' tokens · </span>';
    typeCounts.forEach((count, type) => {
      html += '<span class="token token-' + (type || 'unknown').toLowerCase() + '" style="font-size:9px;cursor:default">' + count + ' ' + (type || 'unknown').toLowerCase() + '</span> ';
    });
    return html;
  }
  const first = tokens.slice(0, 8);
  return first.map(t => '<span class="token token-' + (t.type || 'unknown').toLowerCase() + '" style="font-size:9px;cursor:default">' + escHtml(t.value) + '</span>').join(' ') || '—';
});

const validateOutput = computed(() => {
  const passed = lineResults.value.filter(lr => !lr.error).length;
  const errors = totalLines.value - passed;
  if (selectedLine.value === null && totalLines.value > 1) {
    const col = errors === 0 ? '#4ec9b0' : errors === totalLines.value ? '#f48771' : '#dcdcaa';
    return '<span style="color:' + col + ';font-size:10px">' + passed + '/' + totalLines.value + ' lines passed' +
      (errors > 0 ? ' <span style="color:#f48771;font-weight:500">(' + errors + ' error' + (errors > 1 ? 's' : '') + ')</span>' : ' ✓') + '</span>';
  }
  const perLineTokens = lineTokens.value.filter(t => t.type !== 'WS' && t.type !== 'NEWLINE');
  return perLineTokens.length > 0
    ? '<span style="color:' + (hasErrors.value ? '#f48771' : '#4ec9b0') + ';font-size:10px">' + (hasErrors.value ? 'Failed' : perLineTokens.length + ' tokens ✓') + '</span>'
    : '—';
});

const cacheOutput = computed(() => {
  const tokens = lineTokens.value.filter(t => t.type != null && t.type !== 'WS' && t.type !== 'NEWLINE');
  if (selectedLine.value === null && totalLines.value > 1) {
    const hitLines = lineResults.value.filter(lr => !lr.parselet).length;
    const missLines = lineResults.value.filter(lr => lr.parselet).length;
    return '<span style="color:' + (hitLines > missLines ? '#4ec9b0' : '#5ac8fa') + ';font-size:10px;font-weight:600">Hit ' + hitLines + ' / Miss ' + missLines + '</span>';
  }
  if (tokens.length === 0) return '—';
  return '<span style="color:' + (wasCached.value ? '#4ec9b0' : '#5ac8fa') + ';font-size:10px;font-weight:600">' + (wasCached.value ? 'Hit' : 'Miss') + '</span>';
});

const parserOutput = computed(() => {
  const names = [...new Set(result.value?.parselets?.map((p: any) => p.parseletType) ?? [])] as string[];
  if (selectedLine.value === null && totalLines.value > 1 && names.length > 0) {
    return '<span style="color:#9b7bec;font-size:10px">' + names.length + ' parselet type' + (names.length > 1 ? 's' : '') + '</span>';
  }
  return names.length > 0
    ? names.map(p => '<span class="token token-keyword" style="font-size:9px;cursor:default">' + escHtml(p) + '</span>').join(' ')
    : (wasCached.value ? '<span style="color:#6b6b75;font-size:10px">Skipped (cache hit)</span>' : '—');
});

const compilerOutput = computed(() => {
  const ops = result.value?.opcodes ?? [];
  if (ops.length === 0) {
    return wasCached.value
      ? '<span style="color:#6b6b75;font-size:10px">Skipped (cache hit)</span>'
      : '—';
  }

  // Build the opcodes disassembly table (matching vanilla renderOpcodesDisasm)
  let html = '<div class="pipeline-opcodes-wrap">';
  html += '<table class="pipeline-opcodes-table"><thead><tr>';
  html += '<th class="pop-col-ip">IP</th>';
  html += '<th class="pop-col-hex">Hex</th>';
  html += '<th class="pop-col-mnem">Mnemonic</th>';
  html += '<th class="pop-col-oper">Operand</th>';
  html += '<th class="pop-col-desc">Description</th>';
  html += '</tr></thead><tbody>';

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const hex = '0x' + op.value.toString(16).toUpperCase().padStart(2, '0');
    const operand = op.args.length > 0 ? op.args.join(', ') : '—';
    const desc = describeOpcode(op.value, op.args);
    html += '<tr>';
    html += '<td class="pop-col-ip">' + i + '</td>';
    html += '<td class="pop-col-hex">' + escHtml(hex) + '</td>';
    html += '<td class="pop-col-mnem">' + escHtml(op.name) + '</td>';
    html += '<td class="pop-col-oper">' + escHtml(operand) + '</td>';
    html += '<td class="pop-col-desc">' + escHtml(desc) + '</td>';
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  return html;
});

const asyncOutput = computed(() => {
  if (selectedLine.value === null && totalLines.value > 1) {
    const pending = lineResults.value.filter(lr => lr.type === 'Pending').length;
    const sync = totalLines.value - pending;
    return pending > 0
      ? '<span style="color:#ffd866;font-size:10px">' + pending + ' pending</span>' + (sync > 0 ? ' <span style="color:#6b6b75;font-size:10px">/ ' + sync + ' sync</span>' : '')
      : '<span style="color:#6b6b75;font-size:10px">' + sync + ' sync</span>';
  }
  return hasAsync.value
    ? '<span style="color:#ffd866;font-size:10px">Pending resolution</span>'
    : '<span style="color:#6b6b75;font-size:10px">Sync path</span>';
});

const vmOutput = computed(() => {
  if (selectedLine.value === null && totalLines.value > 1) {
    const errors = lineResults.value.filter(lr => lr.error).length;
    return '<span style="color:#29ce99;font-size:10px">' + totalLines.value + ' result' + (totalLines.value > 1 ? 's' : '') +
      (errors > 0 ? ' (' + errors + ' error' + (errors > 1 ? 's' : '') + ')' : '') + '</span>';
  }
  const t = perLineResult.value ?? lineResults.value[0];
  return t ? '<span style="color:#29ce99;font-size:10px">' + (t.error ? 'Error' : t.type) + '</span>' : '—';
});

const resultOutput = computed(() => {
  if (selectedLine.value === null && totalLines.value > 1) {
    const errors = lineResults.value.filter(lr => lr.error).length;
    const passed = totalLines.value - errors;
    return '<span style="color:#29ce99">' + passed + ' value' + (passed !== 1 ? 's' : '') +
      (errors > 0 ? ' <span style="color:#f48771">(' + errors + ' error' + (errors > 1 ? 's' : '') + ')</span>' : '') + '</span>';
  }
  const t = perLineResult.value ?? lineResults.value[lineResults.value.length - 1];
  return t ? '<span style="color:' + (t.error ? '#f48771' : '#29ce99') + '">' + escHtml(t.error || t.result) + '</span>' : '—';
});

/* ── Detail stats ──────────────────────────────────────────────── */
const tokenCount = computed(() => String(result.value?.rawTokens?.length ?? 0));
const opcodeCount = computed(() => String(result.value?.opcodes?.length ?? 0));
const cacheStatus = computed(() => wasCached.value ? 'hit' : ((result.value?.parselets?.length ?? 0) > 0 ? 'miss' : '—'));
const asyncStatus = computed(() => hasAsync.value ? 'yes' : 'no');

/* ── Constants table ────────────────────────────────────────────── */

interface ConstantGroup {
  readonly type: ConstantInfo['type'];
  readonly label: string;
  readonly items: readonly ConstantInfo[];
  expanded: boolean;
  /** Filtered subset when filter is active; undefined means no filter applied. */
  filteredItems?: readonly ConstantInfo[];
  matchCount?: number;
}

const allConstants = computed<ConstantInfo[]>(() => result.value?.constants ?? []);
const constantsExpanded = ref(false);
const constantsFilter = ref('');

/** Total count display: shows filtered match count when filtering, full total otherwise. */
const filteredTotal = computed(() => {
  const f = constantsFilter.value.trim();
  if (!f) return allConstants.value.length + ' total';
  const matchCount = filteredConstantGroups.value.reduce((sum, g) => sum + (g.matchCount ?? 0), 0);
  return matchCount + ' / ' + allConstants.value.length + ' total';
});

/* ── Variables display ──────────────────────────────────────────── */
const allVariables = computed<string[]>(() => result.value?.variables ?? []);
const variablesExpanded = ref(false);

/** Group constants by type, preserving engine order within each group. */
const constantGroups = computed<ConstantGroup[]>(() => {
  const typeOrder: ConstantInfo['type'][] = ['number', 'string', 'bigint', 'hex'];
  const typeLabel: Record<ConstantInfo['type'], string> = {
    number: 'Numbers',
    string: 'Strings',
    bigint: 'BigInts',
    hex: 'Hex Values',
  };

  const groups = new Map<ConstantInfo['type'], ConstantInfo[]>();
  for (const c of allConstants.value) {
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

/** Filtered groups: when a filter query is active, narrow items and auto-expand matching groups. */
const filteredConstantGroups = computed<ConstantGroup[]>(() => {
  const query = constantsFilter.value.trim().toLowerCase();
  if (!query) return constantGroups.value;

  return constantGroups.value
    .map(g => {
      const matches = g.items.filter(item => {
        // Match by index (exact)
        if (String(item.index) === query) return true;
        // Match by value substring (case-insensitive)
        if (String(item.value).toLowerCase().includes(query)) return true;
        return false;
      });
      return {
        ...g,
        filteredItems: matches,
        matchCount: matches.length,
        expanded: matches.length > 0 || g.expanded,
      };
    })
    .filter(g => (g.matchCount ?? 0) > 0);
});
</script>
