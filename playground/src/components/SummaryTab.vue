<!--
  SummaryTab.vue — full-document overview: aggregated performance cards
  (the same "whole page" timing breakdown the Pipeline tab's removed "All
  Lines" option used to approximate by just showing whichever line happened
  to run last) at the top, followed by an Output-tab-style per-line result
  list. Click a line to jump to it in the Pipeline tab.
-->
<template>
  <div class="tab-panel active" id="panel-summary">
    <div class="panel-scroll diag-stack">
      <empty-state
        v-if="!dr.result"
        icon="dashboard"
        text="No summary yet"
        hint="Evaluate an expression to see full-document stats."
      />

      <template v-else>
        <!--#region Aggregated Performance ────────────────────────────────-->
        <div class="perf-grid">
          <div class="stat-card">
            <div class="stat-card-header">
              <span class="stat-card-label">Total Time</span>
              <span class="stat-card-icon" style="background:var(--success)"></span>
            </div>
            <div class="stat-card-value" style="color:var(--success)">{{ fmt(stats.totalTime) }}</div>
          </div>
          <div v-for="card in timingCards" :key="card.label" class="stat-card">
            <div class="stat-card-header">
              <span class="stat-card-label">{{ card.label }}</span>
              <span class="stat-card-icon" :style="{ background: card.color }"></span>
            </div>
            <div class="stat-card-value" :style="{ color: card.color }">{{ card.value }}</div>
          </div>
        </div>
        <div class="perf-grid">
          <div class="stat-card">
            <div class="stat-card-header">
              <span class="stat-card-label">Lines</span>
              <span class="stat-card-icon" style="background:var(--stage-lexer)"></span>
            </div>
            <div class="stat-card-value" style="color:var(--stage-lexer)">{{ dr.lineResults.length }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-header">
              <span class="stat-card-label">Tokens</span>
              <span class="stat-card-icon" style="background:var(--stage-lexer)"></span>
            </div>
            <div class="stat-card-value" style="color:var(--stage-lexer)">{{ dr.tokenCount }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-header">
              <span class="stat-card-label">Opcodes</span>
              <span class="stat-card-icon" style="background:var(--stage-compiler)"></span>
            </div>
            <div class="stat-card-value" style="color:var(--stage-compiler)">{{ dr.opcodeCount }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-header">
              <span class="stat-card-label">Cache Hit Rate</span>
              <span class="stat-card-icon" style="background:var(--stage-cache)"></span>
            </div>
            <div class="stat-card-value" style="color:var(--stage-cache)">{{ cacheHitRate }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-header">
              <span class="stat-card-label">Errors</span>
              <span class="stat-card-icon" :style="{ background: errorCount > 0 ? 'var(--error)' : 'var(--text-muted)' }"></span>
            </div>
            <div class="stat-card-value" :style="{ color: errorCount > 0 ? 'var(--error)' : 'var(--text-muted)' }">{{ errorCount }}</div>
          </div>
        </div>
        <!--#endregion-->

        <!--#region Per-Line Results ──────────────────────────────────────-->
        <div class="summary-line-list">
          <div
            v-for="lr in dr.lineResults"
            :key="lr.lineNumber"
            class="summary-line-row"
            :title="'Jump to Line ' + (lr.lineNumber ?? 1) + ' in the Pipeline tab'"
            @click="jumpTo(lr.lineNumber)"
          >
            <span class="summary-line-num">L{{ lr.lineNumber ?? 1 }}</span>
            <span class="summary-line-expr">{{ lr.expression }}</span>
            <span class="status-chip" :class="'status-chip-' + getTierClass(lr)">{{ getTierStatusLabel(lr) }}</span>
            <span class="summary-line-result" :style="{ color: lr.error ? 'var(--error)' : 'var(--accent)' }">
              {{ lr.error || lr.result || (lr.type === 'Pending' ? 'pending…' : '') }}
            </span>
          </div>
        </div>
        <!--#endregion-->
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useDiagnosticReportStore } from '../stores/diagnosticReport.js';
import { usePipelineStore } from '../stores/pipeline.js';
import { useUiStore } from '../stores/ui.js';
import { fmt, STAGE_COLORS } from '@bridge/utils';
import EmptyState from './shared/EmptyState.vue';
import type { LineResult } from '@bridge/engine';

const dr = useDiagnosticReportStore();
const pipeline = usePipelineStore();
const ui = useUiStore();

const stats = computed(() => dr.stats ?? { lexerTime: 0, parserTime: 0, bytecodeTime: 0, executionTime: 0, totalTime: 0 });

const timingCards = computed(() => [
  { label: 'Lexer', value: fmt(stats.value.lexerTime), color: STAGE_COLORS.Lexer },
  { label: 'Parser', value: fmt(stats.value.parserTime), color: STAGE_COLORS.Parser },
  { label: 'Compiler', value: fmt(stats.value.bytecodeTime), color: STAGE_COLORS.Compile },
  { label: 'VM Execute', value: fmt(stats.value.executionTime), color: STAGE_COLORS.VM },
]);

const cacheHitRate = computed(() => {
  const total = dr.lineResults.length;
  if (total === 0) return '—';
  const hits = dr.lineResults.filter(r => r.wasCached).length;
  return Math.round((hits / total) * 100) + '%';
});

const errorCount = computed(() => dr.lineResults.filter(r => r.error).length);

/* ── Three-tier badge helpers — mirrors OutputTab.vue's tier model. ── */
function getTierClass(result: LineResult): string {
  if (result.error) return 'tier-skip';
  if (result.wasCached) return 'tier-2';
  if (result.type === 'Pending') return 'tier-3';
  return 'tier-1';
}

function getTierStatusLabel(result: LineResult): string {
  if (result.error) return 'Error';
  if (result.wasCached) return 'Cached';
  if (result.type === 'Pending') return 'Pending';
  return 'Fresh';
}

function jumpTo(lineNumber: number | undefined): void {
  if (lineNumber == null) return;
  pipeline.selectLine(lineNumber, true);
  ui.setActiveTab('flow');
}
</script>
