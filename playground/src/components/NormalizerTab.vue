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
          <span class="normalizer-stat-label">Rules Applied</span>
          <span class="normalizer-stat-value">{{ data.rulesApplied.length }}</span>
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

      <!-- Normalized Tokens Section -->
      <div class="normalizer-section">
        <div
          class="normalizer-section-header"
          @click="tokensExpanded = !tokensExpanded"
          role="button"
          :aria-expanded="tokensExpanded"
        >
          <span class="normalizer-section-title">📦 Normalized Tokens</span>
          <span class="normalizer-tag">{{ data.tokens.length }} tokens</span>
          <span class="normalizer-section-chevron" :class="{ expanded: tokensExpanded }">▸</span>
        </div>
        <div v-if="tokensExpanded" class="normalizer-section-body">
          <div v-if="data.tokens.length === 0" class="normalizer-empty">No tokens</div>
          <div v-else class="normalizer-token-list">
            <div class="normalizer-token-index-header">
              <span class="normalizer-token-idx">#</span>
              <span class="normalizer-token-field">Type</span>
              <span class="normalizer-token-field">Value</span>
              <span class="normalizer-token-field">Offset</span>
            </div>
            <div v-for="(tk, i) in data.tokens" :key="i" class="normalizer-token-row" :class="{ 'normalizer-token-row-alt': i % 2 === 1 }">
              <span class="normalizer-token-idx">{{ i }}</span>
              <span class="normalizer-token-field">
                <span class="fusion-token-chip" :class="tokenClass(tk)">{{ tk.type }}</span>
              </span>
              <span class="normalizer-token-field normalizer-token-value">{{ tk.value }}</span>
              <span class="normalizer-token-field normalizer-token-offset">{{ tk.offset }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
    <!--#endregion-->
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useEngineStore } from '../stores/engine.js';
import type { PipelineStageResult, NormalizerOutput, TokenFusion } from '@/solve-js/src/types/DiagnosticPipelineResult';

const engine = useEngineStore();

/* ── Section expansion state ─────────────────────────────────── */
const rulesExpanded = ref(true);
const fusionsExpanded = ref(true);
const tokensExpanded = ref(false);

/* ── Data access ─────────────────────────────────────────────── */
/**
 * Find the normalizer pipeline stage from the current evaluation result.
 * Returns null when there is no result or no normalizer stage (e.g., on error).
 */
const normalizerStage = computed<PipelineStageResult | null>(() => {
  const stages = engine.currentResult?.pipelineStages;
  if (!stages) return null;
  return stages.find(s => s.stage === 'normalizer') ?? null;
});

/** Typed normalizer output data. Null when the stage isn't available. */
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

/** Fusions grouped by rule name for organized display. */
const fusionGroups = computed<{ rule: string; fusions: TokenFusion[] }[]>(() => {
  const groups = new Map<string, TokenFusion[]>();
  for (const f of data.value.fusions) {
    if (!groups.has(f.rule)) groups.set(f.rule, []);
    groups.get(f.rule)!.push(f);
  }
  return Array.from(groups.entries()).map(([rule, fusions]) => ({ rule, fusions }));
});

/* ── Token CSS class helper ──────────────────────────────────── */

/**
 * Map a token to a CSS class for color-coded chip styling.
 * Mirrors the tokClass helper from PipelineTab.vue for consistency.
 */
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

.empty-state-icon {
  font-size: 28px;
  opacity: 0.5;
}

.empty-state-text {
  font-size: 13px;
  font-weight: 500;
}

.empty-state-hint {
  font-size: 10px;
  opacity: 0.6;
}

/* ── Stats Row ───────────────────────────────────────────────── */

.normalizer-stats-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.normalizer-stat-card {
  flex: 1;
  min-width: 100px;
  background: rgba(107, 107, 117, 0.08);
  border: 1px solid rgba(107, 107, 117, 0.15);
  border-radius: 6px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.normalizer-stat-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted, #6b6b75);
}

.normalizer-stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-normal, #d4d4d8);
  font-variant-numeric: tabular-nums;
}

/* ── Sections ─────────────────────────────────────────────────── */

.normalizer-section {
  background: rgba(107, 107, 117, 0.06);
  border: 1px solid rgba(107, 107, 117, 0.12);
  border-radius: 6px;
  overflow: hidden;
}

.normalizer-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}

.normalizer-section-header:hover {
  background: rgba(107, 107, 117, 0.08);
}

.normalizer-section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-normal, #d4d4d8);
}

.normalizer-tag {
  font-size: 9px;
  color: var(--text-muted, #6b6b75);
  background: rgba(107, 107, 117, 0.12);
  padding: 1px 6px;
  border-radius: 4px;
  margin-left: auto;
}

.normalizer-section-chevron {
  font-size: 10px;
  color: var(--text-muted, #6b6b75);
  transition: transform 0.2s;
}

.normalizer-section-chevron.expanded {
  transform: rotate(90deg);
}

.normalizer-section-body {
  padding: 8px 10px;
  border-top: 1px solid rgba(107, 107, 117, 0.08);
}

.normalizer-empty {
  font-size: 10px;
  color: var(--text-muted, #6b6b75);
  padding: 8px 0;
}

/* ── Rules Applied Grid ──────────────────────────────────────── */

.normalizer-rules-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.normalizer-rule-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(78, 201, 176, 0.1);
  border: 1px solid rgba(78, 201, 176, 0.2);
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 10px;
}

.normalizer-rule-name {
  color: var(--text-normal, #d4d4d8);
  font-family: 'JetBrains Mono', monospace;
}

.normalizer-rule-count {
  color: #4ec9b0;
  font-weight: 600;
}

/* ── Fusion Groups ───────────────────────────────────────────── */

.fusion-group {
  margin-bottom: 10px;
}

.fusion-group:last-child {
  margin-bottom: 0;
}

.fusion-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.fusion-group-rule {
  font-size: 10px;
  font-weight: 600;
  color: #4ec9b0;
  font-family: 'JetBrains Mono', monospace;
}

.fusion-group-count {
  font-size: 9px;
  color: var(--text-muted, #6b6b75);
}

/* ── Fusion Table ────────────────────────────────────────────── */

.fusion-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 10px;
}

.fusion-table th {
  text-align: left;
  padding: 4px 6px;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted, #6b6b75);
  border-bottom: 1px solid rgba(107, 107, 117, 0.12);
}

.fusion-table td {
  padding: 4px 6px;
  vertical-align: middle;
}

.fusion-row:hover {
  background: rgba(107, 107, 117, 0.06);
}

.fusion-col-source {
  width: auto;
}

.fusion-col-arrow {
  width: 30px;
  text-align: center;
}

.fusion-col-fused {
  width: auto;
  white-space: nowrap;
}

/* ── Token Chips ──────────────────────────────────────────────── */

.fusion-source-tokens {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.fusion-token-chip {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 9px;
  font-family: 'JetBrains Mono', monospace;
  border: 1px solid rgba(107, 107, 117, 0.2);
  cursor: default;
}

.fusion-arrow {
  color: var(--text-muted, #6b6b75);
  font-size: 12px;
}

.fusion-fused-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  border: 1px solid;
  cursor: default;
}

.fusion-fused-type {
  font-weight: 600;
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  opacity: 0.7;
}

.fusion-fused-value {
  font-weight: 500;
}

/* ── Token Chips Color Classes ───────────────────────────────── */

.val-number {
  color: #5ac8fa;
  border-color: rgba(90, 200, 250, 0.3);
  background: rgba(90, 200, 250, 0.08);
}

.val-ident {
  color: #dcdcaa;
  border-color: rgba(220, 220, 170, 0.2);
  background: rgba(220, 220, 170, 0.06);
}

.val-operator {
  color: #c586c0;
  border-color: rgba(197, 134, 192, 0.3);
  background: rgba(197, 134, 192, 0.08);
}

.val-keyword {
  color: #9b7bec;
  border-color: rgba(155, 123, 236, 0.3);
  background: rgba(155, 123, 236, 0.08);
}

.val-default {
  color: var(--text-muted, #6b6b75);
  border-color: rgba(107, 107, 117, 0.2);
  background: rgba(107, 107, 117, 0.06);
}

/* ── Normalized Token List ───────────────────────────────────── */

.normalizer-token-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.normalizer-token-index-header {
  display: grid;
  grid-template-columns: 30px 1fr 1.5fr 50px;
  gap: 6px;
  padding: 4px 6px;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted, #6b6b75);
  border-bottom: 1px solid rgba(107, 107, 117, 0.12);
}

.normalizer-token-row {
  display: grid;
  grid-template-columns: 30px 1fr 1.5fr 50px;
  gap: 6px;
  padding: 3px 6px;
  font-size: 10px;
  align-items: center;
}

.normalizer-token-row-alt {
  background: rgba(107, 107, 117, 0.04);
}

.normalizer-token-idx {
  font-size: 9px;
  color: var(--text-muted, #6b6b75);
  font-variant-numeric: tabular-nums;
}

.normalizer-token-field {
  display: flex;
  align-items: center;
}

.normalizer-token-value {
  color: var(--text-normal, #d4d4d8);
  font-family: 'JetBrains Mono', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.normalizer-token-offset {
  font-size: 9px;
  color: var(--text-muted, #6b6b75);
  font-variant-numeric: tabular-nums;
}
</style>
