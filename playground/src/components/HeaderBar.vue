<template>
  <header class="header-bar">
    <div class="header-left">
      <h1 class="header-title">
        <span class="header-logo-badge"><img src="/solve-logo.svg" alt="" class="header-logo-img" /></span>
        <span class="header-app-name">Playground</span>
      </h1>
    </div>
    <div class="header-center">
      <div class="pipeline-timing" :class="{ active: dr.status === 'busy' }">
        <span class="msi msi-dense">linear_scale</span>
        {{ dr.result ? fmt(dr.stats?.totalTime ?? 0) : '0 µs' }}
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useDiagnosticReportStore } from '../stores/diagnosticReport.js';
import { fmt } from '@bridge/utils';

const dr = useDiagnosticReportStore();
</script>
