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

      <!-- DataQuery Worker Card -->
      <div class="worker-card">
        <div class="worker-card-header">
          <span class="worker-card-icon">📡</span>
          <span class="worker-card-name">Data Query Worker</span>
          <span class="worker-card-status" :class="{ 'status-offline': !ws.dqHasData }">{{ ws.dqStatus }}</span>
        </div>
        <div class="worker-card-body">
          <div class="worker-metric">
            <span class="worker-metric-label">Active requests</span>
            <span class="worker-metric-value">{{ ws.dataquery.activeRequests }}</span>
          </div>
          <div class="worker-metric worker-metric-sources">
            <span class="worker-metric-label">Registered sources</span>
            <div class="worker-dq-sources-list">
              <template v-if="ws.dataquery.sourceNames.length > 0">
                <span v-for="name in ws.dataquery.sourceNames" :key="name" class="worker-dq-source-chip">{{ name }}</span>
              </template>
              <span v-else class="empty">none</span>
            </div>
          </div>
          <div class="worker-metric">
            <span class="worker-metric-label">Last activity</span>
            <span class="worker-metric-value">{{ ws.dqLastActivityAgo }}</span>
          </div>
        </div>
        <div class="worker-card-footer">
          <span class="worker-metric-label">Total fetches</span>
          <span class="worker-metric-value">{{ ws.dataquery.fetches }}</span>
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
            <span class="worker-log-source" :class="entry.source">{{ entry.source }}</span>
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
