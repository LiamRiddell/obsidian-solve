<template>
  <div class="tab-panel active" id="panel-cache">
    <div class="panel-scroll diag-stack" id="cache-display">
      <empty-state v-if="!cache" icon="database" text="No cache data" hint="Evaluate an expression to see cache diagnostics." />
      <template v-else>
        <!-- Page Cache -->
        <div class="diag-group" v-if="heatmapEntries.length > 0">
          <div class="diag-group-label">Page Cache</div>
          <div class="cache-section">
            <div class="cache-section-header">
              <span class="msi msi-dense">grid_view</span> Page Heatmap
              <span class="cache-section-count">{{ heatmapEntries.length }} pages · 128 lines/page</span>
              <span v-if="preloadDirection" class="preload-direction-badge" :class="'preload-' + preloadDirection" :title="preloadDirectionTitle">
                <span class="msi msi-dense">{{ preloadDirection === 'forward' ? 'trending_up' : preloadDirection === 'backward' ? 'trending_down' : 'trending_flat' }}</span> {{ preloadDirection }} (recent trend)
              </span>
            </div>
            <div class="page-heatmap-grid">
              <div
                v-for="page in heatmapEntries"
                :key="page.pageNum"
                class="page-heatmap-cell"
                :class="'page-heatmap-' + page.temperature"
                :title="'Page ' + page.pageNum + ' (L' + page.startLine + '-' + page.endLine + ')\nTemp: ' + page.temperature + '\nAccess: #' + page.accessSeq"
              >
                <span class="page-heatmap-page-num">{{ page.pageNum }}</span>
                <span class="page-heatmap-range">{{ page.startLine }}–{{ page.endLine }}</span>
              </div>
            </div>
            <div class="page-heatmap-legend">
              <span class="page-heatmap-legend-item page-heatmap-hot">● Hot</span>
              <span class="page-heatmap-legend-item page-heatmap-warm">● Warm</span>
              <span class="page-heatmap-legend-item page-heatmap-cold">● Cold</span>
              <span style="font-size:9px;color:var(--text-muted);margin-left:8px">
                Hot = viewport ±3 pages · Warm = viewport ±6 pages · Cold = beyond
              </span>
            </div>
          </div>
        </div>

        <!-- Bytecode & Line Cache -->
        <div class="diag-group">
          <div class="diag-group-label">Bytecode &amp; Line Cache</div>

          <div class="cache-section">
            <div class="cache-section-header">
              <span class="msi msi-dense">data_object</span> Bytecode Cache
              <span class="cache-section-count">{{ cache.bytecode.length }} entries</span>
            </div>
            <div v-if="cache.bytecode.length === 0" class="cache-entry">
              <span class="empty" style="padding:8px;display:block;width:100%;text-align:center">No bytecode cache entries</span>
            </div>
            <template v-else>
              <div class="diag-legend" style="margin: 8px 10px;">op = opcodes, num = numeric constants, str = string constants; async = contains an async-resolved data source.</div>
              <div v-for="entry in cache.bytecode" :key="entry.expression" class="cache-entry">
                <span class="cache-entry-expr">{{ entry.expression }}</span>
                <span class="cache-entry-meta">{{ entry.opcodesLength }} op · {{ entry.numbersLength }} num · {{ entry.stringsLength }} str{{ entry.hasAsync ? ' · async' : '' }}</span>
              </div>
            </template>
          </div>

          <!-- Cache Trends (merged hit/miss + size trend, toggled) -->
          <div class="cache-section" v-if="cacheHistoryEntries.length > 1">
            <div class="cache-section-header">
              <span class="msi msi-dense">bar_chart</span> Cache Trends
              <span class="cache-section-count">Last {{ cacheHistoryEntries.length }} runs</span>
              <div class="cache-trend-toggle">
                <button :class="{ active: trendView === 'hitmiss' }" @click="trendView = 'hitmiss'">Hit/Miss</button>
                <button :class="{ active: trendView === 'size' }" @click="trendView = 'size'">Size</button>
              </div>
            </div>
            <template v-if="trendView === 'hitmiss'">
              <div class="cache-chart">
                <div
                  v-for="entry in cacheHistoryEntries"
                  :key="entry.runId"
                  class="cache-chart-row"
                  :title="'Run #' + entry.runId + ': ' + entry.cacheHits + ' hits / ' + entry.cacheMisses + ' misses = ' + hitRatePct(entry) + '% hit rate'"
                >
                  <span class="cache-chart-label">#{{ entry.runId }}</span>
                  <div class="cache-chart-bar">
                    <div class="cache-chart-hit" :style="{ width: hitBarPct(entry) + '%' }">{{ entry.cacheHits || '' }}</div>
                    <div class="cache-chart-miss" :style="{ width: missBarPct(entry) + '%' }">{{ entry.cacheMisses || '' }}</div>
                  </div>
                  <span class="cache-chart-pct">{{ hitRatePct(entry) }}%</span>
                </div>
              </div>
              <div class="cache-chart-legend">
                <span class="cache-chart-legend-item hit">■ Hit</span>
                <span class="cache-chart-legend-item miss">■ Miss</span>
                <span style="margin-left:auto;color:var(--text-muted);font-size:9px">Overall: {{ overallHitRate }}%</span>
              </div>
            </template>
            <template v-else>
              <div class="cache-chart">
                <div
                  v-for="entry in cacheHistoryEntries"
                  :key="entry.runId"
                  class="cache-chart-row"
                  :title="'Run #' + entry.runId + ': ' + entry.bytecodeCacheSize + ' bytecode entries'"
                >
                  <span class="cache-chart-label">#{{ entry.runId }}</span>
                  <div class="cache-chart-bar" style="position:relative">
                    <div class="cache-chart-size-bar" :style="{ width: bytecodeBarPct(entry) + '%' }"></div>
                  </div>
                  <span class="cache-chart-pct">{{ entry.bytecodeCacheSize }}</span>
                </div>
              </div>
              <div class="cache-chart-legend">
                <span style="color:var(--text-muted);font-size:9px">Max: {{ maxBytecodeSize }} · Now: {{ cache.bytecode.length }}</span>
              </div>
            </template>
          </div>

          <div class="cache-section">
            <div class="cache-section-header">
              <span class="msi msi-dense">table_rows</span> Line Cache
              <span class="cache-section-count">{{ cache.lineCache.length }} entries · {{ resolvedLineCount }} resolved</span>
            </div>
            <div v-if="cache.lineCache.length === 0" class="cache-entry">
              <span class="empty" style="padding:8px;display:block;width:100%;text-align:center">No line cache entries</span>
            </div>
            <div v-for="entry in cache.lineCache" :key="entry.key" class="cache-entry">
              <span class="cache-entry-key">L{{ entry.lineNumber }}</span>
              <span class="cache-entry-expr">{{ entry.resultValue }}</span>
              <span class="cache-entry-meta">{{ entry.resultType }}</span>
              <span v-if="entry.reads.length > 0" class="cache-entry-reads">
                <span v-for="r in entry.reads" :key="r" class="cache-read-chip">{{ r }}</span>
              </span>
              <span v-if="entry.writeVar" class="cache-entry-reads">
                <span class="cache-read-chip">→ {{ entry.writeVar }}</span>
              </span>
            </div>
          </div>
        </div>

        <!-- Async Data -->
        <div class="diag-group" v-if="queryCacheEntries.length > 0 || asyncCacheEntries.length > 0">
          <div class="diag-group-label">Async Data</div>

          <!-- Async Resolver Cache — per-package resolved/in-flight/error
               counts. Fully populated by the engine but previously never
               rendered anywhere in the playground. -->
          <div class="cache-section" v-if="asyncCacheEntries.length > 0">
            <div class="cache-section-header">
              <span class="msi msi-dense">sensors</span> Async Resolver Cache
              <span class="cache-section-count">{{ asyncCacheEntries.length }} package{{ asyncCacheEntries.length !== 1 ? 's' : '' }}</span>
            </div>
            <div v-for="pkg in asyncCacheEntries" :key="pkg.packageId" class="cache-entry" style="flex-direction: column; align-items: flex-start; gap: 4px;">
              <div style="display:flex; align-items:center; gap: 8px; width: 100%;">
                <span class="cache-entry-key">{{ pkg.packageId }}</span>
                <span class="cache-entry-meta" style="color: var(--success)">{{ pkg.resolvedCount }} resolved</span>
                <span class="cache-entry-meta" style="color: var(--stage-vm)">{{ pkg.inFlightCount }} in-flight</span>
                <span class="cache-entry-meta" :style="{ color: pkg.errorCount > 0 ? 'var(--error)' : 'var(--text-muted)' }">{{ pkg.errorCount }} error{{ pkg.errorCount !== 1 ? 's' : '' }}</span>
                <span v-if="pkg.ttlMs" class="cache-entry-meta" style="margin-left:auto">TTL {{ formatDuration(pkg.ttlMs) }}</span>
              </div>
              <div v-if="pkg.entries.length > 0" class="cache-entry-reads">
                <span
                  v-for="e in pkg.entries.slice(0, 12)"
                  :key="e.key"
                  class="cache-read-chip"
                  :class="{ 'async-entry-error': e.status === 'error', 'async-entry-inflight': e.status === 'in_flight' }"
                  :title="e.status + (e.errorMessage ? ': ' + e.errorMessage : '')"
                >{{ e.key }}</span>
                <span v-if="pkg.entries.length > 12" class="cache-entry-meta">+{{ pkg.entries.length - 12 }} more</span>
              </div>
            </div>
          </div>

          <!-- TanStack Query Cache — expandable entries with freshness bars -->
          <div class="cache-section" v-if="queryCacheEntries.length > 0">
            <div class="cache-section-header">
              <span class="msi msi-dense">cloud_sync</span> Query Cache (TanStack)
              <span class="cache-section-count">{{ queryCacheEntries.length }} entries · {{ queryCacheFreshCount }} fresh · {{ queryCacheStaleCount }} stale</span>
            </div>
            <div
              v-for="entry in queryCacheEntries"
              :key="entry.queryKey"
              class="qc-entry"
              :class="{ 'qc-entry-expanded': isExpanded(entry.queryKey) }"
            >
              <div class="qc-entry-header" @click="toggleExpand(entry.queryKey)">
                <span class="msi msi-dense qc-entry-chevron">{{ isExpanded(entry.queryKey) ? 'expand_more' : 'chevron_right' }}</span>
                <span class="qc-entry-key" :title="entry.queryKeyArray.join(' / ')">{{ entry.queryKey }}</span>
                <span class="qc-entry-status cache-entry-status" :class="'query-' + entry.status">{{ entry.status }}</span>
                <span class="qc-entry-type">{{ entry.dataType }}</span>
                <span class="qc-entry-age" :title="new Date(entry.updatedAt).toLocaleTimeString()">{{ formatAge(entry.updatedAt, nowMs) }}</span>
                <div class="qc-freshness-bar qc-freshness-mini" :class="freshnessBarClass(entry, nowMs)" :title="freshnessBarTitle(entry, nowMs)">
                  <div class="qc-freshness-fill" :style="{ width: freshnessPct(entry, nowMs) + '%' }"></div>
                </div>
              </div>
              <div v-if="isExpanded(entry.queryKey)" class="qc-entry-body">
                <div class="qc-detail-grid">
                  <div class="qc-detail-row">
                    <span class="qc-detail-label">Query Key</span>
                    <span class="qc-detail-chips">
                      <span v-for="(seg, i) in entry.queryKeyArray" :key="i" class="qc-key-chip">{{ seg }}</span>
                    </span>
                  </div>
                  <div class="qc-detail-row">
                    <span class="qc-detail-label">Cached Data</span>
                    <span class="qc-detail-value qc-data-preview">{{ entry.dataPreview }}</span>
                  </div>
                  <div class="qc-detail-row">
                    <span class="qc-detail-label">Data Type</span>
                    <span class="qc-detail-value">{{ entry.dataType }}</span>
                  </div>
                  <div class="qc-detail-row">
                    <span class="qc-detail-label">Status</span>
                    <span class="qc-detail-value cache-entry-status" :class="'query-' + entry.status">{{ entry.status }}</span>
                  </div>
                  <div class="qc-detail-row">
                    <span class="qc-detail-label">Freshness</span>
                    <div class="qc-detail-value" style="width:100%">
                      <div class="qc-freshness-bar qc-freshness-full" :class="freshnessBarClass(entry, nowMs)">
                        <div class="qc-freshness-fill" :style="{ width: freshnessPct(entry, nowMs) + '%' }"></div>
                      </div>
                      <div class="qc-freshness-text">{{ freshnessBarTitle(entry, nowMs) }}</div>
                    </div>
                  </div>
                  <div class="qc-detail-row">
                    <span class="qc-detail-label">Age</span>
                    <span class="qc-detail-value">{{ formatAge(entry.updatedAt, nowMs) }}</span>
                  </div>
                  <div class="qc-detail-row">
                    <span class="qc-detail-label">Last Updated</span>
                    <span class="qc-detail-value">{{ new Date(entry.updatedAt).toLocaleString() }}</span>
                  </div>
                  <div class="qc-detail-row">
                    <span class="qc-detail-label">Stale Time</span>
                    <span class="qc-detail-value">{{ formatDuration(entry.staleTime) }}</span>
                  </div>
                  <div class="qc-detail-row">
                    <span class="qc-detail-label">Cache Time</span>
                    <span class="qc-detail-value">{{ formatDuration(entry.cacheTime) }}{{ entry.cacheTime === Infinity ? ' (never evicted)' : '' }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useNow } from '@vueuse/core';
import { useDiagnosticReportStore } from '../stores/diagnosticReport.js';
import type { CacheHistoryEntry } from '../stores/diagnosticReport.js';
import type { PageHeatmapEntry, QueryCacheEntry } from '../engine.js';
import { formatDuration } from '../utils.js';
import EmptyState from './shared/EmptyState.vue';

const dr = useDiagnosticReportStore();
const nowDate = useNow({ interval: 1000 });
const nowMs = computed(() => nowDate.value.getTime());

const cache = computed(() => dr.cacheSnapshot);

const resolvedLineCount = computed(() =>
  (cache.value?.lineCache ?? []).filter(e => e.resultType !== 'Pending').length,
);

const heatmapEntries = computed<PageHeatmapEntry[]>(() => dr.pageHeatmap);
const asyncCacheEntries = computed(() => cache.value?.asyncCache ?? []);

/** Query cache entries from TanStack Query. */
const queryCacheEntries = computed<QueryCacheEntry[]>(() => dr.queryCache);
const queryCacheFreshCount = computed(() => queryCacheEntries.value.filter(e => e.status === 'fresh').length);
const queryCacheStaleCount = computed(() => queryCacheEntries.value.filter(e => e.status === 'stale').length);

// ── Cache Trend Chart (toggled between hit/miss and size views) ────────
const trendView = ref<'hitmiss' | 'size'>('hitmiss');

/** Per-evaluation cache metrics history. */
const cacheHistoryEntries = computed<CacheHistoryEntry[]>(() => dr.cacheHistory);

/** Overall hit rate across all tracked runs (0–100). */
const overallHitRate = computed(() => {
  const entries = cacheHistoryEntries.value;
  if (entries.length === 0) return 0;
  let totalHits = 0;
  let totalLines = 0;
  for (const e of entries) {
    totalHits += e.cacheHits;
    totalLines += e.cacheHits + e.cacheMisses;
  }
  return totalLines > 0 ? Math.round((totalHits / totalLines) * 100) : 0;
});

/** Max bar width reference value for hit/miss bars (largest total lines in any run). */
const maxHitMissTotal = computed(() => {
  let max = 0;
  for (const e of cacheHistoryEntries.value) {
    const total = e.cacheHits + e.cacheMisses;
    if (total > max) max = total;
  }
  return max;
});

/** Hit rate percentage for a single entry. */
function hitRatePct(entry: CacheHistoryEntry): number {
  const total = entry.cacheHits + entry.cacheMisses;
  return total > 0 ? Math.round((entry.cacheHits / total) * 100) : 0;
}

/** Bar width percentage for the hits portion (relative to max across runs). */
function hitBarPct(entry: CacheHistoryEntry): number {
  if (maxHitMissTotal.value === 0) return 0;
  return Math.round((entry.cacheHits / maxHitMissTotal.value) * 100);
}

/** Bar width percentage for the misses portion (relative to max across runs). */
function missBarPct(entry: CacheHistoryEntry): number {
  if (maxHitMissTotal.value === 0) return 0;
  return Math.round((entry.cacheMisses / maxHitMissTotal.value) * 100);
}

/** Max bytecode cache size across all tracked runs (for bar scaling). */
const maxBytecodeSize = computed(() => {
  let max = 0;
  for (const e of cacheHistoryEntries.value) {
    if (e.bytecodeCacheSize > max) max = e.bytecodeCacheSize;
  }
  return max;
});

/** Bar width percentage for bytecode cache size (relative to max across runs). */
function bytecodeBarPct(entry: CacheHistoryEntry): number {
  if (maxBytecodeSize.value === 0) return 0;
  return Math.round((entry.bytecodeCacheSize / maxBytecodeSize.value) * 100);
}

// ── Expand/collapse state ──────────────────────────────────────────────
const expandedKeys = ref<Record<string, boolean>>({});

function isExpanded(key: string): boolean {
  return !!expandedKeys.value[key];
}

function toggleExpand(key: string): void {
  expandedKeys.value[key] = !expandedKeys.value[key];
}

// ── Freshness progress bar ─────────────────────────────────────────────

/** Percentage of staleTime elapsed since updatedAt. 0% = just updated, 100% = fully stale. */
function freshnessPct(entry: QueryCacheEntry, nowMs: number): number {
  if (!entry.staleTime || entry.staleTime <= 0) return 0;
  const elapsed = nowMs - entry.updatedAt;
  return Math.min(100, Math.max(0, (elapsed / entry.staleTime) * 100));
}

/** CSS class for the freshness bar: ttl-fresh (green), ttl-warning (amber), ttl-expiring (red). */
function freshnessBarClass(entry: QueryCacheEntry, nowMs: number): string {
  if (!entry.staleTime || entry.staleTime <= 0) return 'ttl-fresh';
  const pct = freshnessPct(entry, nowMs);
  if (pct < 50) return 'ttl-fresh';
  if (pct < 90) return 'ttl-warning';
  return 'ttl-expiring';
}

/** Tooltip text for the freshness bar. */
function freshnessBarTitle(entry: QueryCacheEntry, nowMs: number): string {
  if (!entry.staleTime || entry.staleTime <= 0) return 'Never stale';
  const elapsed = nowMs - entry.updatedAt;
  const remaining = Math.max(0, entry.staleTime - elapsed);
  if (remaining <= 0) return 'Stale — data may be refetched on next access';
  const sec = Math.floor(remaining / 1000);
  if (sec < 60) return `${sec}s until stale`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m until stale`;
  return `${Math.floor(min / 60)}h until stale`;
}

// ── Formatting helpers ─────────────────────────────────────────────────

/** Format an epoch-ms timestamp as a human-readable age (e.g., "12s", "3m", "1h"). */
function formatAge(createdAt: number, nowMs: number): string {
  const diffMs = nowMs - createdAt;
  if (diffMs < 0) return 'just now';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hrs = Math.floor(min / 60);
  return `${hrs}h`;
}

/* Preload direction: compute by examining access sequence number trend across pages.
 * If pages with higher accessSeq are at higher page indices → forward.
 * If pages with higher accessSeq are at lower page indices → backward.
 * Otherwise → stable. Labeled "(recent trend)" in the template since this
 * is a derived heuristic over a normalized access-order value, not a
 * hard guarantee about future preload behavior. */
const preloadDirection = computed<string | null>(() => {
  const entries = heatmapEntries.value;
  if (entries.length < 2) return null;
  const trend = entries.reduce((acc, entry, i) => {
    if (i === 0) return 0;
    const diff = entry.accessSeq - entries[i - 1].accessSeq;
    return acc + (diff > 0 ? 1 : diff < 0 ? -1 : 0);
  }, 0);
  if (trend > 0) return 'forward';
  if (trend < 0) return 'backward';
  return 'stable';
});

const preloadDirectionTitle = computed<string>(() => {
  const dir = preloadDirection.value;
  if (dir === 'forward') return 'Heuristic: recently-accessed pages trend toward higher page numbers';
  if (dir === 'backward') return 'Heuristic: recently-accessed pages trend toward lower page numbers';
  if (dir === 'stable') return 'Heuristic: no clear directional trend in recent page access';
  return '';
});
</script>
