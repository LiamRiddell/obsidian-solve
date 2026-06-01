<!--#region Component: DagTab — Dependency Graph Visualization -->
/**
 * DagTab.vue — Dependency graph visualization for variable tracking.
 *
 * Displays the DAG (Directed Acyclic Graph) of variable dependencies:
 * - Which variables each line reads and writes
 * - Which lines depend on (consume) each variable
 * - Data source dependencies for async resolution
 *
 * Uses a simple tree/list layout rather than a full SVG graph,
 * keeping the implementation lightweight while still conveying
 * the dependency topology.
 *
 * @component DagTab
 */
<!--#endregion -->

<template>
  <div class="tab-panel active" id="panel-dag">
    <div class="panel-toolbar">
      <span class="dag-count">
        {{ nodeCount }} variable{{ nodeCount !== 1 ? 's' : '' }} ·
        {{ edgeCount }} read{{ edgeCount !== 1 ? 's' : '' }} ·
        {{ sourceCount }} data source{{ sourceCount !== 1 ? 's' : '' }}
      </span>
      <span class="toggle-label" style="font-size:10px;color:var(--text-muted)">Dependency Graph</span>
    </div>
    <div class="panel-scroll">
      <span v-if="!hasData" class="empty">No DAG data available</span>

      <template v-else>
        <!-- Variable dependency list -->
        <div
          v-for="entry in varEntries"
          :key="entry.variable"
          class="dag-var-group"
          :class="{ expanded: expandedVars.has(entry.variable) }"
        >
          <div class="dag-var-header" @click="toggleVar(entry.variable)">
            <span class="dag-var-toggle">{{ expandedVars.has(entry.variable) ? '▼' : '▶' }}</span>
            <span class="dag-var-name">{{ entry.variable }}</span>
            <span class="dag-var-counts">
              <span class="dag-badge dag-badge-read" :title="'Read by ' + entry.consumers.length + ' lines'">
                {{ entry.consumers.length }} read{{ entry.consumers.length !== 1 ? 's' : '' }}
              </span>
              <span v-if="entry.producerLine" class="dag-badge dag-badge-write">
                L{{ entry.producerLine }}
              </span>
            </span>
          </div>
          <div v-if="expandedVars.has(entry.variable)" class="dag-var-body">
            <div class="dag-section-label">Consumers (lines that read this variable):</div>
            <div v-if="entry.consumers.length === 0" class="dag-empty-msg">No consumers</div>
            <div v-else class="dag-consumer-chips">
              <span v-for="ln in entry.consumers" :key="ln" class="dag-consumer-chip" @click="selectLine(ln)">
                L{{ ln }}
              </span>
            </div>

            <div v-if="entry.producerLine" class="dag-section-label" style="margin-top:8px">
              Producer (line that writes this variable):
            </div>
            <div v-if="entry.producerLine" class="dag-producer-chip" @click="selectLine(entry.producerLine)">
              L{{ entry.producerLine }}
            </div>
          </div>
        </div>

        <!-- Data source dependencies -->
        <div v-if="dataSourceEntries.length > 0" class="dag-section-header">
          Data Source Dependencies
        </div>
        <div
          v-for="entry in dataSourceEntries"
          :key="entry.key"
          class="dag-var-group"
          :class="{ expanded: expandedSources.has(entry.key) }"
        >
          <div class="dag-var-header" @click="toggleSource(entry.key)">
            <span class="dag-var-toggle">{{ expandedSources.has(entry.key) ? '▼' : '▶' }}</span>
            <span class="dag-var-name" style="color:var(--stage-async)">📡 {{ entry.key }}</span>
            <span class="dag-var-counts">
              <span class="dag-badge dag-badge-async">{{ entry.consumers.length }} line{{ entry.consumers.length !== 1 ? 's' : '' }}</span>
            </span>
          </div>
          <div v-if="expandedSources.has(entry.key)" class="dag-var-body">
            <div class="dag-consumer-chips">
              <span v-for="ln in entry.consumers" :key="ln" class="dag-consumer-chip" @click="selectLine(ln)">
                L{{ ln }}
              </span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useEngineStore } from '../stores/engine.js';
import { usePipelineStore } from '../stores/pipeline.js';

const engine = useEngineStore();
const pipeline = usePipelineStore();

const expandedVars = ref(new Set<string>());
const expandedSources = ref(new Set<string>());

function toggleVar(name: string): void {
  if (expandedVars.value.has(name)) expandedVars.value.delete(name);
  else expandedVars.value.add(name);
}

function toggleSource(key: string): void {
  if (expandedSources.value.has(key)) expandedSources.value.delete(key);
  else expandedSources.value.add(key);
}

function selectLine(ln: number): void {
  pipeline.selectLine(ln, true);
}

const hasData = computed(() => {
  const snap = engine.currentResult?.dagSnapshot;
  if (!snap) return false;
  return Object.keys(snap.consumers).length > 0 || Object.keys(snap.reads).length > 0 || Object.keys(snap.dataSourceConsumers).length > 0;
});

const nodeCount = computed(() => {
  const snap = engine.currentResult?.dagSnapshot;
  if (!snap) return 0;
  return Object.keys(snap.consumers).length;
});

const edgeCount = computed(() => {
  const snap = engine.currentResult?.dagSnapshot;
  if (!snap) return 0;
  let count = 0;
  for (const consumers of Object.values(snap.consumers)) count += consumers.length;
  return count;
});

const sourceCount = computed(() => {
  return Object.keys(engine.currentResult?.dagSnapshot?.dataSourceConsumers ?? {}).length;
});

interface VarEntry {
  variable: string;
  consumers: number[];
  producerLine: number | null;
}

const varEntries = computed<VarEntry[]>(() => {
  const snap = engine.currentResult?.dagSnapshot;
  if (!snap) return [];
  const allVars = new Set<string>();
  for (const v of Object.keys(snap.consumers)) allVars.add(v);
  for (const [, vars] of Object.entries(snap.writes)) vars.forEach(v => allVars.add(v));
  for (const [, vars] of Object.entries(snap.reads)) vars.forEach(v => allVars.add(v));

  // Build producer map: variable → line number that writes it
  const producers: Record<string, number> = {};
  for (const [lnStr, vars] of Object.entries(snap.writes)) {
    const ln = Number(lnStr);
    vars.forEach(v => { producers[v] = ln; });
  }

  return Array.from(allVars)
    .sort()
    .map(variable => ({
      variable,
      consumers: snap.consumers[variable] ?? [],
      producerLine: producers[variable] ?? null,
    }));
});

interface DataSourceEntry {
  key: string;
  consumers: number[];
}

const dataSourceEntries = computed<DataSourceEntry[]>(() => {
  const snap = engine.currentResult?.dagSnapshot;
  if (!snap) return [];
  return Object.entries(snap.dataSourceConsumers).map(([key, consumers]) => ({
    key,
    consumers,
  }));
});
</script>

<style scoped>
.dag-var-group {
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.dag-var-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.15s;
  user-select: none;
}
.dag-var-header:hover {
  background: rgba(255,255,255,0.04);
}
.dag-var-toggle {
  font-size: 9px;
  color: var(--text-muted);
  width: 12px;
  flex-shrink: 0;
}
.dag-var-name {
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 12px;
  color: var(--accent);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dag-var-counts {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.dag-badge {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 500;
  letter-spacing: 0.3px;
}
.dag-badge-read {
  background: rgba(90, 200, 250, 0.15);
  color: #5ac8fa;
}
.dag-badge-write {
  background: rgba(78, 201, 176, 0.15);
  color: #4ec9b0;
}
.dag-badge-async {
  background: rgba(255, 216, 102, 0.15);
  color: #ffd866;
}
.dag-var-body {
  padding: 0 12px 8px 28px;
}
.dag-section-label {
  font-size: 9px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}
.dag-empty-msg {
  font-size: 10px;
  color: var(--text-muted);
  font-style: italic;
  padding: 4px 0;
}
.dag-consumer-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.dag-consumer-chip,
.dag-producer-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 10px;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  border-radius: 3px;
  background: rgba(255,255,255,0.06);
  color: var(--text);
  cursor: pointer;
  transition: background 0.15s;
}
.dag-consumer-chip:hover,
.dag-producer-chip:hover {
  background: rgba(255,255,255,0.12);
}
.dag-section-header {
  padding: 10px 12px 6px;
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}
.dag-count {
  font-size: 10px;
  color: var(--text-muted);
}
</style>
