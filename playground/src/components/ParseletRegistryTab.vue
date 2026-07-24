<!--
  ParseletRegistryTab.vue — Shows all registered parselets with binding
  powers, highlights which were matched in the last evaluation, and shows
  a matched-only summary for quick debugging of the parser configuration.

  Merges two data sources:
  - Registered parselets (from engine.getParseletRegistry()): the full
    registry of prefix/infix parselets with their binding powers
  - Matched parselets (from debug report parselet events): which parselets
    were actually triggered during the last evaluation
-->
<template>
  <div class="tab-panel active" id="panel-parselet-registry">
    <div class="panel-scroll diag-stack">
      <empty-state v-if="!hasResult" icon="construction" text="No parselet data available" hint="Evaluate an expression to see the parselet registry and matched parselets" />

      <template v-else>
        <context-header label="Parselets" :line-badge="activeLineBadge" :expression="activeExpression">
          <template #extra>
            <input type="text" class="pr-filter-input" placeholder="Filter by token type…" spellcheck="false" v-model="ui.parseletFilterQuery" />
            <span class="diag-context-badge" style="background: rgba(255,255,255,0.06); color: var(--text-secondary); border-color: var(--border-color);">{{ registeredCount }} registered</span>
          </template>
        </context-header>

        <!-- Matched Parselets Summary -->
        <div class="diag-section">
          <div class="diag-section-header static">
            <span class="diag-section-title"><span class="msi msi-dense">track_changes</span> Matched Parselets</span>
            <span class="diag-section-tag">{{ matchedParselets.length }}</span>
          </div>
          <div class="diag-section-body">
            <div v-if="matchedParselets.length === 0" class="empty">No parselets were matched during evaluation</div>
            <template v-else>
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
            </template>
          </div>
        </div>

        <!-- Parselet Registry — Prefix and Infix merged into one table
             with a Kind column, instead of two near-identical sections
             (they differed only by one extra binding-power column). -->
        <div class="diag-section">
          <div class="diag-section-header static">
            <span class="diag-section-title"><span class="msi msi-dense">list_alt</span> Parselet Registry</span>
            <span class="diag-section-tag">{{ filteredPrefix.length + filteredInfix.length }} / {{ registeredCount }}</span>
          </div>
          <div class="diag-section-body" style="padding: 0;">
            <div v-if="filteredPrefix.length + filteredInfix.length > 0" class="pr-table-wrap">
              <table class="pr-table">
                <thead>
                  <tr>
                    <th class="pr-col-kind">Kind</th>
                    <th class="pr-col-token">Token</th>
                    <th class="pr-col-bp">Left BP</th>
                    <th class="pr-col-bp">Right BP</th>
                    <th class="pr-col-cat">Category</th>
                    <th class="pr-col-status">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="p in filteredPrefix" :key="'pre-' + p.tokenType" class="pr-row" :class="{ 'pr-row-matched': matchedTokenTypes.has(p.tokenType) }">
                    <td class="pr-col-kind"><span class="pr-kind-chip pr-kind-prefix">prefix</span></td>
                    <td class="pr-col-token"><span class="pr-token-chip" :class="{ 'pr-token-matched': matchedTokenTypes.has(p.tokenType) }">{{ p.tokenType }}</span></td>
                    <td class="pr-col-bp"><span class="pr-bp-value">{{ p.bindingPower }}</span></td>
                    <td class="pr-col-bp"><span class="pr-bp-value">—</span></td>
                    <td class="pr-col-cat">{{ p.category || '—' }}</td>
                    <td class="pr-col-status">
                      <span v-if="matchedTokenTypes.has(p.tokenType)" class="pr-badge-matched">matched</span>
                      <span v-else class="pr-badge-unused">unused</span>
                    </td>
                  </tr>
                  <tr v-for="p in filteredInfix" :key="'in-' + p.tokenType" class="pr-row" :class="{ 'pr-row-matched': matchedTokenTypes.has(p.tokenType) }">
                    <td class="pr-col-kind"><span class="pr-kind-chip pr-kind-infix">infix</span></td>
                    <td class="pr-col-token"><span class="pr-token-chip" :class="{ 'pr-token-matched': matchedTokenTypes.has(p.tokenType) }">{{ p.tokenType }}</span></td>
                    <td class="pr-col-bp"><span class="pr-bp-value">{{ p.leftBindingPower }}</span></td>
                    <td class="pr-col-bp"><span class="pr-bp-value">{{ p.rightBindingPower }}</span></td>
                    <td class="pr-col-cat">{{ p.category || '—' }}</td>
                    <td class="pr-col-status">
                      <span v-if="matchedTokenTypes.has(p.tokenType)" class="pr-badge-matched">matched</span>
                      <span v-else class="pr-badge-unused">unused</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="empty" style="padding: 12px;">No parselets{{ ui.parseletFilterQuery ? ' matching filter' : '' }}</div>
          </div>
        </div>

        <!-- Binding Power Tiers — grouped list, no spatial plot -->
        <div v-if="bpTierGroups.length > 0" class="diag-section">
          <div class="diag-section-header static">
            <span class="diag-section-title"><span class="msi msi-dense">architecture</span> Binding Power Tiers</span>
            <span class="diag-section-tag">where parselets fall</span>
          </div>
          <div class="diag-section-body">
            <div class="diag-legend" style="margin-bottom: 10px;">
              Binding power controls parsing precedence: <strong>higher binds tighter and evaluates first</strong> — e.g. <code>*</code> (binding power ~50) binds tighter than <code>+</code> (~40), so <code>2 + 3 * 4</code> parses as <code>2 + (3 * 4)</code>.
            </div>
            <div
              v-for="group in bpTierGroups"
              :key="group.label"
              class="pr-tier-group"
            >
              <div class="pr-tier-group-header">
                <span class="pr-tier-group-name">{{ group.label }}</span>
                <span class="pr-tier-group-range">BP {{ group.range[0] }}–{{ group.range[1] }}</span>
                <span class="pr-tier-group-count">{{ group.items.length }}</span>
              </div>
              <div class="pr-tier-chips">
                <span
                  v-for="item in group.items"
                  :key="item.kind + ':' + item.tokenType"
                  class="pr-tier-chip"
                  :class="{ 'pr-tier-chip-prefix': item.kind === 'prefix', 'pr-tier-chip-infix': item.kind === 'infix', 'pr-tier-chip-matched': item.matched }"
                  :title="`${item.kind} ${item.tokenType}: BP ${item.bp}${item.matched ? ' ✓ matched' : ''}`"
                >
                  <span class="pr-tier-chip-token">{{ item.tokenType }}</span>
                  <span class="pr-tier-chip-bp">{{ item.bp }}</span>
                </span>
              </div>
            </div>
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
import ContextHeader from './shared/ContextHeader.vue';
import EmptyState from './shared/EmptyState.vue';

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
// Standardized on dr.parselets (top-level store field, sourced from the
// engine's timeline-collector parselet_matched events) as the single
// source of truth for "matched" state — the parser-stage-local
// ParserOutput.parselets field is a differently-shaped record of the
// same concept and isn't needed here.
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
interface BpItem {
  tokenType: string;
  bp: number;
  kind: 'prefix' | 'infix';
  matched: boolean;
}

/** Logical tiers of binding power for grouping. */
const bpTiers = [
  { label: 'Atom',     range: [0, 10] },
  { label: 'Unary',    range: [11, 40] },
  { label: 'Factor',   range: [41, 60] },
  { label: 'Term',     range: [61, 80] },
  { label: 'Compare',  range: [81, 100] },
  { label: 'Logic',    range: [101, 120] },
  { label: 'Assign',   range: [121, 200] },
];

/**
 * Every registered parselet, grouped into its binding-power tier.
 *
 * A spatial dot/tick plot positioned parselets by exact BP along a 0–200
 * axis — but many parselets share the same or a very close BP (most
 * arithmetic/comparison operators), so items either overlapped outright or
 * needed increasingly elaborate collision-avoidance layout just to stay
 * legible. Grouping into the same coarse tiers the plot used to draw as
 * background zones, and just listing members as chips, answers the same
 * question ("which tier does this parselet fall into, and what else is in
 * that tier") without any positioning math.
 */
const bpTierGroups = computed(() => {
  const raw: BpItem[] = [];
  for (const p of prefixParselets.value) {
    raw.push({ tokenType: p.tokenType, bp: p.bindingPower, kind: 'prefix', matched: matchedTokenTypes.value.has(p.tokenType) });
  }
  for (const p of infixParselets.value) {
    raw.push({ tokenType: p.tokenType, bp: p.leftBindingPower, kind: 'infix', matched: matchedTokenTypes.value.has(p.tokenType) });
  }

  return bpTiers
    .map((tier) => ({
      label: tier.label,
      range: tier.range,
      items: raw
        .filter((d) => d.bp >= tier.range[0] && d.bp <= tier.range[1])
        .sort((a, b) => a.bp - b.bp || a.tokenType.localeCompare(b.tokenType)),
    }))
    .filter((group) => group.items.length > 0);
});
</script>

<style scoped>
#panel-parselet-registry { display: flex; flex-direction: column; min-height: 0; }

.pr-filter-input { flex: 1; min-width: 80px; max-width: 180px; padding: 3px 8px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); color: var(--text-primary); font-family: var(--font-mono); font-size: 11px; outline: none; transition: border-color 0.15s; }
.pr-filter-input::placeholder { color: var(--text-muted); font-size: 10px; font-family: var(--font-ui); }
.pr-filter-input:focus { border-color: var(--accent); }

/* ── Matched Chips ──────────────────────────────────────────── */
.pr-matched-subtitle { font-size: 9px; color: var(--text-muted); font-family: var(--font-mono); margin-bottom: 6px; }
.pr-matched-chips { display: flex; flex-wrap: wrap; gap: 5px; max-height: 160px; overflow-y: auto; }
.pr-matched-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: var(--radius-sm); font-size: 9px; font-family: var(--font-mono); border: 1px solid; cursor: default; }
.pr-matched-prefix { background: rgba(199,169,255,0.12); border-color: rgba(199,169,255,0.3); color: var(--stage-parser); }
.pr-matched-infix { background: rgba(144,224,239,0.12); border-color: rgba(144,224,239,0.3); color: var(--stage-compiler); }
.pr-matched-chip-type { font-weight: 600; text-transform: uppercase; font-size: 8px; letter-spacing: 0.3px; opacity: 0.8; }
.pr-matched-chip-arrow { opacity: 0.4; }
.pr-matched-chip-token { font-weight: 700; }
.pr-matched-chip-value { opacity: 0.7; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── Registry Table ────────────────────────────────────────────── */
.pr-table { width: 100%; border-collapse: collapse; font-family: var(--font-mono); font-size: 10px; }
.pr-table thead { background: var(--bg-tertiary); position: sticky; top: 0; z-index: 1; }
.pr-table th { padding: 6px 10px; font-size: 8px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; text-align: left; border-bottom: 1px solid var(--border-subtle); }
.pr-col-kind { width: 56px; }
.pr-col-token { width: auto; }
.pr-col-bp { width: 60px; text-align: right !important; }
.pr-col-cat { text-align: left; }
.pr-table-wrap { max-height: 320px; overflow-y: auto; }
.pr-row { transition: background 0.12s; border-bottom: 1px solid var(--border-subtle); }
.pr-row:last-child { border-bottom: none; }
.pr-row:hover { background: var(--bg-tertiary); }
.pr-row-matched { background: rgba(250,255,105,0.04); }
.pr-row-matched:hover { background: rgba(250,255,105,0.08); }
.pr-row td { padding: 5px 10px; vertical-align: middle; }

.pr-kind-chip { display: inline-flex; padding: 1px 6px; border-radius: var(--radius-sm); font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
.pr-kind-prefix { background: rgba(199,169,255,0.12); color: var(--stage-parser); }
.pr-kind-infix { background: rgba(144,224,239,0.12); color: var(--stage-compiler); }

/* ── Token Chip ──────────────────────────────────────────────── */
.pr-token-chip { display: inline-flex; padding: 1px 7px; border-radius: var(--radius-sm); background: rgba(255,255,255,0.04); color: var(--text-secondary); border: 1px solid var(--border-subtle); font-weight: 600; font-size: 9px; transition: all 0.12s; }
.pr-token-matched { background: var(--accent-dim); color: var(--accent); border-color: rgba(250,255,105,0.35); }

/* ── Binding Power Value ────────────────────────────────────── */
.pr-bp-value { font-weight: 700; font-variant-numeric: tabular-nums; color: var(--text-primary); }

/* ── Status Badges ──────────────────────────────────────────── */
.pr-badge-matched { display: inline-flex; padding: 1px 6px; border-radius: var(--radius-sm); font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; background: var(--success-dim); color: var(--success); border: 1px solid rgba(181,228,140,0.3); }
.pr-badge-unused { display: inline-flex; padding: 1px 6px; border-radius: var(--radius-sm); font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; background: rgba(255,255,255,0.04); color: var(--text-muted); border: 1px solid var(--border-subtle); }

/* ── Binding Power Tiers ───────────────────────────────────── */
.pr-tier-group { margin-bottom: 10px; }
.pr-tier-group:last-child { margin-bottom: 0; }
.pr-tier-group-header { display: flex; align-items: baseline; gap: 6px; margin-bottom: 5px; }
.pr-tier-group-name { font-size: 9px; font-weight: 700; color: var(--text-primary); text-transform: uppercase; letter-spacing: 0.4px; }
.pr-tier-group-range { font-size: 8px; color: var(--text-muted); font-family: var(--font-mono); }
.pr-tier-group-count { font-size: 8px; color: var(--text-muted); font-family: var(--font-mono); margin-left: auto; }
.pr-tier-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.pr-tier-chip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: var(--radius-sm); font-size: 9px; font-family: var(--font-mono); border: 1px solid; cursor: default; }
.pr-tier-chip-prefix { background: rgba(199,169,255,0.12); border-color: rgba(199,169,255,0.3); color: var(--stage-parser); }
.pr-tier-chip-infix { background: rgba(144,224,239,0.12); border-color: rgba(144,224,239,0.3); color: var(--stage-compiler); }
.pr-tier-chip-token { font-weight: 700; }
.pr-tier-chip-bp { opacity: 0.6; font-size: 8px; }
.pr-tier-chip-matched { background: var(--accent-dim); border-color: rgba(250,255,105,0.4); color: var(--accent); box-shadow: 0 0 4px rgba(250,255,105,0.25); }
</style>
