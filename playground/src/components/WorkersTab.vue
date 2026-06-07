<template>
  <div class="tab-panel active" id="panel-workers">
    <div class="panel-scroll">
      <!-- Engine Worker Card -->
      <div class="worker-card">
        <div class="worker-card-header">
          <span class="worker-card-icon">⚙️</span>
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
            <span>0</span><span>10ms</span><span>50ms</span><span>100ms+</span>
          </div>
        </div>
        <div class="worker-card-footer">
          <span class="worker-metric-label">Messages received</span>
          <span class="worker-metric-value">{{ ws.engine.msgCount }}</span>
        </div>
      </div>

      <!-- Query Cache Card (TanStack Query) -->
      <div class="worker-card">
        <div class="worker-card-header">
          <span class="worker-card-icon">🗄️</span>
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
            <span class="worker-metric-value" style="color:var(--accent)">{{ ws.queryCache.freshQueries }}</span>
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
        </div>
        <div class="worker-card-footer">
          <span class="worker-metric-label">Cache provider</span>
          <span class="worker-metric-value">TanStack Query</span>
        </div>
      </div>

      <!-- Compilation Worker Card -->
      <div class="worker-card">
        <div class="worker-card-header">
          <span class="worker-card-icon">📦</span>
          <span class="worker-card-name">Compilation Worker</span>
          <span class="worker-card-status" :class="{ 'status-busy': ws.compilationWorker.isActive }">{{ ws.compilationWorker.isActive ? 'active' : 'idle' }}</span>
        </div>
        <div class="worker-card-body">
          <div class="worker-metric">
            <span class="worker-metric-label">Active compilations</span>
            <span class="worker-metric-value">{{ ws.compilationWorker.activeCompilations }}</span>
          </div>
          <div class="worker-metric">
            <span class="worker-metric-label">Bytecode stored</span>
            <span class="worker-metric-value">{{ ws.compilationWorker.bytecodeStored }}</span>
          </div>
          <div class="worker-metric">
            <span class="worker-metric-label">Bytecode discarded</span>
            <span class="worker-metric-value">{{ ws.compilationWorker.bytecodeDiscarded }}</span>
          </div>
          <div class="worker-metric">
            <span class="worker-metric-label">Transfer size</span>
            <span class="worker-metric-value">{{ ws.compilationWorker.transferSize }}</span>
          </div>
        </div>
        <div class="worker-card-footer">
          <span class="worker-metric-label">Status</span>
          <span class="worker-metric-value">{{ ws.compilationWorker.bytecodeStored > 0 ? 'Ready' : 'Awaiting work' }}</span>
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

const ws = useWorkersStore();

const recentLog = computed(() => ws.activityLog.slice(-30));

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.getHours().toString().padStart(2, '0') + ':' +
    d.getMinutes().toString().padStart(2, '0') + ':' +
    d.getSeconds().toString().padStart(2, '0') + '.' +
    d.getMilliseconds().toString().padStart(3, '0');
}
</script>
