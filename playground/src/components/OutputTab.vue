<template>
  <div class="tab-panel active" id="panel-tokens">
    <div class="panel-toolbar">
      <div class="panel-toolbar-left">
        <label class="toggle-label">
          <input type="checkbox" v-model="tokens.groupByLine">
          Group by line
        </label>
        <input
          type="text"
          class="token-filter-input"
          placeholder="Filter tokens…"
          spellcheck="false"
          :value="tokens.filterQuery"
          @input="tokens.setFilterQuery(($event.target as HTMLInputElement).value)"
        />
      </div>
      <span class="token-count">{{ countLabel }}</span>
    </div>

    <!-- Three-tier summary bar -->
    <div v-if="engine.currentResult && tierSummary.total > 0" class="tier-summary-bar">
      <span class="tier-summary-label">Evaluation Tiers</span>
      <span
        class="tier-summary-pill tier-pill-1"
        :title="tierBreakdown.t1.length > 0 ? 'Lines: ' + tierBreakdown.t1.join(', ') : ''"
      >T1: {{ tierSummary.t1 }} fresh</span>
      <span
        class="tier-summary-pill tier-pill-2"
        :title="tierBreakdown.t2.length > 0 ? 'Lines: ' + tierBreakdown.t2.join(', ') : ''"
      >T2: {{ tierSummary.t2 }} cached</span>
      <span
        class="tier-summary-pill tier-pill-3"
        :title="tierBreakdown.t3.length > 0 ? 'Lines: ' + tierBreakdown.t3.join(', ') : ''"
      >T3: {{ tierSummary.t3 }} pending</span>
      <span
        v-if="tierSummary.skip > 0"
        class="tier-summary-pill tier-pill-skip"
        :title="tierBreakdown.skip.length > 0 ? 'Lines: ' + tierBreakdown.skip.map(l => `L${l.line} "${l.expr}": ${l.error}`).join('\n') : ''"
      >SKIP: {{ tierSummary.skip }} errors</span>
    </div>

    <div class="panel-scroll">
      <span v-if="!engine.currentResult" class="empty">No tokens</span>
      <span v-else-if="visibleCount === 0 && filterActive" class="empty">No tokens match &ldquo;{{ tokens.filterQuery }}&rdquo;</span>
      <span v-else-if="visibleCount === 0" class="empty">No tokens</span>

      <template v-else-if="tokens.groupByLine">
        <div
          v-for="entry in groupEntries"
          :key="entry.line"
          class="token-line-group"
          :class="{ selected: pipeline.selectedLine === entry.line }"
        >
          <div class="token-line-header">
            <div class="token-line-header-left">
              <span class="token-line-header-label">Line {{ entry.line }}</span>
              <!-- Three-tier badge -->
              <span v-if="entry.result" class="tier-badge" :class="getTierClass(entry.result)" :title="getTierReason(entry.result)">{{ getTierLabel(entry.result) }}</span>
              <span v-if="entry.result" class="token-line-microstats">
                <span
                  class="microstat-badge"
                  :class="entry.result.wasCached ? 'microstat-cache-hit' : 'microstat-cache-miss'"
                >{{ entry.result.wasCached ? 'HIT' : 'MISS' }}</span>
                <span class="microstat-badge" :class="entry.result.error ? 'microstat-status-error' : entry.result.type === 'Pending' ? 'microstat-status-pending' : 'microstat-status-ok'">
                  {{ entry.result.error ? 'ERROR' : entry.result.type === 'Pending' ? 'PENDING' : 'OK' }}
                </span>
              </span>
            </div>
            <div class="token-line-counts">
              <span class="token-count-badge">{{ entry.tokens.length }} token{{ entry.tokens.length !== 1 ? 's' : '' }}</span>
              <span class="opcode-count-badge">{{ entry.result?.opcodeCount ?? engine.currentResult?.opcodes?.length ?? 0 }} opcode{{ (entry.result?.opcodeCount ?? 1) !== 1 ? 's' : '' }}</span>
            </div>
          </div>

          <div class="token-line-content">
            <span class="output-label-inline">Tokens</span>
            <span
              v-for="(t, i) in entry.tokens"
              :key="i"
              class="token"
              :class="'token-' + String(t.type || 'unknown').toLowerCase()"
              :title="'Type: ' + t.type + '\\nValue: ' + t.value + '\\nPos: ' + t.offset"
            >{{ t.value }}</span>
          </div>

          <div v-if="entry.result" class="token-line-result">
            <span class="token-line-result-type" :style="{ color: entry.result.error ? 'var(--error)' : 'var(--stage-parser)' }">
              {{ entry.result.type }}
            </span>
            <span class="token-line-result-arrow">→</span>
            <span class="token-line-result-value" :style="{ color: entry.result.error ? 'var(--error)' : 'var(--accent)' }">
              {{ entry.result.error || entry.result.result }}
            </span>
            <button
              class="token-line-result-copy"
              :data-copy="entry.result.error || entry.result.result"
              title="Copy result"
              @click="copyResult($event)"
            >📋</button>
          </div>
        </div>
      </template>

      <div v-else class="token-list">
        <span
          v-for="(t, i) in flatTokensList"
          :key="i"
          class="token"
          :class="'token-' + t.type.toLowerCase()"
          :title="'Type: ' + t.type + '\\nValue: ' + t.value + '\\nPos: ' + t.offset"
        >{{ t.value }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useEngineStore } from '../stores/engine.js';
import { useTokensStore } from '../stores/tokens.js';
import { usePipelineStore } from '../stores/pipeline.js';
import type { Token, LineResult } from '../engine.js';

const engine = useEngineStore();
const tokens = useTokensStore();
const pipeline = usePipelineStore();

/* ── Reactive display data (updated by watchers) ──────────────── */
interface GroupEntry {
  line: number;
  tokens: Token[];
  result: LineResult | null;
}

const groupEntries = ref<GroupEntry[]>([]);
const flatTokensList = ref<Token[]>([]);
const countLabel = ref('0 tokens');
const visibleCount = ref(0);
const filterActive = ref(false);

function matchToken(t: Token, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return t.value.toLowerCase().includes(q) || t.type.toLowerCase().includes(q);
}

function updateDisplay(): void {
  const result = engine.currentResult;
  if (!result) {
    groupEntries.value = [];
    flatTokensList.value = [];
    countLabel.value = '0 tokens';
    visibleCount.value = 0;
    filterActive.value = false;
    return;
  }

  const rawTokens = result.rawTokens ?? [];
  const query = tokens.filterQuery;
  const hasFilter = query.length > 0;
  filterActive.value = hasFilter;
  const groupByLine = tokens.groupByLine;

  // Build line result lookup
  const resultByLine = new Map<number, LineResult>();
  for (const lr of (result.lineResults ?? [])) {
    resultByLine.set(lr.lineNumber ?? 1, lr);
  }

  // Filter tokens: skip WS/NEWLINE, apply text filter
  const filtered: Token[] = [];
  for (let i = 0; i < rawTokens.length; i++) {
    const t = rawTokens[i];
    if (t.type === 'WS' || t.type === 'NEWLINE') continue;
    if (hasFilter && !matchToken(t, query)) continue;
    filtered.push(t);
  }

  const totalCount = filtered.length;

  if (groupByLine) {
    // Build line groups
    const lineMap = new Map<number, Token[]>();
    const lineOrder: number[] = [];
    for (let i = 0; i < filtered.length; i++) {
      const t = filtered[i];
      const ln = t.line ?? 1;
      if (!lineMap.has(ln)) { lineMap.set(ln, []); lineOrder.push(ln); }
      lineMap.get(ln)!.push(t);
    }
    lineOrder.sort((a, b) => a - b);

    const entries: GroupEntry[] = [];
    for (const ln of lineOrder) {
      entries.push({
        line: ln,
        tokens: lineMap.get(ln)!,
        result: resultByLine.get(ln) ?? null,
      });
    }
    groupEntries.value = entries;
    flatTokensList.value = [];

    let vis = 0;
    for (const e of entries) vis += e.tokens.length;
    visibleCount.value = vis;
  } else {
    groupEntries.value = [];
    flatTokensList.value = filtered;
    visibleCount.value = filtered.length;
  }

  // Build count label
  if (rawTokens.length === 0) {
    countLabel.value = '0 tokens';
  } else if (hasFilter) {
    countLabel.value = `${visibleCount.value} / ${totalCount} tokens`;
  } else {
    countLabel.value = `${totalCount} tokens`;
  }
}

// Watch for store changes
watch(
  () => [engine.currentResult, tokens.filterQuery, tokens.groupByLine],
  () => updateDisplay(),
  { deep: false, immediate: true }
);

/* ── Tier summary ──────────────────────────────────────────── */
interface TierSummary {
  t1: number;
  t2: number;
  t3: number;
  skip: number;
  total: number;
}

const tierSummary = computed<TierSummary>(() => {
  const results = engine.currentResult?.lineResults ?? [];
  const s = { t1: 0, t2: 0, t3: 0, skip: 0, total: results.length };
  for (const r of results) {
    if (r.error) { s.skip++; continue; }
    if (r.wasCached) { s.t2++; continue; }
    if (r.type === 'Pending') { s.t3++; continue; }
    s.t1++;
  }
  return s;
});

/* ── Per-line tier breakdown for tooltips ──────────────────── */
interface TierBreakdownItem { line: number; error?: string; expr?: string; }

const tierBreakdown = computed<{ t1: number[]; t2: number[]; t3: number[]; skip: TierBreakdownItem[] }>(() => {
  const results = engine.currentResult?.lineResults ?? [];
  const b = { t1: [] as number[], t2: [] as number[], t3: [] as number[], skip: [] as TierBreakdownItem[] };
  for (const r of results) {
    const ln = r.lineNumber ?? 1;
    if (r.error) { b.skip.push({ line: ln, error: r.error, expr: r.expression }); continue; }
    if (r.wasCached) { b.t2.push(ln); continue; }
    if (r.type === 'Pending') { b.t3.push(ln); continue; }
    b.t1.push(ln);
  }
  return b;
});

/* ── Three-tier badge helpers ──────────────────────────────── */
function getTierClass(result: LineResult): string {
  if (result.error) return 'tier-skip';
  if (result.wasCached) return 'tier-2';
  if (result.type === 'Pending') return 'tier-3';
  return 'tier-1';
}

function getTierLabel(result: LineResult): string {
  if (result.error) return 'SKIP';
  if (result.wasCached) return 'T2';
  if (result.type === 'Pending') return 'T3';
  return 'T1';
}

function getTierReason(result: LineResult): string {
  if (result.error) return `Error: ${result.error}`;
  if (result.wasCached) return 'Tier 2 (Cache hit) — bytecode reused from earlier evaluation';
  if (result.type === 'Pending') return 'Tier 3 (Async pending) — awaiting external data resolution';
  return 'Tier 1 (Fresh) — full eval: lexer → parser → compiler → VM';
}

/* ── Copy result ──────────────────────────────────────────────── */
function copyResult(e: MouseEvent): void {
  const btn = (e.target as HTMLElement).closest('.token-line-result-copy') as HTMLElement | null;
  if (!btn) return;
  const text = btn.dataset.copy ?? '';
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✓';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1000);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
}
</script>
