<template>
  <header class="header-bar">
    <div class="header-left">
      <h1 class="header-title">
        <span class="header-logo">⟐</span>
        Solve Engine
        <span class="header-badge">Diagnostic Playground</span>
      </h1>
    </div>
    <div class="header-center">
      <div class="pipeline-mini" :class="{ active: dr.status === 'busy' }">
        <span class="pipeline-stage" data-stage="lexer" :class="{ executed: dr.result }">🔤 Lexer</span>
        <span class="pipeline-arrow">→</span>
        <span class="pipeline-stage" data-stage="validate" :class="{ executed: dr.result }">🛡️ Validation</span>
        <span class="pipeline-arrow">→</span>
        <span class="pipeline-stage" data-stage="cache" :class="{ executed: dr.result }">💾 Cache</span>
        <span class="pipeline-arrow">→</span>
        <span class="pipeline-stage" data-stage="parser" :class="{ executed: dr.result }">🌳 Parser</span>
        <span class="pipeline-arrow">→</span>
        <span class="pipeline-stage" data-stage="compiler" :class="{ executed: dr.result }">⚙️ Compiler</span>
        <span class="pipeline-arrow">→</span>
        <span class="pipeline-stage" data-stage="async" :class="{ executed: dr.result }">🔮 Async</span>
        <span class="pipeline-arrow">→</span>
        <span class="pipeline-stage" data-stage="vm" :class="{ executed: dr.result }">⚡ VM</span>
        <span class="pipeline-arrow">→</span>
        <span class="pipeline-stage" data-stage="result" :class="{ executed: dr.result }">✓ Result</span>
      </div>
      <div class="pipeline-timing">
        {{ dr.result ? fmt(dr.stats?.totalTime ?? 0) : '0 µs' }}
      </div>
    </div>
    <div class="header-right">
      <button class="header-btn mobile-only" @click="ui.toggleSidebar()" title="Show sidebar">☰</button>
      <button class="header-btn" @click="pipeline.collapseAllStages()" title="Collapse all pipeline flow stages">⊟</button>
      <button class="header-btn" @click="pipeline.expandAllStages()" title="Expand all pipeline flow stages">⊞</button>
      <span
        class="status-dot"
        :class="'status-' + dr.status"
        :title="dr.status === 'ready' ? 'Ready' : dr.status === 'busy' ? 'Evaluating…' : 'Error'"
      ></span>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useDiagnosticReportStore } from '../stores/diagnosticReport.js';
import { useUiStore } from '../stores/ui.js';
import { usePipelineStore } from '../stores/pipeline.js';
import { fmt } from '../utils.js';

const dr = useDiagnosticReportStore();
const ui = useUiStore();
const pipeline = usePipelineStore();
</script>
