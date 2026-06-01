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
    <component :is="currentTabComponent" :key="engine.runId" />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
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
import ParseletRegistryTab from './ParseletRegistryTab.vue';

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
  { id: 'parselets', label: 'Parselets' },
  { id: 'stream', label: 'Stream' },
];

const tabComponents: Record<ActiveTab, any> = {
  tokens: OutputTab,
  flow: PipelineTab,
  bytecode: BytecodeTab,
  vmtrace: VmTraceTab,
  dag: DagTab,
  perf: PerfTab,
  workers: WorkersTab,
  cache: CacheTab,
  parselets: ParseletRegistryTab,
  stream: StreamTab,
};

const currentTabComponent = computed(() => tabComponents[ui.activeTab]);
</script>
