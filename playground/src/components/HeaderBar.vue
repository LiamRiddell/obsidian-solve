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
      <div class="pipeline-mini" :class="{ active: engine.status === 'busy' }">
        <span class="pipeline-stage" data-stage="lexer" :class="{ executed: engine.currentResult }">🔤 Lexer</span>
        <span class="pipeline-arrow">→</span>
        <span class="pipeline-stage" data-stage="validate" :class="{ executed: engine.currentResult }">🛡️ Validation</span>
        <span class="pipeline-arrow">→</span>
        <span class="pipeline-stage" data-stage="cache" :class="{ executed: engine.currentResult }">💾 Cache</span>
        <span class="pipeline-arrow">→</span>
        <span class="pipeline-stage" data-stage="parser" :class="{ executed: engine.currentResult }">🌳 Parser</span>
        <span class="pipeline-arrow">→</span>
        <span class="pipeline-stage" data-stage="compiler" :class="{ executed: engine.currentResult }">⚙️ Compiler</span>
        <span class="pipeline-arrow">→</span>
        <span class="pipeline-stage" data-stage="async" :class="{ executed: engine.currentResult }">🔮 Async</span>
        <span class="pipeline-arrow">→</span>
        <span class="pipeline-stage" data-stage="vm" :class="{ executed: engine.currentResult }">⚡ VM</span>
        <span class="pipeline-arrow">→</span>
        <span class="pipeline-stage" data-stage="result" :class="{ executed: engine.currentResult }">✓ Result</span>
      </div>
      <div class="pipeline-timing">
        {{ engine.currentResult ? fmt(engine.currentResult.stats.totalTime) : '0 µs' }}
      </div>
    </div>
    <div class="header-right">
      <button class="header-btn mobile-only" @click="ui.toggleSidebar()" title="Show sidebar">☰</button>
      <button class="header-btn" @click="pipeline.collapseAllStages()" title="Collapse all pipeline flow stages">⊟</button>
      <button class="header-btn" @click="pipeline.expandAllStages()" title="Expand all pipeline flow stages">⊞</button>
      <span
        class="status-dot"
        :class="'status-' + engine.status"
        :title="engine.status === 'ready' ? 'Ready' : engine.status === 'busy' ? 'Evaluating…' : 'Error'"
      ></span>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useEngineStore } from '../stores/engine.js';
import { useUiStore } from '../stores/ui.js';
import { usePipelineStore } from '../stores/pipeline.js';
import { fmt } from '../utils.js';

const engine = useEngineStore();
const ui = useUiStore();
const pipeline = usePipelineStore();
</script>
