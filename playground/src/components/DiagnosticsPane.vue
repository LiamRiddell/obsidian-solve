<template>
  <section class="diagnostics-pane" id="diagnostics-pane" :class="{ collapsed: ui.diagnosticsCollapsed }">
    <nav class="tab-bar">
      <button v-for="tab in tabs" :key="tab.id" class="tab-btn" :class="{ active: ui.activeTab === tab.id }" @click="ui.setActiveTab(tab.id)">
        <span class="msi msi-dense">{{ tab.icon }}</span>
        {{ tab.label }}
      </button>
    </nav>
    <component :is="currentTabComponent" :key="dr.runId" />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useUiStore, type ActiveTab } from '../stores/ui.js';
import { useDiagnosticReportStore } from '../stores/diagnosticReport.js';
import OutputTab from './OutputTab.vue';
import SummaryTab from './SummaryTab.vue';
import QaTab from './QaTab.vue';
import PipelineTab from './PipelineTab.vue';
import BytecodeTab from './BytecodeTab.vue';
import VmTraceTab from './VmTraceTab.vue';
import PerfTab from './PerfTab.vue';
import WorkersTab from './WorkersTab.vue';
import CacheTab from './CacheTab.vue';
import StreamTab from './StreamTab.vue';
import DagTab from './DagTab.vue';
import ParseletRegistryTab from './ParseletRegistryTab.vue';
import NormalizerTab from './NormalizerTab.vue';

const ui = useUiStore();
const dr = useDiagnosticReportStore();

const tabs: { id: ActiveTab; label: string; icon: string }[] = [
  { id: 'tokens', label: 'Output', icon: 'terminal' },
  { id: 'summary', label: 'Summary', icon: 'dashboard' },
  { id: 'normalizer', label: 'Normalizer', icon: 'sync' },
  { id: 'flow', label: 'Pipeline', icon: 'linear_scale' },
  { id: 'cache', label: 'Cache', icon: 'database' },
  { id: 'parselets', label: 'Parselets', icon: 'construction' },
  { id: 'bytecode', label: 'Bytecode', icon: 'data_object' },
  { id: 'vmtrace', label: 'VM Trace', icon: 'bolt' },
  { id: 'dag', label: 'DAG', icon: 'hub' },
  { id: 'workers', label: 'Workers', icon: 'settings' },
  { id: 'perf', label: 'Perf', icon: 'speed' },
  { id: 'stream', label: 'Stream', icon: 'stream' },
  { id: 'qa', label: 'QA', icon: 'science' },
];

const tabComponents: Record<ActiveTab, any> = {
  tokens: OutputTab,
  summary: SummaryTab,
  qa: QaTab,
  normalizer: NormalizerTab,
  flow: PipelineTab,
  parselets: ParseletRegistryTab,
  bytecode: BytecodeTab,
  vmtrace: VmTraceTab,
  dag: DagTab,
  cache: CacheTab,
  workers: WorkersTab,
  perf: PerfTab,
  stream: StreamTab,
};

const currentTabComponent = computed(() => tabComponents[ui.activeTab]);
</script>
