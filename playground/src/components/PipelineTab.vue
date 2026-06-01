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
        <option v-for="lr in lineResults" :key="lr.lineNumber" :value="String(lr.lineNumber ?? 1)">
          Line {{ lr.lineNumber ?? 1 }}: {{ lr.expression.slice(0, 30) }}{{ lr.expression.length > 30 ? '…' : '' }}
        </option>
      </select>
      <span class="pipeline-active-line-badge">{{ activeLineStr }}</span>
    </div>

    <!-- Data-driven pipeline flow stages -->
    <div class="pipeline-flow" v-if="displayStages.length > 0">
      <template v-for="(stage, i) in displayStages" :key="stage.stage">
        <pipeline-stage
          :step-number="stage.stepNumber"
          :icon="stage.icon"
          :label="stage.label"
          :color-class="stage.colorClass"
          :time-label="getStageTime(stage)"
          :active-line="stageLabel"
          :input="getStageInput(stage)"
          :output-label="getStageOutputLabel(stage)"
          :show-arrow="!isResultStage(stage)"
          :is-result="isResultStage(stage)"
          :executed="hasResult"
          :has-error="isErrorStage(stage)"
          :skipped="stage.skipped"
          :model-value="stagesCollapsed[i] ?? true"
          :pulsing="pulsingStages.includes(i)"
          @update:model-value="(v: boolean) => onStageToggle(i, v)"
        >
          <template #output>
            <component
              v-if="stageRenderers[stage.stage]"
              :is="() => stageRenderers[stage.stage](stage)"
            />
            <span v-else class="empty">—</span>
          </template>
          <template v-if="stage.stage === 'normalizer' && hasNormalizerDetail(stage)" #detail>
            <component :is="() => normalizerDetailRenderer(stage)" />
          </template>
        </pipeline-stage>
        <div v-if="!isResultStage(stage)" class="flow-stage-connector">
          <span class="connector-arrow">▼</span>
        </div>
      </template>
    </div>

    <!-- Pipeline summary stats -->
    <div class="pipeline-detail">
      <div class="detail-row"><span class="detail-label">Tokens</span><span class="detail-value">{{ tokenCount }}</span></div>
      <div class="detail-row"><span class="detail-label">Opcodes</span><span class="detail-value">{{ opcodeCount }}</span></div>
      <div class="detail-row"><span class="detail-label">Cache</span><span class="detail-value">{{ cacheStatus }}</span></div>
      <div class="detail-row"><span class="detail-label">Async</span><span class="detail-value">{{ asyncStatus }}</span></div>
      <div v-if="displayStages.length > 0" class="detail-row"><span class="detail-label">Stages</span><span class="detail-value">{{ displayStages.length }} stage{{ displayStages.length !== 1 ? 's' : '' }}</span></div>
    </div>

    <!-- Bytecode Constants Table -->
    <div v-if="allConstants.length > 0" class="constants-table-section">
      <div class="constants-section-header" @click="constantsExpanded = !constantsExpanded" role="button" :aria-expanded="constantsExpanded">
        <span class="constants-section-title">📦 Constants</span>
        <span class="constants-section-total">{{ filteredTotal }}</span>
        <span class="constants-section-chevron" :class="{ expanded: constantsExpanded }">▸</span>
      </div>
      <div v-if="constantsExpanded" class="constants-filter-row" @click.stop>
        <input class="constants-filter-input" type="text" v-model="constantsFilter" placeholder="Filter by index or value…" spellcheck="false" />
      </div>
      <template v-if="constantsExpanded">
        <div v-for="group in filteredConstantGroups" :key="group.type" class="constant-group">
          <div class="constant-group-header" @click="group.expanded = !group.expanded" role="button" :aria-expanded="group.expanded">
            <span class="constant-group-dot" :class="'dot-' + group.type"></span>
            <span class="constant-group-label">{{ group.label }}</span>
            <span class="constant-group-count">{{ group.matchCount ?? group.items.length }}</span>
            <span class="constant-group-chevron" :class="{ expanded: group.expanded }">▸</span>
          </div>
          <table v-if="group.expanded" class="constant-table"><thead><tr><th class="constant-col-idx">#</th><th class="constant-col-val">Value</th></tr></thead>
            <tbody><tr v-for="item in (group.filteredItems ?? group.items)" :key="item.index" class="constant-row" :class="'row-' + group.type">
              <td class="constant-col-idx">{{ item.index }}</td>
              <td class="constant-col-val"><code class="constant-value" :class="'val-' + group.type">
                <template v-for="(seg, i) in valueSegments(group.type, item.value)" :key="i"><mark v-if="seg.highlight" class="constant-highlight">{{ seg.text }}</mark><span v-else>{{ seg.text }}</span></template>
              </code></td>
            </tr></tbody></table>
        </div>
      </template>
    </div>

    <!-- Variables -->
    <div v-if="allVariables.length > 0" class="variables-section">
      <div class="variables-section-header" @click="variablesExpanded = !variablesExpanded" role="button" :aria-expanded="variablesExpanded">
        <span class="variables-section-title">📋 Variables</span>
        <span class="variables-section-total">{{ allVariables.length }} variable{{ allVariables.length !== 1 ? 's' : '' }}</span>
        <span class="variables-section-chevron" :class="{ expanded: variablesExpanded }">▸</span>
      </div>
      <div v-if="variablesExpanded" class="variables-chips">
        <span v-for="v in allVariables" :key="v" class="variable-chip" :title="'Variable: :' + v">:{{ v }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch, h } from 'vue';
import { useEngineStore } from '../stores/engine.js';
import { usePipelineStore } from '../stores/pipeline.js';
import { fmt } from '../utils.js';
import PipelineStage from './PipelineStage.vue';
import type { Token, LineResult, ConstantInfo } from '../engine.js';
import type { PipelineStageResult, StageOutput } from '@/solve-js/src/types/DiagnosticPipelineResult';

const engine = useEngineStore();
const pipelineStore = usePipelineStore();

const result = computed(() => engine.currentResult);
const hasResult = computed(() => !!result.value);
const lineResults = computed<LineResult[]>(() => result.value?.lineResults ?? []);

/* ── Structured pipeline stages from engine ──────────────────── */
const displayStages = computed<PipelineStageResult[]>(() => result.value?.pipelineStages ?? []);
const numStages = computed(() => displayStages.value.length || 8);

/* ── Stage collapse state (driven by store) ──────────────────── */
const stagesCollapsed = ref<boolean[]>(Array(numStages.value).fill(true));

watch(numStages, (n) => {
  if (stagesCollapsed.value.length !== n) {
    const old = stagesCollapsed.value;
    stagesCollapsed.value = Array.from({ length: n }, (_, i) => old[i] ?? true);
  }
});

function saveCurrentExpansion(): void {
  const lineKey = pipelineStore.selectedLine ?? 0;
  pipelineStore.saveStageExpansion(lineKey, [...stagesCollapsed.value]);
}

function onStageToggle(index: number, value: boolean): void {
  stagesCollapsed.value[index] = value;
  saveCurrentExpansion();
}

/* ── Respond to HeaderBar collapse/expand buttons ───────────── */
watch(() => pipelineStore.collapseAllTrigger, () => {
  stagesCollapsed.value = Array(numStages.value).fill(true);
  saveCurrentExpansion();
});
watch(() => pipelineStore.expandAllTrigger, () => {
  stagesCollapsed.value = Array(numStages.value).fill(false);
  saveCurrentExpansion();
});

/* ── Flash-pulse snapshot logic ──────────────────────────────── */
const pulsingStages = ref<number[]>([]);
let pulseTimer: ReturnType<typeof setTimeout> | null = null;

const stageOutputs = computed<string[]>(() =>
  displayStages.value.map(s => JSON.stringify(s.output)),
);

onUnmounted(() => { if (pulseTimer) clearTimeout(pulseTimer); });

function detectAndPulseChanges(): void {
  const lineKey = pipelineStore.selectedLine ?? 0;
  const oldSnapshot = pipelineStore.getStageSnapshot(lineKey);
  const newSnapshot = stageOutputs.value;
  if (oldSnapshot && oldSnapshot.length === numStages.value) {
    const changed: number[] = [];
    for (let i = 0; i < numStages.value; i++) {
      if (oldSnapshot[i] !== newSnapshot[i]) changed.push(i);
    }
    if (changed.length > 0) {
      pulsingStages.value = changed;
      if (pulseTimer) clearTimeout(pulseTimer);
      pulseTimer = setTimeout(() => { pulsingStages.value = []; pulseTimer = null; }, 650);
    }
  }
  pipelineStore.saveStageSnapshot(lineKey, [...newSnapshot]);
}

watch(() => pipelineStore.selectedLine, () => { detectAndPulseChanges(); });

/* ── Select line data ────────────────────────────────────────── */
const lineSelectVal = ref('0');
watch(lineSelectVal, (val) => {
  const ln = val === '0' ? null : Number(val);
  if (ln === pipelineStore.selectedLine) return;
  pipelineStore.selectLine(ln, true);
});
watch(() => pipelineStore.selectedLine, (ln) => {
  if (!pipelineStore.dropdownManuallyChanged) lineSelectVal.value = ln === null ? '0' : String(ln);
});

const activeLineStr = computed(() => pipelineStore.selectedLine !== null ? 'Line ' + pipelineStore.selectedLine : 'All Lines');
const stageLabel = computed(() => pipelineStore.selectedLine !== null ? 'L' + pipelineStore.selectedLine : 'All');
const selectedLine = computed(() => pipelineStore.selectedLine);

/* ── Per-line filtering ──────────────────────────────────────── */
const lineTokens = computed<Token[]>(() => {
  const t = result.value?.rawTokens ?? [];
  if (selectedLine.value === null) return t;
  return t.filter(tk => (tk as any).line === selectedLine.value);
});
const perLineResult = computed(() =>
  selectedLine.value !== null ? lineResults.value.find(lr => (lr.lineNumber ?? 1) === selectedLine.value) ?? null : null,
);
const hasErrors = computed(() => perLineResult.value?.error ? true : (selectedLine.value === null && (result.value?.errors?.length ?? 0) > 0));
const totalLines = computed(() => lineResults.value.length);

/* ── Stage helper functions ──────────────────────────────────── */
function isResultStage(stage: PipelineStageResult): boolean {
  return stage.stage === 'result';
}
function isErrorStage(stage: PipelineStageResult): boolean {
  if (stage.stage === 'safety_length' || stage.stage === 'safety_complexity') {
    const o = stage.output as any;
    return o.passed === false;
  }
  return false;
}
function getStageTime(stage: PipelineStageResult): string {
  return stage.elapsedNs > 0 ? fmt(stage.elapsedNs) : '—';
}
function getStageInput(stage: PipelineStageResult): string {
  const inputs: Record<string, string> = {
    pipeline_start: 'Initialize',
    safety_length: 'Expression → Limit Check',
    lexer: 'Expression → Tokens',
    normalizer: 'Tokens → Normalized Tokens',
    safety_complexity: 'Tokens → Complexity Score',
    readwrite: 'Tokens → Variable Tracking',
    cache_check: 'Bytecode Lookup',
    parser: 'Tokens → AST',
    compiler: 'AST → Bytecode',
    async_preflight: 'Resolver Registry',
    vm_execute: 'Bytecode → Stack',
    dag_registration: 'Reads/Writes → DAG',
    linecache: 'Store Result',
    result: '',
    pipeline_end: '',
  };
  return inputs[stage.stage] || stage.stage;
}
function getStageOutputLabel(stage: PipelineStageResult): string {
  const labels: Record<string, string> = {
    pipeline_start: 'Status',
    safety_length: 'Status',
    lexer: 'Tokens',
    normalizer: 'Fusions',
    safety_complexity: 'Status',
    readwrite: 'Variables',
    cache_check: 'Status',
    parser: 'Parselets',
    compiler: 'Opcodes',
    async_preflight: 'Path',
    vm_execute: 'Type',
    dag_registration: 'Registered',
    linecache: 'Line',
    result: '',
    pipeline_end: '',
  };
  return labels[stage.stage] || '';
}

/* ── Shared helpers ────────────────────────────────────────── */

/** Map token type to CSS class for token chips in normalizer detail */
function tokClass(t: { type?: string }): string {
  const type = String(t.type || '').toLowerCase();
  if (['number','hex','bigint'].includes(type)) return 'val-number';
  if (type === 'ident') return 'val-ident';
  if (['star','plus','minus','slash','caret','equals'].includes(type)) return 'val-operator';
  if (type === 'keyword' || type.includes('_by')) return 'val-keyword';
  return 'val-default';
}

/* ── Data-driven stage renderers ─────────────────────────────── */

/** Whether the normalizer stage has fusion detail to show in the expandable slot */
function hasNormalizerDetail(stage: PipelineStageResult): boolean {
  if (stage.stage !== 'normalizer') return false;
  const o = stage.output as any;
  return (o.fusions?.length ?? 0) > 0;
}

/** Renders the full fusion table for the normalizer's #detail slot */
function normalizerDetailRenderer(stage: PipelineStageResult) {
  const o = stage.output as any;
  const fusions: any[] = o.fusions ?? [];
  const rulesApplied: any[] = o.rulesApplied ?? [];

  const children: any[] = [];

  // Stats row
  children.push(h('div', { class: 'normalize-stats' }, [
    h('span', { class: 'normalize-stat' }, [
      h('span', { class: 'normalize-stat-label' }, 'Tokens:'),
      h('span', { class: 'normalize-stat-value' }, `${o.inputTokenCount} → ${o.outputTokenCount}`),
    ]),
    h('span', { class: 'normalize-stat' }, [
      h('span', { class: 'normalize-stat-label' }, 'Fusions:'),
      h('span', { class: 'normalize-stat-value' }, String(fusions.length)),
    ]),
    ...rulesApplied.map((r: any) => h('span', { class: 'normalize-stat' }, [
      h('span', { class: 'normalize-stat-label' }, r.rule + ':'),
      h('span', { class: 'normalize-stat-value' }, String(r.count)),
    ])),
  ]));

  // Fusion table
  if (fusions.length > 0) {
    children.push(h('table', { class: 'normalize-fusion-table' }, [
      h('thead', {}, h('tr', {}, [
        h('th', {}, 'Rule'),
        h('th', {}, 'Source Tokens'),
        h('th', {}, ''),
        h('th', {}, 'Fused Token'),
      ])),
      h('tbody', {}, fusions.map((f: any) =>
        h('tr', {}, [
          h('td', {}, h('span', { class: 'normalize-fusion-rule' }, f.rule)),
          h('td', {}, h('span', { class: 'normalize-fusion-source-tokens' },
            (f.sourceTokens ?? []).map((st: any) =>
              h('span', { class: `normalize-fusion-token ${tokClass(st)}` }, st.value)
            )
          )),
          h('td', {}, h('span', { class: 'normalize-fusion-arrow' }, '→')),
          h('td', {}, [
            h('span', { class: 'normalize-fusion-result-type' }, f.fusedToken.type),
            h('span', { class: 'normalize-fusion-result-token', style: { marginLeft: '6px', color: '#dcdcaa' } }, f.fusedToken.value),
          ]),
        ])
      )),
    ]));
  } else if (o.outputTokenCount > 0) {
    children.push(h('span', { style: { color: '#6b6b75', fontSize: '10px' } }, 'No tokens were fused in this pass'));
  }

  return h('div', {}, children);
}

const stageRenderers: Record<string, (stage: PipelineStageResult) => ReturnType<typeof h>> = {
  pipeline_start(stage) { const o = stage.output as any; return h('span', { style: { color: '#6b6b75', fontSize: '10px' } }, o.inputType ?? '—'); },
  safety_length(stage) {
    const o = stage.output as any;
    const color = o.passed ? '#4ec9b0' : '#f48771';
    const text = o.passed ? `Passed (${o.expressionLength} chars)` : (o.errorMessage ?? 'Failed');
    return h('span', { style: { color, fontSize: '10px' } }, text);
  },
  lexer(stage) {
    const o = stage.output as any;
    const tokens = (o.tokens ?? []) as Token[];
    if (!tokens.length) return h('span', { class: 'empty' }, '—');
    return h('span', {}, tokens.slice(0, 8).map((t: Token) =>
      h('span', { class: `token token-${String(t.type || 'unknown').toLowerCase()}`, style: { fontSize: '9px', cursor: 'default' } }, t.value)
    ));
  },
  normalizer(stage) {
    const o = stage.output as any;
    const fusions: any[] = o.fusions ?? [];
    const rulesApplied: any[] = o.rulesApplied ?? [];

    if (stage.skipped) return h('span', { style: { color: '#6b6b75', fontSize: '10px' } }, 'No rules active');

    // Compact output: token count change + rule summary
    const children: any[] = [];
    children.push(h('span', { class: 'normalize-compact' }, [
      h('span', { class: 'normalize-compact-count' }, `${o.inputTokenCount}→${o.outputTokenCount}`),
      fusions.length > 0
        ? h('span', { class: 'normalize-compact-fusions' }, `${fusions.length} fusion${fusions.length !== 1 ? 's' : ''}`)
        : h('span', { style: { color: '#6b6b75', fontSize: '9px' } }, 'no fusions'),
    ]));

    return h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, children);
  },
  safety_complexity(stage) {
    const o = stage.output as any;
    const color = o.passed ? '#4ec9b0' : '#f48771';
    const text = o.passed ? `Passed (score: ${o.complexityScore})` : (o.errorMessage ?? 'Failed');
    return h('span', { style: { color, fontSize: '10px' } }, text);
  },
  readwrite(stage) {
    const o = stage.output as any;
    const parts: string[] = [];
    if (o.reads?.length) parts.push(`Reads: ${o.reads.join(', ')}`);
    if (o.writes?.length) parts.push(`Writes: ${o.writes.join(', ')}`);
    if (!parts.length) return h('span', { style: { color: '#6b6b75', fontSize: '10px' } }, 'None');
    return h('span', { style: { color: '#dcdcaa', fontSize: '10px' } }, parts.join(' | '));
  },
  cache_check(stage) {
    const o = stage.output as any;
    const color = o.hit ? '#4ec9b0' : '#5ac8fa';
    return h('span', { style: { color, fontSize: '10px', fontWeight: '600' } }, o.hit ? 'Hit' : 'Miss');
  },
  parser(stage) {
    if (stage.skipped) return h('span', { style: { color: '#6b6b75', fontSize: '10px' } }, 'Skipped (cache hit)');
    const o = stage.output as any;
    if (o.uniqueParseletTypes?.length) {
      return h('span', {}, o.uniqueParseletTypes.map((p: string) =>
        h('span', { class: 'token token-keyword', style: { fontSize: '9px', cursor: 'default' } }, p)
      ));
    }
    return h('span', { class: 'empty' }, '—');
  },
  compiler(stage) {
    if (stage.skipped) return h('span', { style: { color: '#6b6b75', fontSize: '10px' } }, 'Skipped (cache hit)');
    const o = stage.output as any;
    return h('span', { style: { color: '#dcdcaa', fontSize: '10px' } }, `${o.opcodeCount} opcodes, ${o.numberConstants} nums, ${o.stringConstants} strs`);
  },
  async_preflight(stage) {
    const o = stage.output as any;
    if (o.path === 'pending') return h('span', { style: { color: '#ffd866', fontSize: '10px' } }, `Pending: ${o.pendingQueryKey ?? '?'}`);
    if (stage.skipped) return h('span', { style: { color: '#6b6b75', fontSize: '10px' } }, 'Skipped (no async)');
    return h('span', { style: { color: '#6b6b75', fontSize: '10px' } }, 'Sync path');
  },
  vm_execute(stage) {
    const o = stage.output as any;
    return h('span', { style: { color: '#29ce99', fontSize: '10px' } }, o.resultType ?? 'Value');
  },
  dag_registration(stage) {
    const o = stage.output as any;
    const parts: string[] = [];
    if (o.readsRegistered?.length) parts.push(`${o.readsRegistered.length} reads`);
    if (o.writesRegistered?.length) parts.push(`${o.writesRegistered.length} writes`);
    if (!parts.length) return h('span', { style: { color: '#6b6b75', fontSize: '10px' } }, 'None');
    return h('span', { style: { color: '#6b6b75', fontSize: '10px' } }, parts.join(', '));
  },
  linecache(stage) {
    const o = stage.output as any;
    return h('span', { style: { color: '#6b6b75', fontSize: '10px' } }, o.stored ? `Line ${o.lineNumber} cached` : 'Not stored');
  },
  result(stage) {
    const o = stage.output as any;
    if (o.error) return h('span', { style: { color: '#f48771' } }, o.error);
    return h('span', { style: { color: '#29ce99' } }, o.formattedValue ?? String(o.rawValue ?? '—'));
  },
  pipeline_end(stage) {
    const o = stage.output as any;
    const color = o.success ? '#4ec9b0' : '#f48771';
    return h('span', { style: { color, fontSize: '10px' } }, `${o.totalTokens} tokens, ${o.totalOpcodes} opcodes`);
  },
};

/* ── Detail stats (shared by pipeline-detail below) ──────────── */
const wasCached = computed(() => !(result.value?.parselets?.length ?? 0) && (result.value?.rawTokens?.length ?? 0) > 0);
const hasAsync = computed(() => {
  if (selectedLine.value !== null) return perLineResult.value?.type === 'Pending';
  return lineResults.value.some(lr => lr.type === 'Pending');
});
const tokenCount = computed(() => String(result.value?.rawTokens?.length ?? 0));
const opcodeCount = computed(() => String(result.value?.opcodes?.length ?? 0));
const cacheStatus = computed(() => wasCached.value ? 'hit' : ((result.value?.parselets?.length ?? 0) > 0 ? 'miss' : '—'));
const asyncStatus = computed(() => hasAsync.value ? 'yes' : 'no');

/* ── Constants table ──────────────────────────────────────────── */
interface ConstantGroup {
  readonly type: ConstantInfo['type'];
  readonly label: string;
  readonly items: readonly ConstantInfo[];
  expanded: boolean;
  filteredItems?: readonly ConstantInfo[];
  matchCount?: number;
}
const allConstants = computed<ConstantInfo[]>(() => result.value?.constants ?? []);
const constantsExpanded = ref(false);
const constantsFilter = ref('');
const filteredTotal = computed(() => {
  const f = constantsFilter.value.trim();
  if (!f) return allConstants.value.length + ' total';
  const matchCount = filteredConstantGroups.value.reduce((sum, g) => sum + (g.matchCount ?? 0), 0);
  return matchCount + ' / ' + allConstants.value.length + ' total';
});
const allVariables = computed<string[]>(() => result.value?.variables ?? []);
const variablesExpanded = ref(false);

function valueSegments(type: ConstantInfo['type'], value: string | number): Array<{ text: string; highlight: boolean }> {
  let display: string;
  switch (type) { case 'string': display = '"' + String(value) + '"'; break; case 'hex': display = '0x' + String(value); break; case 'bigint': display = String(value) + 'n'; break; default: display = String(value); }
  const query = constantsFilter.value.trim().toLowerCase();
  if (!query) return [{ text: display, highlight: false }];
  const lower = display.toLowerCase();
  const segments: Array<{ text: string; highlight: boolean }> = [];
  let last = 0, idx = lower.indexOf(query);
  while (idx !== -1) {
    if (idx > last) segments.push({ text: display.slice(last, idx), highlight: false });
    segments.push({ text: display.slice(idx, idx + query.length), highlight: true });
    last = idx + query.length; idx = lower.indexOf(query, last);
  }
  if (last < display.length) segments.push({ text: display.slice(last), highlight: false });
  return segments.length > 0 ? segments : [{ text: display, highlight: false }];
}
const constantGroups = computed<ConstantGroup[]>(() => {
  const typeOrder: ConstantInfo['type'][] = ['number', 'string', 'bigint', 'hex'];
  const typeLabel: Record<ConstantInfo['type'], string> = { number: 'Numbers', string: 'Strings', bigint: 'BigInts', hex: 'Hex Values' };
  const groups = new Map<ConstantInfo['type'], ConstantInfo[]>();
  for (const c of allConstants.value) { if (!groups.has(c.type)) groups.set(c.type, []); groups.get(c.type)!.push(c); }
  return typeOrder.filter(t => groups.has(t)).map(t => ({ type: t, label: typeLabel[t], items: groups.get(t)!, expanded: false }));
});
const filteredConstantGroups = computed<ConstantGroup[]>(() => {
  const query = constantsFilter.value.trim().toLowerCase();
  if (!query) return constantGroups.value;
  return constantGroups.value.map(g => {
    const matches = g.items.filter(item => String(item.index) === query || String(item.value).toLowerCase().includes(query));
    return { ...g, filteredItems: matches, matchCount: matches.length, expanded: matches.length > 0 || g.expanded };
  }).filter(g => (g.matchCount ?? 0) > 0);
});
</script>
