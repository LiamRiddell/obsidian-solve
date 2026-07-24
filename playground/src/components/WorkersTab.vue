<template>
  <div class="tab-panel active" id="panel-workers">
    <div class="panel-scroll">
      <!-- Engine Worker Card -->
      <div class="worker-card">
        <div class="worker-card-header">
          <span class="msi worker-card-icon">settings</span>
          <span class="worker-card-name">Engine Worker</span>
          <span class="worker-card-status" :class="{ 'status-busy': ws.engineStatus === 'busy' }">{{ ws.engineStatus }}</span>
        </div>
        <div class="worker-card-body">
          <div class="worker-metric">
            <span class="worker-metric-label">Latency</span>
            <span class="worker-metric-value">{{ ws.engineAvgLatency > 0 ? ws.engineAvgLatency.toFixed(2) + ' ms' : '—' }}</span>
          </div>
          <div class="worker-metric">
            <span class="worker-metric-label">Queue depth</span>
            <span class="worker-metric-value">{{ ws.engine.queueDepth }}</span>
          </div>
          <div class="worker-metric">
            <span class="worker-metric-label">Last run</span>
            <span class="worker-metric-value">{{ ws.engineLastRunAgo }}</span>
          </div>
          <div class="worker-latency-bar">
            <div class="worker-latency-fill" :class="ws.engineLatencyBarClass" :style="{ width: ws.engineLatencyBarPct + '%' }"></div>
          </div>
          <div class="worker-latency-scale">
            <span style="left: 0%">0</span>
            <span style="left: 10%">10ms</span>
            <span style="left: 50%">50ms</span>
            <span style="left: 100%">100ms+</span>
          </div>
        </div>
        <div class="worker-card-footer">
          <span class="worker-metric-label">Messages received</span>
          <span class="worker-metric-value">{{ ws.engine.msgCount }}</span>
        </div>
      </div>

      <!-- Query Cache Card (TanStack Query) — QueryClient config folded in
           as a footnote rather than its own equally-weighted card, since
           it's static configuration, not a live metric. -->
      <div class="worker-card">
        <div class="worker-card-header">
          <span class="msi worker-card-icon">cloud_sync</span>
          <span class="worker-card-name">Query Cache</span>
          <span class="worker-card-status" :class="{ 'status-offline': !ws.qcHasData }">{{ ws.qcStatus }}</span>
        </div>
        <div class="worker-card-body">
          <div class="worker-metric">
            <span class="worker-metric-label">Total queries</span>
            <span class="worker-metric-value">{{ ws.queryCache.totalQueries }}</span>
          </div>
          <div class="worker-metric">
            <span class="worker-metric-label">Fresh</span>
            <span class="worker-metric-value" style="color:var(--success)">{{ ws.queryCache.freshQueries }}</span>
          </div>
          <div class="worker-metric">
            <span class="worker-metric-label">Stale</span>
            <span class="worker-metric-value" style="color:var(--stage-vm)">{{ ws.queryCache.staleQueries }}</span>
          </div>
          <div class="worker-metric">
            <span class="worker-metric-label">Fetching</span>
            <span class="worker-metric-value" style="color:var(--stage-lexer)">{{ ws.queryCache.fetchingQueries }}</span>
          </div>
          <div class="worker-metric">
            <span class="worker-metric-label">Errors</span>
            <span class="worker-metric-value" style="color:var(--error)">{{ ws.queryCache.errorQueries }}</span>
          </div>
          <div class="worker-metric">
            <span class="worker-metric-label">Last activity</span>
            <span class="worker-metric-value">{{ ws.qcLastActivityAgo }}</span>
          </div>
          <div class="worker-metric">
            <span class="worker-metric-label">Default staleTime / gcTime</span>
            <span class="worker-metric-value">{{ formatDuration(ws.queryClientConfig.staleTime) }} / {{ formatDuration(ws.queryClientConfig.gcTime) }}</span>
          </div>
        </div>
        <div class="worker-card-footer">
          <span class="worker-metric-label">Provider</span>
          <span class="worker-metric-value">@tanstack/query-core</span>
        </div>
      </div>

      <!-- Compiled Bytecode Card — real data from the engine's bytecode
           cache (dr.cacheSnapshot.bytecode), replacing a previous
           "Compilation Worker" card whose fields were permanently
           hardcoded to zero/idle with no code anywhere that ever set
           them, despite looking identical to the real Engine Worker
           card above it. -->
      <div class="worker-card">
        <div class="worker-card-header">
          <span class="msi worker-card-icon">inventory_2</span>
          <span class="worker-card-name">Compiled Bytecode</span>
          <span class="worker-card-status" :class="{ 'status-busy': bytecodeEntries.length > 0 }">{{ bytecodeEntries.length > 0 ? 'populated' : 'empty' }}</span>
        </div>
        <div class="worker-card-body">
          <div class="worker-metric">
            <span class="worker-metric-label">Cached programs</span>
            <span class="worker-metric-value">{{ bytecodeEntries.length }}</span>
          </div>
          <div class="worker-metric">
            <span class="worker-metric-label">Total opcodes</span>
            <span class="worker-metric-value">{{ bytecodeTotals.opcodes }}</span>
          </div>
          <div class="worker-metric">
            <span class="worker-metric-label">Total constants</span>
            <span class="worker-metric-value">{{ bytecodeTotals.constants }}</span>
          </div>
          <div class="worker-metric">
            <span class="worker-metric-label">Async-aware programs</span>
            <span class="worker-metric-value">{{ bytecodeTotals.asyncCount }}</span>
          </div>
        </div>
        <div class="worker-card-footer">
          <span class="worker-metric-label">Source</span>
          <span class="worker-metric-value">ExpressionEngine bytecode cache</span>
        </div>
      </div>

      <!-- Activity Log -->
      <div class="worker-log">
        <h4>Activity Log</h4>
        <div class="worker-log-entries" ref="logContainer">
          <span v-if="ws.activityLog.length === 0" class="empty">No worker activity yet</span>
          <div v-for="(entry, i) in recentLog" :key="i" class="worker-log-entry">
            <span class="worker-log-time">{{ formatTime(entry.ts) }}</span>
            <span class="worker-log-source" :class="entry.source">{{ entry.source === 'query-cache' ? 'query' : entry.source }}</span>
            <span class="worker-log-msg" :class="{ error: entry.error }">{{ entry.msg }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useWorkersStore } from '../stores/workers.js';
import { useDiagnosticReportStore } from '../stores/diagnosticReport.js';
import { formatDuration } from '../utils.js';

const ws = useWorkersStore();
const dr = useDiagnosticReportStore();

const recentLog = computed(() => ws.activityLog.slice(-30));

const bytecodeEntries = computed(() => dr.cacheSnapshot?.bytecode ?? []);
const bytecodeTotals = computed(() => {
  const entries = bytecodeEntries.value;
  return {
    opcodes: entries.reduce((sum, e) => sum + e.opcodesLength, 0),
    constants: entries.reduce((sum, e) => sum + e.numbersLength + e.stringsLength, 0),
    asyncCount: entries.filter(e => e.hasAsync).length,
  };
});

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.getHours().toString().padStart(2, '0') + ':' +
    d.getMinutes().toString().padStart(2, '0') + ':' +
    d.getSeconds().toString().padStart(2, '0') + '.' +
    d.getMilliseconds().toString().padStart(3, '0');
}
</script>
