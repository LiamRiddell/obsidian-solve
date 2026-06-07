<template>
  <div class="tab-panel active" id="panel-cache">
    <div class="panel-scroll" id="cache-display">
      <span v-if="!cache" class="empty">No cache data</span>
      <template v-else>
        <!-- Page Heatmap -->
        <div v-if="heatmapEntries.length > 0" class="cache-section">
          <div class="cache-section-header">
            <span>🗂 Page Heatmap</span>
            <span class="cache-section-count">{{ heatmapEntries.length }} pages · 128 lines/page</span>
            <span v-if="preloadDirection" class="preload-direction-badge" :class="'preload-' + preloadDirection" :title="preloadDirectionTitle">
              {{ preloadDirection === 'forward' ? '▶' : preloadDirection === 'backward' ? '◀' : '↕' }} {{ preloadDirection }}
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
        <!-- Bytecode Cache -->
        <div class="cache-section">
          <div class="cache-section-header">
            <span>⬡ Bytecode Cache</span>
            <span class="cache-section-count">{{ cache.bytecode.length }} entries</span>
          </div>
          <div v-if="cache.bytecode.length === 0" class="cache-entry">
            <span class="empty" style="padding:8px;display:block;width:100%;text-align:center">No bytecode cache entries</span>
          </div>
          <div v-for="entry in cache.bytecode" :key="entry.expression" class="cache-entry">
            <span class="cache-entry-expr">{{ entry.expression }}</span>
            <span class="cache-entry-meta">{{ entry.opcodesLength }} op · {{ entry.numbersLength }} num · {{ entry.stringsLength }} str{{ entry.hasAsync ? ' async' : '' }}</span>
          </div>
        </div>

        <!-- Line Cache -->
        <div class="cache-section">
          <div class="cache-section-header">
            <span>⊞ Line Cache</span>
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

            <!-- TanStack Query Cache -->
        <div v-if="queryCacheEntries.length > 0" class="cache-section">
          <div class="cache-section-header">
            <span>🗄️ Query Cache (TanStack)</span>
            <span class="cache-section-count">{{ queryCacheEntries.length }} entries · {{ queryCacheFreshCount }} fresh · {{ queryCacheStaleCount }} stale</span>
          </div>
          <div v-for="entry in queryCacheEntries" :key="entry.queryKey" class="cache-entry">
            <span class="cache-entry-expr" style="min-width:100px">{{ entry.queryKey }}</span>
            <span class="cache-entry-status" :class="'query-' + entry.status">{{ entry.status }}</span>
            <span class="cache-entry-meta">{{ entry.dataType }}</span>
            <span v-if="entry.updatedAt" class="cache-entry-meta" :title="'Updated ' + new Date(entry.updatedAt).toLocaleTimeString()">
              {{ formatAge(entry.updatedAt, nowMs) }}
            </span>
            <span v-if="entry.staleTime" class="cache-entry-meta" :class="staleUrgencyClass(entry.updatedAt, entry.staleTime, nowMs)">
              {{ formatStaleRemaining(entry.updatedAt, entry.staleTime, nowMs) }}
            </span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useNow } from '@vueuse/core';
import { useDiagnosticReportStore } from '../stores/diagnosticReport.js';
import type { PageHeatmapEntry, QueryCacheEntry } from '../engine.js';

const dr = useDiagnosticReportStore();
const nowDate = useNow({ interval: 1000 });
const nowMs = computed(() => nowDate.value.getTime());

const cache = computed(() => dr.cacheSnapshot);

const resolvedLineCount = computed(() =>
  (cache.value?.lineCache ?? []).filter(e => e.resultType !== 'Pending').length,
);

const heatmapEntries = computed<PageHeatmapEntry[]>(() => dr.pageHeatmap);

/** Query cache entries from TanStack Query. */
const queryCacheEntries = computed<QueryCacheEntry[]>(() => dr.queryCache);
const queryCacheFreshCount = computed(() => queryCacheEntries.value.filter(e => e.status === 'fresh').length);
const queryCacheStaleCount = computed(() => queryCacheEntries.value.filter(e => e.status === 'stale').length);

/* Preload direction: compute by examining access sequence number trend across pages.
 * If pages with higher accessSeq are at higher page indices → forward.
 * If pages with higher accessSeq are at lower page indices → backward.
 * Otherwise → stable. */
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
  if (dir === 'forward') return 'Cache preloading forward — newer pages have higher access recency';
  if (dir === 'backward') return 'Cache preloading backward — older pages have higher access recency';
  if (dir === 'stable') return 'Cache access pattern is stable — no clear preload direction';
  return '';
});

/** Format an epoch-ms timestamp as a human-readable age (e.g., "12s", "3m", "1h"). */
function formatAge(createdAt: number, nowMs: number): string {
  const diffMs = nowMs - createdAt;
  if (diffMs < 0) return 'just now';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  return `${hrs}h ago`;
}


/** CSS class based on how close to stale expiry (green > 50% remaining, yellow 10-50%, red < 10%). */
function staleUrgencyClass(updatedAt: number, staleTime: number, nowMs: number): string {
  const remaining = Math.max(0, staleTime - (nowMs - updatedAt));
  const pct = remaining / staleTime;
  if (pct > 0.5) return 'ttl-fresh';
  if (pct > 0.1) return 'ttl-warning';
  return 'ttl-expiring';
}

/** Format remaining time until data goes stale. */
function formatStaleRemaining(updatedAt: number, staleTime: number, nowMs: number): string {
  const remaining = Math.max(0, staleTime - (nowMs - updatedAt));
  if (remaining <= 0) return 'stale';
  const sec = Math.floor(remaining / 1000);
  if (sec < 60) return `${sec}s fresh`;
  const min = Math.floor(sec / 60);
  return `${min}m fresh`;
}</script>
