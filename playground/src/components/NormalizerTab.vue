<template>
  <div class="tab-panel active" id="panel-normalizer">
    <!--#region Empty State ───────────────────────────────────────────────────-->

    <div v-if="!normalizerStage" class="empty-state">
      <div class="empty-state-icon">🔄</div>
      <div class="empty-state-text">No normalizer data available</div>
      <div class="empty-state-hint">Evaluate an expression to see token normalization details</div>
    </div>

    <!--#endregion-->
    <!--#region Normalizer Content ───────────────────────────────────────────- -->

    <template v-else>
      <!-- Stats Cards -->
      <div class="normalizer-stats-row">
        <div class="normalizer-stat-card">
          <span class="normalizer-stat-label">Input Tokens</span>
          <span class="normalizer-stat-value">{{ data.inputTokenCount }}</span>
        </div>
        <div class="normalizer-stat-card">
          <span class="normalizer-stat-label">Output Tokens</span>
          <span class="normalizer-stat-value">{{ data.outputTokenCount }}</span>
        </div>
        <div class="normalizer-stat-card">
          <span class="normalizer-stat-label">Fusions</span>
          <span class="normalizer-stat-value">{{ data.fusions.length }}</span>
        </div>
        <div class="normalizer-stat-card">
          <span class="normalizer-stat-label">Tokens Removed</span>
          <span class="normalizer-stat-value" style="color: #f48771">-{{ tokensRemoved }}</span>
        </div>
      </div>

      <!-- Rules Applied Section -->
      <div class="normalizer-section">
        <div
          class="normalizer-section-header"
          @click="rulesExpanded = !rulesExpanded"
          role="button"
          :aria-expanded="rulesExpanded"
        >
          <span class="normalizer-section-title">📋 Rules Applied</span>
          <span class="normalizer-tag">{{ data.rulesApplied.length }} rules</span>
          <span class="normalizer-section-chevron" :class="{ expanded: rulesExpanded }">▸</span>
        </div>
        <div v-if="rulesExpanded" class="normalizer-section-body">
          <div v-if="data.rulesApplied.length === 0" class="normalizer-empty">No rules were applied</div>
          <div v-else class="normalizer-rules-grid">
            <div v-for="r in data.rulesApplied" :key="r.rule" class="normalizer-rule-chip">
              <span class="normalizer-rule-name">{{ r.rule }}</span>
              <span class="normalizer-rule-count">×{{ r.count }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Fusion Table Section -->
      <div class="normalizer-section">
        <div
          class="normalizer-section-header"
          @click="fusionsExpanded = !fusionsExpanded"
          role="button"
          :aria-expanded="fusionsExpanded"
        >
          <span class="normalizer-section-title">🔗 Token Fusions</span>
          <span class="normalizer-tag">{{ data.fusions.length }} fusions</span>
          <span class="normalizer-section-chevron" :class="{ expanded: fusionsExpanded }">▸</span>
        </div>
        <div v-if="fusionsExpanded" class="normalizer-section-body">
          <div v-if="data.fusions.length === 0" class="normalizer-empty">No tokens were fused</div>

          <!-- Group by rule -->
          <div v-for="(group, gi) in fusionGroups" :key="gi" class="fusion-group">
            <div class="fusion-group-header">
              <span class="fusion-group-rule">{{ group.rule }}</span>
              <span class="fusion-group-count">{{ group.fusions.length }} fusion{{ group.fusions.length !== 1 ? 's' : '' }}</span>
            </div>

            <table class="fusion-table">
              <thead>
                <tr>
                  <th class="fusion-col-source">Source Tokens</th>
                  <th class="fusion-col-arrow"></th>
                  <th class="fusion-col-fused">Fused Token</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(fusion, fi) in group.fusions" :key="fi" class="fusion-row">
                  <!-- Source tokens -->
                  <td class="fusion-col-source">
                    <span class="fusion-source-tokens">
                      <span
                        v-for="(st, si) in fusion.sourceTokens"
                        :key="si"
                        class="fusion-token-chip"
                        :class="tokenClass(st)"
                        :title="`${st.type}: ${st.value}`"
                      >{{ st.value }}</span>
                    </span>
                  </td>

                  <!-- Arrow -->
                  <td class="fusion-col-arrow">
                    <span class="fusion-arrow">→</span>
                  </td>

                  <!-- Fused token -->
                  <td class="fusion-col-fused">
                    <span class="fusion-fused-chip" :class="tokenClass(fusion.fusedToken)" :title="`${fusion.fusedToken.type}: ${fusion.fusedToken.value}`">
                      <span class="fusion-fused-type">{{ fusion.fusedToken.type }}</span>
                      <span class="fusion-fused-value">{{ fusion.fusedToken.value }}</span>
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!--#region Token Diff (Before/After side-by-side) ───────────────────────-->

      <div class="normalizer-section">
        <div
          class="normalizer-section-header"
          @click="diffExpanded = !diffExpanded"
          role="button"
          :aria-expanded="diffExpanded"
        >
          <span class="normalizer-section-title">📊 Token Diff</span>
          <span class="normalizer-tag">{{ rawTokens.length }} → {{ data.tokens.length }}</span>
          <span class="normalizer-section-chevron" :class="{ expanded: diffExpanded }">▸</span>
        </div>

        <div v-if="diffExpanded" class="normalizer-section-body">
          <!-- Column headers -->
          <div class="diff-column-headers">
            <div class="diff-header-left">
              <span class="diff-header-label">Raw (before)</span>
              <span class="diff-header-count">{{ rawTokens.length }} tokens</span>
            </div>
            <div class="diff-header-gutter"></div>
            <div class="diff-header-right">
              <span class="diff-header-label">Normalized (after)</span>
              <span class="diff-header-count">{{ data.tokens.length }} tokens</span>
            </div>
          </div>

          <!-- Diff segments -->
          <div class="diff-rows">
            <div v-for="(seg, si) in diffSegments" :key="si" class="diff-segment" :class="{ 'diff-segment-fusion': seg.isFusion }">

              <!-- LEFT: raw tokens -->
              <div class="diff-cell-left">
                <template v-if="seg.isFusion">
                  <!-- Fused source tokens — shown as a bracketed group -->
                  <div class="diff-fusion-bracket">
                    <div class="diff-fusion-bracket-line"></div>
                    <div class="diff-fusion-source-tokens">
                      <span
                        v-for="(st, ti) in seg.sourceTokens"
                        :key="ti"
                        class="fusion-token-chip diff-fusion-chip"
                        :class="tokenClass(st)"
                        :title="`${st.type}: ${st.value}`"
                      >{{ st.value }}</span>
                    </div>
                    <div class="diff-fusion-rule-label">{{ seg.fusionRule }}</div>
                  </div>
                </template>
                <template v-else>
                  <!-- Unchanged token -->
                  <span
                    v-if="seg.rawToken"
                    class="fusion-token-chip diff-unchanged-chip"
                    :class="tokenClass(seg.rawToken)"
                    :title="`${seg.rawToken.type}: ${seg.rawToken.value}`"
                  >{{ seg.rawToken.value }}</span>
                </template>
              </div>

              <!-- GUTTER: arrow indicator -->
              <div class="diff-cell-gutter">
                <span v-if="seg.isFusion" class="diff-fusion-arrow" :title="`Fused by: ${seg.fusionRule}`">→</span>
                <span v-else-if="seg.rawToken" class="diff-pass-arrow">→</span>
              </div>

              <!-- RIGHT: normalized tokens -->
              <div class="diff-cell-right">
                <template v-if="seg.isFusion">
                  <!-- Fusion result token -->
                  <span
                    v-for="(ft, fi) in seg.fusedTokens"
                    :key="fi"
                    class="diff-fused-chip-wrapper"
                  >
                    <span class="diff-fused-chip" :class="tokenClass(ft)" :title="`${ft.type}: ${ft.value}`">
                      <span class="diff-fused-type">{{ ft.type }}</span>
                      <span class="diff-fused-value">{{ ft.value }}</span>
                    </span>
                  </span>
                  <span class="diff-fusion-badge">fusion</span>
                </template>
                <template v-else>
                  <!-- Unchanged token (same raw passes through) -->
                  <span
                    v-if="seg.normalizedToken"
                    class="diff-unchanged-chip"
                    :class="tokenClass(seg.normalizedToken)"
                    :title="`${seg.normalizedToken.type}: ${seg.normalizedToken.value}`"
                  >{{ seg.normalizedToken.value }}</span>
                </template>
              </div>

            </div>
          </div>

          <!-- Full token stream view (compact) -->
          <div class="diff-stream-view">
            <div class="diff-stream-label">Full stream:</div>
            <div class="diff-stream-tokens">
              <span v-for="(tk, i) in rawTokens" :key="'r'+i"
                class="fusion-token-chip"
                :class="[tokenClass(tk), { 'diff-consumed': fusionConsumed.has(i) }]"
                :title="fusionConsumed.has(i) ? 'Consumed by fusion' : ''"
              >{{ tk.value }}</span>
              <span class="diff-stream-arrow">→</span>
              <span v-for="(tk, i) in data.tokens" :key="'n'+i"
                class="fusion-token-chip"
                :class="[tokenClass(tk), { 'diff-new': fusionResults.has(i) }]"
                :title="fusionResults.has(i) ? 'Fusion result' : ''"
              >{{ tk.value }}</span>
            </div>
          </div>
        </div>
      </div>

      <!--#endregion-->
    </template>
    <!--#endregion-->
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useEngineStore } from '../stores/engine.js';
import type { PipelineStageResult, NormalizerOutput, TokenFusion, LexerOutput } from '@/solve-js/src/types/DiagnosticPipelineResult';
import type { Token } from '@/solve-js/src/lexer/Token';

const engine = useEngineStore();

/* ── Section expansion state ─────────────────────────────────── */
const rulesExpanded = ref(true);
const fusionsExpanded = ref(true);
const diffExpanded = ref(true);

/* ── Data access ─────────────────────────────────────────────── */

const normalizerStage = computed<PipelineStageResult | null>(() => {
  const stages = engine.currentResult?.pipelineStages;
  if (!stages) return null;
  return stages.find(s => s.stage === 'normalizer') ?? null;
});

const data = computed<NormalizerOutput>(() => {
  const stage = normalizerStage.value;
  if (!stage) {
    return {
      type: 'normalizer',
      inputTokenCount: 0,
      outputTokenCount: 0,
      fusions: [],
      rulesApplied: [],
      tokens: [],
    };
  }
  return stage.output as NormalizerOutput;
});

/** Raw tokens from the LexerOutput pipeline stage (before normalization). */
const rawTokens = computed<Token[]>(() => {
  const stages = engine.currentResult?.pipelineStages;
  if (!stages) return [];
  const lexer = stages.find(s => s.stage === 'lexer');
  if (!lexer) return [];
  return (lexer.output as LexerOutput).tokens ?? [];
});

/** Number of tokens removed by fusions. */
const tokensRemoved = computed(() => data.value.inputTokenCount - data.value.outputTokenCount);

/* ── Fusion index detection ──────────────────────────────────── */

/**
 * Set of raw token indices that are consumed (fused) by normalizer rules.
 * Built by matching source tokens from fusions to raw tokens by offset, type, and value.
 * An offset of 0 is treated as a wildcard when multiple tokens share offset 0.
 */
const fusionConsumed = computed<Set<number>>(() => {
  const raw = rawTokens.value;
  const consumed = new Set<number>();

  for (const f of data.value.fusions) {
    const sourceCount = f.sourceTokens.length;
    // Try to find a consecutive run in raw tokens matching these source tokens
    for (let start = 0; start <= raw.length - sourceCount; start++) {
      // Skip already-consumed positions
      if (consumed.has(start)) continue;
      let match = true;
      for (let j = 0; j < sourceCount; j++) {
        const st = f.sourceTokens[j];
        const rt = raw[start + j];
        if (
          consumed.has(start + j) ||
          rt.type !== st.type ||
          rt.value !== st.value
        ) {
          match = false;
          break;
        }
      }
      if (match) {
        for (let j = 0; j < sourceCount; j++) {
          consumed.add(start + j);
        }
        break; // Move to next fusion
      }
    }
  }
  return consumed;
});

/**
 * Set of normalized token indices that are the result of fusions.
 * A fusion result is any normalized token that was produced by a fusion rule.
 * We detect this by matching the fusedToken from each fusion to the normalized tokens.
 */
const fusionResults = computed<Set<number>>(() => {
  const norm = data.value.tokens;
  const results = new Set<number>();

  for (const f of data.value.fusions) {
    const ft = f.fusedToken;
    for (let i = 0; i < norm.length; i++) {
      if (!results.has(i) && norm[i].type === ft.type && norm[i].value === ft.value) {
        results.add(i);
        break;
      }
    }
  }
  return results;
});

/* ── Diff segments (aligned rows) ────────────────────────────── */

interface DiffSegment {
  /** Whether this segment represents a fusion event. */
  isFusion: boolean;
  /** Raw token consumed in this segment (unchanged pass-through). */
  rawToken: Token | null;
  /** Source tokens consumed by the fusion (fusion segment only). */
  sourceTokens: Token[];
  /** Normalized token (unchanged pass-through). */
  normalizedToken: Token | null;
  /** Fused tokens produced (fusion segment only). */
  fusedTokens: Token[];
  /** Rule name for the fusion (fusion segment only). */
  fusionRule: string;
}

/**
 * Build aligned diff segments:
 * - Unchanged tokens appear as a single row (raw → norm)
 * - Fused source tokens are grouped into one segment with their result
 */
const diffSegments = computed<DiffSegment[]>(() => {
  const raw = rawTokens.value;
  const norm = data.value.tokens;
  const consumed = fusionConsumed.value;
  const results = fusionResults.value;
  const fusions = data.value.fusions;
  const segments: DiffSegment[] = [];

  let rawIdx = 0;
  let normIdx = 0;

  while (rawIdx < raw.length || normIdx < norm.length) {
    // ── Check if current raw position starts a fusion (use consumed set) ──
    const isStartOfFusion = consumed.has(rawIdx) && !consumed.has(rawIdx - 1);

    if (isStartOfFusion && rawIdx < raw.length) {
      // Find the fusion object matching this position
      const fusion = fusions.find(f => {
        for (let j = 0; j < f.sourceTokens.length; j++) {
          if (rawIdx + j >= raw.length) return false;
          if (raw[rawIdx + j].type !== f.sourceTokens[j].type ||
              raw[rawIdx + j].value !== f.sourceTokens[j].value) return false;
        }
        return true;
      });

      if (fusion && fusion.sourceTokens.length > 0) {
        const sourceCount = fusion.sourceTokens.length;
        // Find the corresponding fused token in the normalized list
        const fusedTokens: Token[] = [];
        if (normIdx < norm.length && results.has(normIdx)) {
          fusedTokens.push(norm[normIdx]);
          normIdx++;
        }

        segments.push({
          isFusion: true,
          rawToken: null,
          sourceTokens: fusion.sourceTokens,
          normalizedToken: null,
          fusedTokens: fusedTokens.length > 0 ? fusedTokens : [fusion.fusedToken],
          fusionRule: fusion.rule,
        });

        rawIdx += sourceCount;
        continue;
      }
    }

    // ── Consumed raw token (not the start) — skip ──
    if (rawIdx < raw.length && consumed.has(rawIdx)) {
      rawIdx++;
      continue;
    }

    // ── Result norm token — advance without raw ──
    if (normIdx < norm.length && results.has(normIdx)) {
      segments.push({
        isFusion: true,
        rawToken: null,
        sourceTokens: [],
        normalizedToken: null,
        fusedTokens: [norm[normIdx]],
        fusionRule: 'fusion result',
      });
      normIdx++;
      continue;
    }

    // ── Both sides have unchanged tokens ──
    if (rawIdx < raw.length && normIdx < norm.length) {
      segments.push({
        isFusion: false,
        rawToken: raw[rawIdx],
        sourceTokens: [],
        normalizedToken: norm[normIdx],
        fusedTokens: [],
        fusionRule: '',
      });
      rawIdx++;
      normIdx++;
      continue;
    }

    // ── Only raw token remains ──
    if (rawIdx < raw.length) {
      segments.push({
        isFusion: false,
        rawToken: raw[rawIdx],
        sourceTokens: [],
        normalizedToken: null,
        fusedTokens: [],
        fusionRule: '',
      });
      rawIdx++;
      continue;
    }

    // ── Only norm token remains ──
    if (normIdx < norm.length) {
      segments.push({
        isFusion: false,
        rawToken: null,
        sourceTokens: [],
        normalizedToken: norm[normIdx],
        fusedTokens: [],
        fusionRule: '',
      });
      normIdx++;
      continue;
    }

    break; // Safety: should never reach here
  }

  return segments;
});

/* ── Fusion grouping ─────────────────────────────────────────── */

const fusionGroups = computed<{ rule: string; fusions: TokenFusion[] }[]>(() => {
  const groups = new Map<string, TokenFusion[]>();
  for (const f of data.value.fusions) {
    if (!groups.has(f.rule)) groups.set(f.rule, []);
    groups.get(f.rule)!.push(f);
  }
  return Array.from(groups.entries()).map(([rule, fusions]) => ({ rule, fusions }));
});

/* ── Token CSS class helper ──────────────────────────────────── */

function tokenClass(t: { type?: string }): string {
  const type = String(t.type || '').toLowerCase();
  if (['number', 'hex', 'bigint'].includes(type)) return 'val-number';
  if (type === 'ident') return 'val-ident';
  if (['star', 'plus', 'minus', 'slash', 'caret', 'equals'].includes(type)) return 'val-operator';
  if (type === 'keyword' || type.includes('_by')) return 'val-keyword';
  return 'val-default';
}
</script>

<style scoped>
/* ── Layout ──────────────────────────────────────────────────── */

#panel-normalizer {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px;
}

/* ── Empty State ──────────────────────────────────────────────── */

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 180px;
  gap: 8px;
  color: var(--text-muted, #6b6b75);
}

.empty-state-icon { font-size: 28px; opacity: 0.5; }
.empty-state-text { font-size: 13px; font-weight: 500; }
.empty-state-hint { font-size: 10px; opacity: 0.6; }

/* ── Stats Row ───────────────────────────────────────────────── */

.normalizer-stats-row {
  display: flex; gap: 8px; flex-wrap: wrap;
}

.normalizer-stat-card {
  flex: 1; min-width: 100px;
  background: rgba(107, 107, 117, 0.08);
  border: 1px solid rgba(107, 107, 117, 0.15);
  border-radius: 6px; padding: 10px 12px;
  display: flex; flex-direction: column; gap: 4px;
}

.normalizer-stat-label {
  font-size: 9px; text-transform: uppercase;
  letter-spacing: 0.5px; color: var(--text-muted, #6b6b75);
}

.normalizer-stat-value {
  font-size: 20px; font-weight: 700;
  color: var(--text-normal, #d4d4d8);
  font-variant-numeric: tabular-nums;
}

/* ── Sections ─────────────────────────────────────────────────── */

.normalizer-section {
  background: rgba(107, 107, 117, 0.06);
  border: 1px solid rgba(107, 107, 117, 0.12);
  border-radius: 6px; overflow: hidden;
}

.normalizer-section-header {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; cursor: pointer; user-select: none;
  transition: background 0.15s;
}

.normalizer-section-header:hover { background: rgba(107, 107, 117, 0.08); }

.normalizer-section-title {
  font-size: 12px; font-weight: 600;
  color: var(--text-normal, #d4d4d8);
}

.normalizer-tag {
  font-size: 9px; color: var(--text-muted, #6b6b75);
  background: rgba(107, 107, 117, 0.12);
  padding: 1px 6px; border-radius: 4px; margin-left: auto;
}

.normalizer-section-chevron {
  font-size: 10px; color: var(--text-muted, #6b6b75);
  transition: transform 0.2s;
}

.normalizer-section-chevron.expanded { transform: rotate(90deg); }

.normalizer-section-body { padding: 8px 10px; border-top: 1px solid rgba(107, 107, 117, 0.08); }

.normalizer-empty {
  font-size: 10px; color: var(--text-muted, #6b6b75); padding: 8px 0;
}

/* ── Rules Grid ───────────────────────────────────────────────── */

.normalizer-rules-grid {
  display: flex; flex-wrap: wrap; gap: 6px;
}

.normalizer-rule-chip {
  display: inline-flex; align-items: center; gap: 5px;
  background: rgba(78, 201, 176, 0.1);
  border: 1px solid rgba(78, 201, 176, 0.2);
  border-radius: 4px; padding: 3px 8px; font-size: 10px;
}

.normalizer-rule-name {
  color: var(--text-normal, #d4d4d8);
  font-family: 'JetBrains Mono', monospace;
}

.normalizer-rule-count { color: #4ec9b0; font-weight: 600; }

/* ── Fusion Groups ────────────────────────────────────────────── */

.fusion-group { margin-bottom: 10px; }
.fusion-group:last-child { margin-bottom: 0; }

.fusion-group-header {
  display: flex; align-items: center; gap: 6px; margin-bottom: 6px;
}

.fusion-group-rule {
  font-size: 10px; font-weight: 600; color: #4ec9b0;
  font-family: 'JetBrains Mono', monospace;
}

.fusion-group-count { font-size: 9px; color: var(--text-muted, #6b6b75); }

/* ── Fusion Table ─────────────────────────────────────────────── */

.fusion-table { width: 100%; border-collapse: collapse; font-size: 10px; }

.fusion-table th {
  text-align: left; padding: 4px 6px; font-size: 9px;
  text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--text-muted, #6b6b75);
  border-bottom: 1px solid rgba(107, 107, 117, 0.12);
}

.fusion-table td { padding: 4px 6px; vertical-align: middle; }

.fusion-row:hover { background: rgba(107, 107, 117, 0.06); }

.fusion-col-source { width: auto; }
.fusion-col-arrow { width: 30px; text-align: center; }
.fusion-col-fused { width: auto; white-space: nowrap; }

/* ── Token Chips ──────────────────────────────────────────────── */

.fusion-source-tokens { display: flex; flex-wrap: wrap; gap: 3px; }

.fusion-token-chip {
  display: inline-block; padding: 1px 5px; border-radius: 3px;
  font-size: 9px; font-family: 'JetBrains Mono', monospace;
  border: 1px solid rgba(107, 107, 117, 0.2); cursor: default;
}

.fusion-arrow { color: var(--text-muted, #6b6b75); font-size: 12px; }

.fusion-fused-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 2px 7px; border-radius: 4px; font-size: 10px;
  font-family: 'JetBrains Mono', monospace; border: 1px solid; cursor: default;
}

.fusion-fused-type {
  font-weight: 600; font-size: 8px; text-transform: uppercase;
  letter-spacing: 0.4px; opacity: 0.7;
}

.fusion-fused-value { font-weight: 500; }

/* ── Token Chip Color Classes ─────────────────────────────────── */

.val-number  { color: #5ac8fa; border-color: rgba(90,200,250,0.3); background: rgba(90,200,250,0.08); }
.val-ident   { color: #dcdcaa; border-color: rgba(220,220,170,0.2); background: rgba(220,220,170,0.06); }
.val-operator { color: #c586c0; border-color: rgba(197,134,192,0.3); background: rgba(197,134,192,0.08); }
.val-keyword { color: #9b7bec; border-color: rgba(155,123,236,0.3); background: rgba(155,123,236,0.08); }
.val-default { color: var(--text-muted, #6b6b75); border-color: rgba(107,107,117,0.2); background: rgba(107,107,117,0.06); }

/* ── Token Diff ───────────────────────────────────────────────── */

/* Column headers */
.diff-column-headers {
  display: grid;
  grid-template-columns: 1fr 40px 1fr;
  gap: 8px;
  margin-bottom: 8px;
  padding: 0 4px;
}

.diff-header-left, .diff-header-right {
  display: flex; align-items: center; gap: 8px;
}

.diff-header-label {
  font-size: 10px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.5px; color: var(--text-muted, #6b6b75);
}

.diff-header-count {
  font-size: 9px; color: var(--text-muted, #6b6b75);
  background: rgba(107, 107, 117, 0.1);
  padding: 1px 5px; border-radius: 3px;
}

.diff-header-right { justify-content: flex-end; }
.diff-header-gutter { min-width: 40px; }

/* Diff row layout */
.diff-rows {
  display: flex; flex-direction: column; gap: 2px;
}

.diff-segment {
  display: grid;
  grid-template-columns: 1fr 40px 1fr;
  gap: 8px;
  align-items: center;
  padding: 4px 4px;
  border-radius: 4px;
  transition: background 0.15s;
}

.diff-segment:hover { background: rgba(107, 107, 117, 0.06); }

.diff-segment-fusion {
  background: rgba(155, 123, 236, 0.06);
  border: 1px solid rgba(155, 123, 236, 0.12);
  margin: 3px 0;
  border-radius: 6px;
}

.diff-segment-fusion:hover { background: rgba(155, 123, 236, 0.1); }

/* Left cell */
.diff-cell-left {
  display: flex; align-items: center;
}

.diff-fusion-bracket {
  display: flex; align-items: center; gap: 6px; width: 100%;
}

.diff-fusion-bracket-line {
  width: 3px; align-self: stretch;
  background: linear-gradient(to bottom, #9b7bec, #7b5bcc);
  border-radius: 2px; min-height: 28px;
}

.diff-fusion-source-tokens {
  display: flex; flex-wrap: wrap; gap: 3px; flex: 1;
}

.diff-fusion-chip {
  border-color: rgba(155, 123, 236, 0.3) !important;
  background: rgba(155, 123, 236, 0.1) !important;
}

.diff-fusion-rule-label {
  font-size: 8px; color: #9b7bec;
  white-space: nowrap; opacity: 0.7;
  writing-mode: vertical-lr; text-orientation: mixed;
  letter-spacing: 0.3px;
}

/* Gutter cell */
.diff-cell-gutter {
  display: flex; align-items: center; justify-content: center;
}

.diff-fusion-arrow {
  color: #9b7bec; font-size: 14px; font-weight: 700;
}

.diff-pass-arrow { color: var(--text-muted, #6b6b75); font-size: 11px; opacity: 0.4; }

/* Right cell */
.diff-cell-right {
  display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
  justify-content: flex-end;
}

.diff-fused-chip-wrapper { display: inline-flex; }

.diff-fused-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 6px; border-radius: 4px; font-size: 10px;
  font-family: 'JetBrains Mono', monospace; border: 1px solid; cursor: default;
}

.diff-fusion-badge {
  font-size: 8px; text-transform: uppercase; letter-spacing: 0.4px;
  color: #9b7bec; background: rgba(155, 123, 236, 0.12);
  padding: 1px 5px; border-radius: 3px; font-weight: 600;
}

.diff-unchanged-chip {
  display: inline-block; padding: 2px 6px; border-radius: 3px;
  font-size: 10px; font-family: 'JetBrains Mono', monospace;
  border: 1px solid rgba(107, 107, 117, 0.15); cursor: default;
}

/* Full stream view */
.diff-stream-view {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(107, 107, 117, 0.1);
  display: flex; flex-direction: column; gap: 6px;
}

.diff-stream-label {
  font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--text-muted, #6b6b75);
}

.diff-stream-tokens {
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px;
}

.diff-stream-arrow {
  color: var(--text-muted, #6b6b75);
  margin: 0 4px; font-size: 14px; font-weight: 700;
}

.diff-consumed {
  opacity: 0.45;
  text-decoration: line-through;
  border-style: dashed !important;
}

.diff-new {
  border-color: rgba(78, 201, 176, 0.4) !important;
  background: rgba(78, 201, 176, 0.1) !important;
  box-shadow: 0 0 0 1px rgba(78, 201, 176, 0.2);
}
</style>
