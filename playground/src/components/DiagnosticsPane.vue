<template>
  <section class="diagnostics-pane" id="diagnostics-pane" :class="{ collapsed: ui.diagnosticsCollapsed }">
    <div class="diagnostics-pane-header">
      <span class="pane-title">Diagnostics</span>
      <button class="pane-collapse-btn" @click="ui.toggleDiagnostics()" :title="ui.diagnosticsCollapsed ? 'Expand diagnostics' : 'Collapse diagnostics'">
        {{ ui.diagnosticsCollapsed ? '◀' : '▶' }}
      </button>
    </div>
    <nav class="tab-bar">
      <button v-for="tab in tabs" :key="tab.id" class="tab-btn" :class="{ active: ui.activeTab === tab.id }" @click="ui.setActiveTab(tab.id)">
        {{ tab.label }}
      </button>
    </nav>
    <KeepAlive>
      <OutputTab v-if="ui.activeTab === 'tokens'" :key="engine.runId" />
      <PipelineTab v-else-if="ui.activeTab === 'flow'" :key="engine.runId" />
      <BytecodeTab v-else-if="ui.activeTab === 'bytecode'" :key="engine.runId" />
      <VmTraceTab v-else-if="ui.activeTab === 'vmtrace'" :key="engine.runId" />
      <PerfTab v-else-if="ui.activeTab === 'perf'" :key="engine.runId" />
      <WorkersTab v-else-if="ui.activeTab === 'workers'" :key="engine.runId" />
      <CacheTab v-else-if="ui.activeTab === 'cache'" :key="engine.runId" />
      <DagTab v-else-if="ui.activeTab === 'dag'" :key="engine.runId" />
      <StreamTab v-else-if="ui.activeTab === 'stream'" :key="engine.runId" />
    </KeepAlive>
  </section>
</template>

<script setup lang="ts">
import { useUiStore, type ActiveTab } from '../stores/ui.js';
import { useEngineStore } from '../stores/engine.js';
import OutputTab from './OutputTab.vue';
import PipelineTab from './PipelineTab.vue';
import BytecodeTab from './BytecodeTab.vue';
import VmTraceTab from './VmTraceTab.vue';
import PerfTab from './PerfTab.vue';
import WorkersTab from './WorkersTab.vue';
import CacheTab from './CacheTab.vue';
import StreamTab from './StreamTab.vue';
import DagTab from './DagTab.vue';

const ui = useUiStore();
const engine = useEngineStore();

const tabs: { id: ActiveTab; label: string }[] = [
  { id: 'tokens', label: 'Output' },
  { id: 'flow', label: 'Pipeline' },
  { id: 'bytecode', label: 'Bytecode' },
  { id: 'vmtrace', label: 'VM Trace' },
  { id: 'dag', label: 'DAG' },
  { id: 'perf', label: 'Perf' },
  { id: 'workers', label: 'Workers' },
  { id: 'cache', label: 'Cache' },
  { id: 'stream', label: 'Stream' },
];
</script>
