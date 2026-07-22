<!--#region 📦 Module Overview -->
/**
 * ParseletRegistryTab.vue — Shows all registered parselets with binding
 * powers, highlight which were matched in the last evaluation, and show
 * a matched-only summary for quick debugging of the parser configuration.
 *
 * Merges two data sources:
 * - Registered parselets (from engine.getParseletRegistry()): the full
 *   registry of prefix/infix parselets with their binding powers
 * - Matched parselets (from debug report parselet events): which parselets
 *   were actually triggered during the last evaluation
 *
 * @component ParseletRegistryTab
 */
<!--#endregion -->

<template>
  <div class="tab-panel active" id="panel-parselet-registry">
    <div class="panel-scroll">
      <!-- Empty State -->
      <div v-if="!hasResult" class="empty-state">
        <div class="empty-state-icon">🏗️</div>
        <div class="empty-state-text">No parselet data available</div>
        <div class="empty-state-hint">Evaluate an expression to see the parselet registry and matched parselets</div>
      </div>

      <template v-else>
        <!-- Sticky Context Header -->
        <div class="pr-context-header">
          <div class="pr-context-left">
            <span class="pr-context-label">Parselets</span>
            <span class="pr-context-badge">{{ activeLineBadge }}</span>
          </div>
          <span class="pr-context-expr" :title="activeExpression">{{ activeExpression || '(empty expression)' }}</span>
          <input
            type="text"
            class="pr-filter-input"
            placeholder="Filter by token type…"
            spellcheck="false"
            v-model="ui.parseletFilterQuery"
          />
          <span class="pr-context-count">{{ registeredCount }} registered</span>
        </div>

        <!-- Matched Parselets Summary -->
        <div class="pr-section pr-matched-section">
          <div class="pr-section-header">
            <span class="pr-section-title">🎯 Matched Parselets</span>
            <span class="pr-tag">{{ matchedParselets.length }} matched</span>
          </div>
          <div v-if="matchedParselets.length === 0" class="pr-empty">
            No parselets were matched during evaluation
          </div>
          <div v-else>
            <div class="pr-matched-subtitle">{{ matchedFraction }}</div>
            <div class="pr-matched-chips">
              <span
                v-for="mp in matchedParselets"
                :key="mp.tokenType + '-' + mp.tokenValue"
                class="pr-matched-chip"
                :class="{ 'pr-matched-prefix': mp.prefix, 'pr-matched-infix': !mp.prefix }"
                :title="`${mp.parseletType} parselet\nToken: ${mp.tokenType}\nValue: ${mp.tokenValue}\nOffset: ${mp.tokenOffset}`"
              >
                <span class="pr-matched-chip-type">{{ mp.parseletType }}</span>
                <span class="pr-matched-chip-arrow">→</span>
                <span class="pr-matched-chip-token">{{ mp.tokenType }}</span>
                <span class="pr-matched-chip-value" v-if="mp.tokenValue">"{{ mp.tokenValue }}"</span>
              </span>
            </div>
          </div>
        </div>

        <!-- Prefix Parselets Registry -->
        <div class="pr-section">
          <div class="pr-section-header">
            <span class="pr-section-title">📌 Prefix Parselets</span>
            <span class="pr-tag">{{ filteredPrefix.length }} registered</span>
          </div>
          <div v-if="filteredPrefix.length > 0" class="pr-table-wrap">
            <table class="pr-table">
              <thead>
                <tr>
                  <th class="pr-col-token">Token</th>
                  <th class="pr-col-bp">Binding Power</th>
                  <th class="pr-col-cat">Category</th>
                  <th class="pr-col-status">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="p in filteredPrefix"
                  :key="p.tokenType"
                  class="pr-row"
                  :class="{ 'pr-row-matched': matchedTokenTypes.has(p.tokenType) }"
                >
                  <td class="pr-col-token">
                    <span class="pr-token-chip" :class="{ 'pr-token-matched': matchedTokenTypes.has(p.tokenType) }">
                      {{ p.tokenType }}
                    </span>
                  </td>
                  <td class="pr-col-bp">
                    <span class="pr-bp-value">{{ p.bindingPower }}</span>
                  </td>
                  <td class="pr-col-cat">{{ p.category || '—' }}</td>
                  <td class="pr-col-status">
                    <span v-if="matchedTokenTypes.has(p.tokenType)" class="pr-badge-matched">matched</span>
                    <span v-else class="pr-badge-unused">unused</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="pr-empty">No prefix parselets{{ ui.parseletFilterQuery ? ' matching filter' : '' }}</div>
        </div>

        <!-- Infix Parselets Registry -->
        <div class="pr-section">
          <div class="pr-section-header">
            <span class="pr-section-title">🔗 Infix Parselets</span>
            <span class="pr-tag">{{ filteredInfix.length }} registered</span>
          </div>
          <div v-if="filteredInfix.length > 0" class="pr-table-wrap">
            <table class="pr-table">
              <thead>
                <tr>
                  <th class="pr-col-token">Token</th>
                  <th class="pr-col-bp">Left BP</th>
                  <th class="pr-col-bp">Right BP</th>
                  <th class="pr-col-cat">Category</th>
                  <th class="pr-col-status">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="p in filteredInfix"
                  :key="p.tokenType"
                  class="pr-row"
                  :class="{ 'pr-row-matched': matchedTokenTypes.has(p.tokenType) }"
                >
                  <td class="pr-col-token">
                    <span class="pr-token-chip" :class="{ 'pr-token-matched': matchedTokenTypes.has(p.tokenType) }">
                      {{ p.tokenType }}
                    </span>
                  </td>
                  <td class="pr-col-bp">
                    <span class="pr-bp-value">{{ p.leftBindingPower }}</span>
                  </td>
                  <td class="pr-col-bp">
                    <span class="pr-bp-value">{{ p.rightBindingPower }}</span>
                  </td>
                  <td class="pr-col-cat">{{ p.category || '—' }}</td>
                  <td class="pr-col-status">
                    <span v-if="matchedTokenTypes.has(p.tokenType)" class="pr-badge-matched">matched</span>
                    <span v-else class="pr-badge-unused">unused</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="pr-empty">No infix parselets{{ ui.parseletFilterQuery ? ' matching filter' : '' }}</div>
        </div>

        <!-- Binding Power Scale — real parselet plot -->
        <div v-if="bpDots.length > 0" class="pr-bp-scale">
          <div class="pr-bp-scale-title">
            Binding Power Scale
            <span class="pr-bp-scale-subtitle">where registered parselets fall</span>
          </div>
          <div class="pr-bp-track">
            <div
              v-for="(dot, i) in bpDots"
              :key="dot.tokenType"
              class="pr-bp-dot"
              :class="{ 'pr-bp-prefix': dot.kind === 'prefix', 'pr-bp-infix': dot.kind === 'infix', 'pr-bp-matched': dot.matched }"
              :style="{ left: (dot.bp / 200 * 100) + '%' }"
              :title="`${dot.kind} ${dot.tokenType}: BP ${dot.bp}${dot.matched ? ' ✓ matched' : ''}`"
            >
              <span class="pr-bp-dot-label">{{ dot.tokenType }}</span>
            </div>
            <!-- Tier labels -->
            <span
              v-for="tier in bpTiers"
              :key="tier.label"
              class="pr-bp-tier-mark"
              :style="{ left: (tier.range[0] / 200 * 100) + '%', width: ((tier.range[1] - tier.range[0]) / 200 * 100) + '%' }"
            >
              <span class="pr-bp-tier-label">{{ tier.label }}</span>
            </span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useDiagnosticReportStore } from '../stores/diagnosticReport.js';
import { usePipelineStore } from '../stores/pipeline.js';
import { useUiStore } from '../stores/ui.js';

const dr = useDiagnosticReportStore();
const pl = usePipelineStore();
const ui = useUiStore();

/* ── Context ─────────────────────────────────────────────────── */
const hasResult = computed(() => !!dr.result);
const activeLineBadge = computed(() =>
  pl.selectedLine !== null ? 'L' + pl.selectedLine : 'All',
);
const activeExpression = computed(() => {
  const ln = pl.selectedLine;
  if (ln !== null) {
    const lr = dr.lineResults.find(r => r.lineNumber === ln);
    return lr?.expression ?? '';
  }
  const first = dr.lineResults[0];
  return first?.expression ?? dr.expression ?? '';
});

/* ── Registered Parselets (from engine registry) ─────────────── */
const prefixParselets = computed<Array<{ tokenType: string; bindingPower: number; category?: string }>>(
  () => dr.parseletRegistry?.prefix ?? [],
);
const infixParselets = computed<Array<{ tokenType: string; leftBindingPower: number; rightBindingPower: number; category?: string }>>(
  () => dr.parseletRegistry?.infix ?? [],
);

const registeredCount = computed(() => prefixParselets.value.length + infixParselets.value.length);

/* ── Matched Parselets (from actual parse events) ────────────── */
const matchedParselets = computed(() => dr.parselets ?? []);

/** Set of token types that were matched by any parselet. */
const matchedTokenTypes = computed(() => {
  const set = new Set<string>();
  for (const p of matchedParselets.value) {
    set.add(p.tokenType);
  }
  return set;
});

/** Count how many registered parselets have been matched. */
const matchedRegistryCount = computed(() => {
  let count = 0;
  for (const p of prefixParselets.value) {
    if (matchedTokenTypes.value.has(p.tokenType)) count++;
  }
  for (const p of infixParselets.value) {
    if (matchedTokenTypes.value.has(p.tokenType)) count++;
  }
  return count;
});

const matchedFraction = computed(() =>
  registeredCount.value > 0
    ? `${matchedRegistryCount.value} / ${registeredCount.value} registry entries matched`
    : '',
);

/* ── Filtering ──────────────────────────────────────────────── */
function tokenMatches(p: { tokenType: string; category?: string }, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return p.tokenType.toLowerCase().includes(q) || (p.category?.toLowerCase().includes(q) ?? false);
}

const filteredPrefix = computed(() => {
  const q = ui.parseletFilterQuery.trim().toLowerCase();
  return q
    ? prefixParselets.value.filter(p => tokenMatches(p, q))
    : prefixParselets.value;
});

const filteredInfix = computed(() => {
  const q = ui.parseletFilterQuery.trim().toLowerCase();
  return q
    ? infixParselets.value.filter(p => tokenMatches(p, q))
    : infixParselets.value;
});

/* ── Binding Power Scale ────────────────────────────────────── */
interface BpDot {
  tokenType: string;
  bp: number;
  kind: 'prefix' | 'infix';
  matched: boolean;
}

/** Dot plot: each registered parselet as a positioned dot on the 0–200 scale. */
const bpDots = computed<BpDot[]>(() => {
  const dots: BpDot[] = [];
  for (const p of prefixParselets.value) {
    dots.push({ tokenType: p.tokenType, bp: p.bindingPower, kind: 'prefix', matched: matchedTokenTypes.value.has(p.tokenType) });
  }
  for (const p of infixParselets.value) {
    dots.push({ tokenType: p.tokenType, bp: p.leftBindingPower, kind: 'infix', matched: matchedTokenTypes.value.has(p.tokenType) });
  }
  return dots;
});

/** Logical tiers of binding power for visual reference. */
const bpTiers = [
  { label: 'Atom',     range: [0, 10] },
  { label: 'Unary',    range: [11, 40] },
  { label: 'Factor',   range: [41, 60] },
  { label: 'Term',     range: [61, 80] },
  { label: 'Compare',  range: [81, 100] },
  { label: 'Logic',    range: [101, 120] },
  { label: 'Assign',   range: [121, 200] },
];
</script>

<style scoped>
/* ── Layout ──────────────────────────────────────────────────── */
#panel-parselet-registry { display: flex; flex-direction: column; min-height: 0; }
#panel-parselet-registry .panel-scroll { display: flex; flex-direction: column; gap: 10px; padding: 8px; }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 180px; gap: 8px; color: var(--text-muted, #6b6b75); }
.empty-state-icon { font-size: 28px; opacity: 0.5; }
.empty-state-text { font-size: 13px; font-weight: 500; }
.empty-state-hint { font-size: 10px; opacity: 0.6; }

/* ── Sticky Context Header ──────────────────────────────────── */
.pr-context-header { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: var(--background-primary, #1e1e2e); border: 1px solid rgba(155,123,236,0.15); border-radius: 6px; flex-shrink: 0; position: sticky; top: 0; z-index: 5; }
.pr-context-left { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.pr-context-label { font-size: 10px; font-weight: 600; color: var(--text-muted, #6b6b75); text-transform: uppercase; letter-spacing: 0.4px; }
.pr-context-badge { display: inline-flex; align-items: center; padding: 1px 7px; border-radius: 3px; background: rgba(155,123,236,0.15); color: var(--stage-parser, #9b7bec); font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; border: 1px solid rgba(155,123,236,0.25); }
.pr-context-expr { flex: 1; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.pr-filter-input { flex: 1; min-width: 80px; max-width: 180px; padding: 3px 8px; background: var(--bg-tertiary, #2b2b32); border: 1px solid var(--border-color, #3a3a44); border-radius: 4px; color: var(--text-primary); font-family: 'JetBrains Mono', monospace; font-size: 11px; outline: none; transition: border-color 0.15s; }
.pr-filter-input::placeholder { color: var(--text-muted); font-size: 10px; font-family: inherit; }
.pr-filter-input:focus { border-color: var(--stage-parser, #9b7bec); }
.pr-context-count { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: var(--text-muted); flex-shrink: 0; }

/* ── Sections ────────────────────────────────────────────────── */
.pr-section { background: rgba(107,107,117,0.06); border: 1px solid rgba(107,107,117,0.12); border-radius: 6px; overflow: hidden; }
.pr-section-header { display: flex; align-items: center; gap: 8px; padding: 7px 10px; background: rgba(107,107,117,0.04); border-bottom: 1px solid rgba(107,107,117,0.08); }
.pr-section-title { font-size: 11px; font-weight: 600; color: var(--stage-parser, #9b7bec); }
.pr-tag { font-size: 9px; color: var(--text-muted); background: rgba(155,123,236,0.1); padding: 1px 6px; border-radius: 4px; margin-left: auto; }
.pr-empty { padding: 10px 12px; font-size: 10px; color: var(--text-muted); font-style: italic; text-align: center; }

/* ── Matched Chips ──────────────────────────────────────────── */
.pr-matched-section .pr-section-header { background: rgba(155,123,236,0.08); }
.pr-matched-section { border-color: rgba(155,123,236,0.25); background: rgba(155,123,236,0.04); }
.pr-matched-chips { display: flex; flex-wrap: wrap; gap: 5px; padding: 4px 10px 8px; max-height: 160px; overflow-y: auto; }
.pr-matched-subtitle { padding: 4px 10px 0; font-size: 9px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; }
.pr-matched-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; font-size: 9px; font-family: 'JetBrains Mono', monospace; border: 1px solid; cursor: default; transition: transform 0.12s; }
.pr-matched-chip:hover { transform: translateY(-1px); }
.pr-matched-prefix { background: rgba(155,123,236,0.12); border-color: rgba(155,123,236,0.3); color: #9b7bec; }
.pr-matched-infix { background: rgba(78,201,176,0.12); border-color: rgba(78,201,176,0.3); color: #4ec9b0; }
.pr-matched-chip-type { font-weight: 600; text-transform: uppercase; font-size: 8px; letter-spacing: 0.3px; opacity: 0.8; }
.pr-matched-chip-arrow { opacity: 0.4; }
.pr-matched-chip-token { font-weight: 700; }
.pr-matched-chip-value { opacity: 0.7; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── Registry Tables ─────────────────────────────────────────── */
.pr-table { width: 100%; border-collapse: collapse; font-family: 'JetBrains Mono', monospace; font-size: 10px; background: rgba(0,0,0,0.1); }
.pr-table thead { background: var(--bg-tertiary, #2b2b32); }
.pr-table th { padding: 4px 10px; font-size: 8px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; text-align: left; border-bottom: 1px solid rgba(107,107,117,0.08); }
.pr-col-token { width: auto; }
.pr-col-bp { width: 60px; text-align: center !important; }
.pr-col-cat { text-align: left; }
.pr-table-wrap { max-height: 220px; overflow-y: auto; }
.pr-table thead { position: sticky; top: 0; z-index: 1; }
.pr-row { transition: background 0.12s; border-bottom: 1px solid rgba(107,107,117,0.05); }
.pr-row:last-child { border-bottom: none; }
.pr-row:hover { background: rgba(107,107,117,0.06); }
.pr-row-matched { background: rgba(155,123,236,0.04); }
.pr-row-matched:hover { background: rgba(155,123,236,0.08); }
.pr-row td { padding: 4px 10px; vertical-align: middle; }

/* ── Token Chip ──────────────────────────────────────────────── */
.pr-token-chip { display: inline-flex; padding: 1px 7px; border-radius: 3px; background: rgba(155,123,236,0.08); color: var(--text-secondary); border: 1px solid rgba(155,123,236,0.15); font-weight: 600; font-size: 9px; transition: all 0.12s; }
.pr-token-matched { background: rgba(155,123,236,0.18); color: #9b7bec; border-color: rgba(155,123,236,0.35); box-shadow: 0 0 0 1px rgba(155,123,236,0.1); }

/* ── Binding Power Value ────────────────────────────────────── */
.pr-bp-value { font-weight: 700; font-variant-numeric: tabular-nums; color: var(--text-primary); }

/* ── Status Badges ──────────────────────────────────────────── */
.pr-badge-matched { display: inline-flex; padding: 1px 6px; border-radius: 3px; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; background: rgba(78,201,176,0.15); color: #4ec9b0; border: 1px solid rgba(78,201,176,0.3); }
.pr-badge-unused { display: inline-flex; padding: 1px 6px; border-radius: 3px; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; background: rgba(107,107,117,0.1); color: var(--text-muted); border: 1px solid rgba(107,107,117,0.12); }

/* ── Binding Power Scale ───────────────────────────────────── */
.pr-bp-scale { background: rgba(107,107,117,0.06); border: 1px solid rgba(107,107,117,0.12); border-radius: 6px; padding: 8px 10px; }
.pr-bp-scale-title { font-size: 9px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
.pr-bp-scale-subtitle { font-size: 8px; font-weight: 400; color: var(--text-muted); opacity: 0.6; text-transform: none; letter-spacing: 0; margin-left: 4px; }
.pr-bp-track { position: relative; height: 48px; background: var(--bg-primary, #1b1b1f); border: 1px solid rgba(107,107,117,0.1); border-radius: 4px; overflow: visible; margin-bottom: 2px; }
.pr-bp-tier-mark { position: absolute; bottom: 0; height: 100%; border-right: 1px dashed rgba(107,107,117,0.08); pointer-events: none; }
.pr-bp-tier-label { position: absolute; bottom: 2px; left: 4px; font-size: 7px; font-weight: 700; color: rgba(107,107,117,0.3); text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap; }
.pr-bp-dot { position: absolute; top: 50%; transform: translate(-50%, -50%); width: 10px; height: 10px; border-radius: 50%; cursor: pointer; transition: transform 0.12s, box-shadow 0.12s; z-index: 2; }
.pr-bp-dot:hover { transform: translate(-50%, -50%) scale(1.6); z-index: 5; }
.pr-bp-dot:hover .pr-bp-dot-label { opacity: 1; }
.pr-bp-prefix { background: #9b7bec; box-shadow: 0 0 4px rgba(155,123,236,0.4); }
.pr-bp-infix { background: #4ec9b0; box-shadow: 0 0 4px rgba(78,201,176,0.4); }
.pr-bp-matched { width: 13px; height: 13px; border: 2px solid #ffd866; box-shadow: 0 0 6px rgba(255,216,102,0.6); }
.pr-bp-dot-label { position: absolute; top: -14px; left: 50%; transform: translateX(-50%); font-family: 'JetBrains Mono', monospace; font-size: 7px; font-weight: 700; color: var(--text-primary); white-space: nowrap; opacity: 0; transition: opacity 0.12s; pointer-events: none; }
</style>
