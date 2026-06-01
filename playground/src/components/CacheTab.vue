<template>
  <div class="tab-panel active" id="panel-cache">
    <div class="panel-scroll" id="cache-display">
      <span v-if="!cache" class="empty">No cache data</span>
      <template v-else>
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

        <!-- Async Cache -->
        <div v-for="pkg in cache.asyncCache" :key="pkg.packageId" class="cache-section">
          <div class="cache-section-header">
            <span>⟳ {{ pkg.packageId }}</span>
            <span class="cache-section-count">{{ pkg.resolvedCount }} ✓ · {{ pkg.inFlightCount }} ⟳ · {{ pkg.errorCount }} ✗</span>
          </div>
          <div v-if="pkg.entries.length === 0" class="cache-entry">
            <span class="empty" style="padding:8px;display:block;width:100%;text-align:center">No async cache entries</span>
          </div>
          <div v-for="entry in pkg.entries" :key="entry.key" class="cache-entry">
            <span class="cache-entry-expr">{{ entry.key }}</span>
            <span class="cache-entry-status" :class="entry.status">{{ entry.status === 'resolved' ? '✓' : entry.status === 'error' ? '✗' : '⟳' }}</span>
            <span v-if="entry.errorMessage" class="cache-entry-meta" style="color:var(--error)">{{ entry.errorMessage }}</span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useEngineStore } from '../stores/engine.js';

const engine = useEngineStore();
const cache = computed(() => engine.currentResult?.cacheSnapshot ?? null);

const resolvedLineCount = computed(() =>
  (cache.value?.lineCache ?? []).filter(e => e.resultType !== 'Pending').length,
);
</script>
