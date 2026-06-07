<!--#region 📦 Module Overview -->
/**
 * ParseletRegistryTab.vue — Shows all registered parselets with token types
 * and binding powers for debugging the parser configuration.
 *
 * @component ParseletRegistryTab
 */
<!--#endregion -->

<template>
  <div class="tab-panel active" id="panel-parselet-registry">
    <div class="panel-toolbar">
      <div class="panel-toolbar-left">
        <input
          type="text"
          class="token-filter-input"
          placeholder="Filter parselets…"
          spellcheck="false"
          v-model="filterQuery"
        />
      </div>
      <span class="token-count">{{ filteredPrefix.length + filteredInfix.length }} parselets</span>
    </div>
    <div class="panel-scroll">
      <!-- Prefix Parselets -->
      <div class="parselet-section">
        <div class="parselet-section-header">
          <span class="parselet-section-title">Prefix Parselets</span>
          <span class="constants-section-total">{{ filteredPrefix.length }}</span>
        </div>
        <table v-if="filteredPrefix.length > 0" class="parselet-table">
          <thead>
            <tr>
              <th class="parselet-col-token">Token Type</th>
              <th class="parselet-col-bp">Binding Power</th>
              <th class="parselet-col-desc">Category</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in filteredPrefix" :key="p.tokenType" class="parselet-row">
              <td class="parselet-col-token">
                <span class="parselet-token-chip">{{ p.tokenType }}</span>
              </td>
              <td class="parselet-col-bp">{{ p.bindingPower }}</td>
              <td class="parselet-col-desc">{{ p.category || '—' }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="parselet-empty">No prefix parselets registered</div>
      </div>

      <!-- Infix Parselets -->
      <div class="parselet-section" style="margin-top: 12px">
        <div class="parselet-section-header">
          <span class="parselet-section-title">Infix Parselets</span>
          <span class="constants-section-total">{{ filteredInfix.length }}</span>
        </div>
        <table v-if="filteredInfix.length > 0" class="parselet-table">
          <thead>
            <tr>
              <th class="parselet-col-token">Token Type</th>
              <th class="parselet-col-bp">Left BP</th>
              <th class="parselet-col-bp">Right BP</th>
              <th class="parselet-col-desc">Category</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in filteredInfix" :key="p.tokenType" class="parselet-row">
              <td class="parselet-col-token">
                <span class="parselet-token-chip">{{ p.tokenType }}</span>
              </td>
              <td class="parselet-col-bp">{{ p.leftBindingPower }}</td>
              <td class="parselet-col-bp">{{ p.rightBindingPower }}</td>
              <td class="parselet-col-desc">{{ p.category || '—' }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="parselet-empty">No infix parselets registered</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDiagnosticReportStore } from '../stores/diagnosticReport.js';

interface PrefixParseletInfo {
  tokenType: string;
  bindingPower: number;
  category?: string;
}

interface InfixParseletInfo {
  tokenType: string;
  leftBindingPower: number;
  rightBindingPower: number;
  category?: string;
}

const dr = useDiagnosticReportStore();
const filterQuery = ref('');

// Dynamic parselet data from the engine's ParseletRegistry.
// Falls back to empty arrays if the engine hasn't populated the data yet.
const prefixParselets = computed<PrefixParseletInfo[]>(() => dr.parseletRegistry?.prefix ?? []);
const infixParselets = computed<InfixParseletInfo[]>(() => dr.parseletRegistry?.infix ?? []);

function matches(p: { tokenType: string; category?: string }, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return p.tokenType.toLowerCase().includes(q) || (p.category?.toLowerCase().includes(q) ?? false);
}

const filteredPrefix = computed(() => {
  const q = filterQuery.value.trim().toLowerCase();
  return q ? prefixParselets.filter(p => matches(p, q)) : prefixParselets;
});

const filteredInfix = computed(() => {
  const q = filterQuery.value.trim().toLowerCase();
  return q ? infixParselets.filter(p => matches(p, q)) : infixParselets;
});
</script>

<style scoped>
.parselet-section {
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  overflow: hidden;
}
.parselet-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-subtle);
}
.parselet-section-title {
  font-size: 10px;
  font-weight: 600;
  color: var(--stage-parser);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.parselet-table {
  width: 100%;
  border-collapse: collapse;
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 10px;
  background: var(--bg-primary);
}
.parselet-table thead { background: var(--bg-tertiary); }
.parselet-table th {
  padding: 4px 10px;
  font-size: 8px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  text-align: left;
  border-bottom: 1px solid var(--border-subtle);
}
.parselet-col-token { width: 120px; }
.parselet-col-bp { width: 80px; text-align: center; }
.parselet-col-desc { text-align: left; }
.parselet-row { transition: background 0.15s; border-bottom: 1px solid var(--border-subtle); }
.parselet-row:last-child { border-bottom: none; }
.parselet-row:hover { background: var(--bg-tertiary); }
.parselet-row td { padding: 4px 10px; vertical-align: middle; }
.parselet-token-chip {
  display: inline-flex;
  padding: 1px 7px;
  border-radius: 3px;
  background: var(--stage-parser-dim);
  color: var(--stage-parser);
  border: 1px solid rgba(155, 123, 236, 0.25);
  font-weight: 600;
  font-size: 10px;
}
.parselet-empty {
  padding: 12px;
  color: var(--text-muted);
  font-style: italic;
  font-size: 11px;
  text-align: center;
}
</style>
