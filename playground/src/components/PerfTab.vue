<template>
  <div class="tab-panel active" id="panel-perf">
    <!-- Flamegraph -->
    <div class="perf-flamegraph-section">
      <h4 class="perf-section-title">Pipeline Flamegraph</h4>
      <div class="perf-flamegraph">
        <div class="empty" v-if="flameSegments.length === 0" style="width:100%;display:flex;align-items:center;justify-content:center">No timing data</div>
        <div
          v-for="seg in flameSegments"
          :key="seg.label"
          class="perf-flamegraph-bar"
          :class="{ 'flamegraph-bar-dimmed': isDimmed(seg.label), 'flamegraph-bar-highlighted': isHighlighted(seg.label) }"
          :style="{ width: seg.width + '%', background: seg.color }"
          :data-stage="seg.label"
          @click="onFlameClick(seg.label)"
        >
          <span v-if="seg.showLabel" class="perf-flamegraph-bar-label">{{ seg.label }}</span>
          <div class="perf-flamegraph-tooltip">
            <div class="perf-flamegraph-tooltip-name" :style="{ color: seg.color }">{{ seg.label }}</div>
            <span class="perf-flamegraph-tooltip-time">{{ seg.timeStr }}</span>
            <span class="perf-flamegraph-tooltip-pct">{{ seg.pctStr }}</span>
          </div>
        </div>
      </div>
      <div class="perf-flamegraph-legend">
        <span v-for="item in flameLegend" :key="item.label" class="perf-flamegraph-legend-item" :class="{ 'legend-item-active': pipeline.flamegraphFilter === item.label }">
          <span class="perf-flamegraph-legend-swatch" :style="{ background: item.color }"></span>
          {{ item.label }}
        </span>
        <button v-if="pipeline.flamegraphFilter" class="flamegraph-clear-filter" @click="pipeline.clearFlamegraphFilter()">
          ✖ Clear filter
        </button>
      </div>
    </div>

    <!-- Per-Line Flamegraph (multi-line documents) -->
    <div class="perf-flamegraph-section" v-if="lineFlameBars.length > 0">
      <h4 class="perf-section-title">Per-Line Flamegraph</h4>
      <div class="perf-flamegraph">
        <div
          v-for="bar in lineFlameBars"
          :key="bar.lineNumber"
          class="perf-flamegraph-bar"
          :class="{
            'flamegraph-bar-dimmed': bar.isDimmed,
            'flamegraph-bar-highlighted': bar.isHighlighted,
          }"
          :style="{ width: bar.width + '%', background: bar.color }"
          :data-stage="bar.dominant"
          @click="onFlameClick(bar.dominant)"
        >
          <span v-if="bar.showLabel" class="perf-flamegraph-bar-label">L{{ bar.lineNumber }}</span>
          <div class="perf-flamegraph-tooltip">
            <div class="perf-flamegraph-tooltip-name" :style="{ color: bar.color }">
              Line {{ bar.lineNumber }} &middot; {{ bar.dominant }}
            </div>
            <span class="perf-flamegraph-tooltip-time">{{ bar.timeStr }}</span>
            <span class="perf-flamegraph-tooltip-pct">{{ bar.pctStr }}</span>
            <div class="perf-flamegraph-tooltip-breakdown">
              <div>Lx {{ bar.breakdown.lexer }}</div>
              <div>Pr {{ bar.breakdown.parser }}</div>
              <div>Cp {{ bar.breakdown.compile }}</div>
              <div>VM {{ bar.breakdown.execution }}</div>
              <div>Ov {{ bar.breakdown.overhead }}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="perf-flamegraph-legend">
        <span class="perf-flamegraph-legend-item" style="opacity:0.5;font-size:8px;letter-spacing:0.5px">
          {{ lineFlameBars.length }} lines &middot; colored by dominant stage
        </span>
        <span
          v-for="item in lineFlameLegend"
          :key="item.label"
          class="perf-flamegraph-legend-item"
          :class="{ 'legend-item-active': pipeline.flamegraphFilter === item.label }"
        >
          <span class="perf-flamegraph-legend-swatch" :style="{ background: item.color }"></span>
          {{ item.label }}
        </span>
        <button v-if="pipeline.flamegraphFilter" class="flamegraph-clear-filter" @click="pipeline.clearFlamegraphFilter()">
          ✖ Clear filter
        </button>
      </div>
    </div>

    <!-- Heatmap -->
    <div class="perf-heatmap-section" v-if="dr.statsHistory.length >= 2">
      <h4 class="perf-section-title">Pipeline Heatmap</h4>
      <div class="perf-heatmap-wrapper">
        <div class="perf-heatmap">
          <div class="perf-heatmap-header">
            <div class="perf-heatmap-header-label">#</div>
            <div v-for="stage in heatmapStages" :key="stage.label" class="perf-heatmap-header-label" :style="{ color: stage.color }">
              {{ stage.label }}
            </div>
          </div>
          <div v-for="(row, ri) in heatmapRows" :key="ri" class="perf-heatmap-row">
            <div class="perf-heatmap-row-label">#{{ row.evalNum }}</div>
            <div
              v-for="(cell, ci) in row.cells"
              :key="ci"
              class="perf-heatmap-cell"
              :style="{ background: cell.color, opacity: cell.opacity }"
            >
              <div class="perf-heatmap-cell-tooltip">
                <div class="perf-heatmap-cell-tooltip-name" :style="{ color: cell.color }">{{ cell.stage }}</div>
                <span class="perf-heatmap-cell-tooltip-time">{{ cell.timeStr }}</span>
                <span class="perf-heatmap-cell-tooltip-pct">{{ cell.pctStr }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Value Arena Stats (only when enabled) -->
    <div v-if="arenaStats.enabled" class="perf-grid" style="padding-bottom:0">
      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">Arena Usage</span>
          <span class="stat-card-icon" style="background:#c084fc"></span>
        </div>
        <div class="stat-card-value" style="color:#c084fc">{{ arenaStats.usage }} / {{ arenaStats.capacity }}</div>
        <div class="stat-card-avg" style="color:#c084fc">
          {{ (arenaStats.capacity > 0 ? (arenaStats.usage / arenaStats.capacity * 100).toFixed(1) : '0') }}% utilized
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">Arena Capacity</span>
          <span class="stat-card-icon" style="background:#5ac8fa"></span>
        </div>
        <div class="stat-card-value" style="color:#5ac8fa">{{ arenaStats.capacity }}</div>
        <div class="stat-card-avg" style="color:#5ac8fa">
          {{ arenaStats.enabled ? 'Bump-allocator active' : 'Not enabled' }}
        </div>
      </div>
    </div>

    <!-- Stat cards -->
    <div class="perf-grid">
      <div v-for="card in statCards" :key="card.label" class="stat-card" :class="card.cardClass">
        <div class="stat-card-header">
          <span class="stat-card-label">{{ card.label }}</span>
          <span class="stat-card-icon" :style="{ background: card.icon }"></span>
        </div>
        <div class="stat-card-value" :style="{ color: card.color }">{{ card.displayTime }}</div>
        <div v-if="card.displayAvg" class="stat-card-avg" :style="{ color: card.color }">{{ card.displayAvg }}</div>
        <div v-if="card.sparkline" class="stat-card-spark">
          <svg width="120" height="28" viewBox="0 0 120 28" style="display:block">
            <polyline
              :points="card.sparkline.points"
              fill="none"
              :stroke="card.color"
              stroke-width="1.2"
              stroke-linecap="round"
            />
            <line
              x1="0"
              :y1="card.sparkline.avgY"
              x2="120"
              :y2="card.sparkline.avgY"
              :stroke="card.color"
              stroke-width="0.5"
              stroke-dasharray="2,2"
              opacity="0.4"
            />
          </svg>
        </div>
      </div>
    </div>

    <!--#region Pipeline Telemetry (AllocationTracker) ─────────────────────────-->
    <div class="perf-telemetry-section" v-if="pipelineTelemetry && pipelineTelemetry.stages.length > 0">
      <div
        class="telemetry-section-header"
        @click="telemetryExpanded = !telemetryExpanded"
        role="button"
        :aria-expanded="telemetryExpanded"
      >
        <span class="telemetry-section-title">📊 Pipeline Telemetry</span>
        <span class="telemetry-section-count">{{ pipelineTelemetry.stages.length }} stages</span>
        <span class="telemetry-section-chevron" :class="{ expanded: telemetryExpanded }">▸</span>
      </div>
      <div v-if="telemetryExpanded" class="telemetry-section-body">
        <table class="telemetry-table">
          <thead>
            <tr>
              <th class="telemetry-col-stage">Stage</th>
              <th class="telemetry-col-time">Wall Time</th>
              <th class="telemetry-col-bytes">Alloc Bytes</th>
              <th class="telemetry-col-cache">Cache</th>
              <th class="telemetry-col-sub">Sub-Stage</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in pipelineTelemetry.stages" :key="s.stage" class="telemetry-row">
              <td class="telemetry-col-stage">
                <span class="telemetry-stage-chip" :style="{ color: stageColor(s.stage), borderColor: stageColor(s.stage) + '44' }">
                  {{ s.stage }}
                </span>
              </td>
              <td class="telemetry-col-time">
                <span class="telemetry-time-val">{{ fmt(s.wallTimeNs) }}</span>
              </td>
              <td class="telemetry-col-bytes">
                <span class="telemetry-bytes-val">{{ s.allocBytes > 0 ? s.allocBytes + ' B' : '—' }}</span>
              </td>
              <td class="telemetry-col-cache">
                <span v-if="s.cacheHit" class="cache-hit-badge telemetry-cache-badge">Hit</span>
                <span v-else class="telemetry-cache-miss">—</span>
              </td>
              <td class="telemetry-col-sub">
                <span class="telemetry-sub-val">{{ s.subStage || '—' }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="telemetry-total-row">
          <span class="telemetry-total-label">Total</span>
          <span class="telemetry-total-time">{{ fmt(telemetryTotalTime) }}</span>
          <span class="telemetry-total-bytes">{{ telemetryTotalBytes > 0 ? telemetryTotalBytes + ' B' : '—' }}</span>
          <span class="telemetry-total-fastpath" v-if="pipelineTelemetry.fastPath">⚡ Fast path</span>
        </div>
      </div>
    </div>
    <!--#endregion-->

    <!-- History -->
    <div class="perf-history">
      <h4 class="perf-section-title">History (last 50)</h4>
      <div class="perf-history-chart">
        <div
          v-for="(s, i) in dr.statsHistory.slice(-50)"
          :key="i"
          :style="{ width: '3px', height: Math.max(2, (s.totalTime / maxTotal) * 48) + 'px', background: '#29ce99', borderRadius: '1px', opacity: 0.3 + (s.totalTime / maxTotal) * 0.7 }"
          :title="fmt(s.totalTime)"
        ></div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDiagnosticReportStore } from '../stores/diagnosticReport.js';
import { usePipelineStore } from '../stores/pipeline.js';
import { fmt, computeOverhead, getDominantStage, STAGE_COLORS } from '../utils.js';
import type { ArenaStats } from '../engine.js';

const dr = useDiagnosticReportStore();
const pipeline = usePipelineStore();

/* ── Data (populated by engine store's onmessage handler) ──────── */
const stats = computed(() => dr.stats ?? { lexerTime: 0, parserTime: 0, bytecodeTime: 0, executionTime: 0, totalTime: 0 });
const overhead = computed(() => computeOverhead(stats.value));

/* ── Flamegraph ────────────────────────────────────────────────── */
const flameSegments = computed(() => {
  const s = stats.value;
  const ov = overhead.value;
  const all = [
    { label: 'Lexer', time: s.lexerTime, color: '#5ac8fa' },
    { label: 'Parser', time: s.parserTime, color: '#9b7bec' },
    { label: 'Compile', time: s.bytecodeTime, color: '#4ec9b0' },
    { label: 'VM', time: s.executionTime, color: '#ffd866' },
    { label: 'Overhead', time: ov, color: '#6b6b75' },
  ].filter(x => x.time > 0);

  if (all.length === 0) return [];
  const mergedTotal = all.reduce((a, x) => a + x.time, 0) || 1;

  return all.map(seg => {
    const pct = (seg.time / mergedTotal) * 100;
    const width = pct < 2 ? Math.max(2, pct) : pct;
    return {
      ...seg,
      width,
      pctStr: pct.toFixed(1) + '%',
      timeStr: fmt(seg.time),
      showLabel: pct >= 10,
    };
  });
});

const flameLegend = computed(() => flameSegments.value.map(s => ({ label: s.label, color: s.color })));

function isDimmed(label: string): boolean {
  return pipeline.flamegraphFilter !== null && pipeline.flamegraphFilter !== label && label !== 'Other' && label !== 'Overhead';
}

function isHighlighted(label: string): boolean {
  return pipeline.flamegraphFilter !== null && pipeline.flamegraphFilter === label;
}

function onFlameClick(label: string): void {
  if (pipeline.flamegraphFilter === label) {
    pipeline.clearFlamegraphFilter();
  } else {
    pipeline.setFlamegraphFilter(label);
  }
}

/* ── Per-Line Flamegraph (multi-line documents) ─────────────────── */

const lineFlameBars = computed(() => {
  const lineStats = dr.lineStats;
  if (!lineStats || lineStats.length === 0) return [];

  const mergedTotal = lineStats.reduce((a, ls) => a + ls.stats.totalTime, 0) || 1;
  const activeFilter = pipeline.flamegraphFilter;
  const lineCount = lineStats.length;

  return lineStats.map(ls => {
    const s = ls.stats;
    const lineNumber = ls.lineNumber;
    const pct = (s.totalTime / mergedTotal) * 100;
    const width = pct < 1.5 ? Math.max(1.5, pct) : pct;
    const dominant = getDominantStage(s);
    const color = STAGE_COLORS[dominant] ?? '#6b6b75';
    const showLabel = pct >= 8 && lineCount <= 15;
    const isDimmed = activeFilter !== null && dominant !== activeFilter;
    const isHighlighted = activeFilter !== null && dominant === activeFilter;

    return {
      lineNumber,
      dominant,
      color,
      width,
      pctStr: pct.toFixed(1) + '%',
      timeStr: fmt(s.totalTime),
      showLabel,
      isDimmed,
      isHighlighted,
      breakdown: {
        lexer: fmt(s.lexerTime),
        parser: fmt(s.parserTime),
        compile: fmt(s.bytecodeTime),
        execution: fmt(s.executionTime),
        overhead: fmt(computeOverhead(s)),
      },
    };
  });
});

const lineFlameLegend = computed(() => {
  const seen = new Set<string>();
  const items: { label: string; color: string }[] = [];
  for (const bar of lineFlameBars.value) {
    if (!seen.has(bar.dominant)) {
      seen.add(bar.dominant);
      items.push({ label: bar.dominant, color: bar.color });
    }
  }
  return items;
});


/* ── Heatmap ───────────────────────────────────────────────────── */
const heatmapStages = [
  { label: 'Lexer', getValue: (s: any) => s.lexerTime, color: '#5ac8fa' },
  { label: 'Parser', getValue: (s: any) => s.parserTime, color: '#9b7bec' },
  { label: 'Compile', getValue: (s: any) => s.bytecodeTime, color: '#4ec9b0' },
  { label: 'VM', getValue: (s: any) => s.executionTime, color: '#ffd866' },
  { label: 'Overhead', getValue: (s: any) => computeOverhead(s), color: '#6b6b75' },
];

const heatmapRows = computed(() => {
  const history = dr.statsHistory.slice(-50).reverse();
  if (history.length < 2) return [];
  const filter = pipeline.flamegraphFilter;
  return history.map((s, i) => {
    const t = s.totalTime || 1;
    const evalNum = dr.statsHistory.length - i;
    const cells = heatmapStages.map(stage => {
      const val = stage.getValue(s);
      const pct = (val / t) * 100;
      const pctNorm = Math.min(1, pct / 50);
      const opacity = 0.06 + pctNorm * 0.86;
      const isDimmed = filter !== null && stage.label !== filter;
      return {
        color: stage.color,
        opacity: isDimmed ? Math.min(0.08, opacity) : opacity,
        stage: stage.label,
        timeStr: fmt(val),
        pctStr: pct.toFixed(1) + '%',
      };
    });
    return { evalNum, cells };
  });
});

/* ── Stat cards ────────────────────────────────────────────────── */

function sparklineData(values: number[], color: string): { points: string; avgY: number } | null {
  if (values.length < 2) return null;
  const w = 120, h = 28;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => (i / (values.length - 1)) * w + ',' + (h - (v / max) * h)).join(' ');
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return { points: pts, avgY: h - (avg / max) * h };
}

const statCards = computed(() => {
  const s = stats.value;
  const filter = pipeline.flamegraphFilter;
  const history = dr.statsHistory;
  const ov = overhead.value;

  const timed: Record<string, { label: string; value: number; color: string; icon: string; key?: string }> = {
    Lexer: { label: 'Lexer', value: s.lexerTime, color: '#5ac8fa', icon: '#5ac8fa', key: 'lexerTime' },
    Parser: { label: 'Parser', value: s.parserTime, color: '#9b7bec', icon: '#9b7bec', key: 'parserTime' },
    Compiler: { label: 'Compiler', value: s.bytecodeTime, color: '#4ec9b0', icon: '#4ec9b0', key: 'bytecodeTime' },
    'VM Execute': { label: 'VM Execute', value: s.executionTime, color: '#ffd866', icon: '#ffd866', key: 'executionTime' },
  };

  const cards: any[] = [];
  for (const [_k, card] of Object.entries(timed)) {
    const vals = history.map(h => (h as any)[card.key!] || 0);
    const avg = vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : 0;
    const dimmed = filter !== null && card.label !== filter;
    cards.push({
      label: card.label,
      value: card.value,
      color: card.color,
      icon: card.icon,
      displayTime: fmt(card.value),
      displayAvg: 'avg ' + fmt(avg),
      sparkline: sparklineData(vals, card.color),
      cardClass: dimmed ? 'stat-card stat-card-dimmed' : 'stat-card',
    });
  }

  // Overhead + Total
  const overheadVals = history.map(() => ov);
  const totalVals = history.map(h => h.totalTime || 0);
  cards.push({
    label: 'Overhead', value: ov, color: '#6b6b75', icon: '#6b6b75',
    displayTime: fmt(ov), displayAvg: 'avg ' + fmt(overheadVals.reduce((a: number, b: number) => a + b, 0) / Math.max(1, overheadVals.length)),
    sparkline: sparklineData(overheadVals, '#6b6b75'),
    cardClass: 'stat-card stat-card-overhead',
  });
  cards.push({
    label: 'Total', value: s.totalTime, color: '#29ce99', icon: '#29ce99',
    displayTime: fmt(s.totalTime), displayAvg: 'avg ' + fmt(totalVals.reduce((a: number, b: number) => a + b, 0) / Math.max(1, totalVals.length)),
    sparkline: sparklineData(totalVals, '#29ce99'),
    cardClass: 'stat-card',
  });

  return cards;
});

const maxTotal = computed(() => Math.max(...dr.statsHistory.map(s => s.totalTime), 1));

/* ── Pipeline Telemetry (AllocationTracker) ──────────────────────── */

/** Telemetry section expansion state. */
const telemetryExpanded = ref(false);

/** Arena stats from the ValueArena bump-allocator. */
const arenaStats = computed<ArenaStats>(() => dr.arenaStats);

/** Pipeline telemetry from the engine's AllocationTracker. */
const pipelineTelemetry = computed(() => dr.pipelineTelemetry);

/** Total wall time across all telemetry stages. */
const telemetryTotalTime = computed(() =>
  pipelineTelemetry.value?.stages?.reduce((sum: number, s: any) => sum + s.wallTimeNs, 0) ?? 0,
);

/** Total allocated bytes across all telemetry stages. */
const telemetryTotalBytes = computed(() =>
  pipelineTelemetry.value?.stages?.reduce((sum: number, s: any) => sum + s.allocBytes, 0) ?? 0,
);

/**
 * Map a stage name to a display color for the telemetry table.
 * Matches the flamegraph colors for consistency.
 */
function stageColor(stage: string): string {
  const colors: Record<string, string> = {
    lexer: '#5ac8fa',
    parser: '#9b7bec',
    vm: '#ffd866',
    normalizer: '#4ec9b0',
    resolver: '#6b6b75',
    orchestrator: '#29ce99',
  };
  return colors[stage] ?? '#6b6b75';
}
</script>
