<template>
  <div class="tab-panel active" id="panel-stream">
    <div class="panel-toolbar">
      <span
        id="stream-event-count"
        class="stream-event-count"
        :class="{ 'stream-live': stream.streamingActive }"
      >
        {{ stream.events.length }} events<span v-if="stream.streamingActive"> · <span class="msi msi-dense msi-spin">progress_activity</span> live</span>
      </span>
      <input type="text" class="token-filter-input" placeholder="Filter by event type…" spellcheck="false" v-model="typeFilter" />
      <button class="copy-all-btn" @click="collapseAll"><span class="msi msi-dense">{{ allCollapsed ? 'expand_more' : 'expand_less' }}</span> {{ allCollapsed ? 'Expand all' : 'Collapse all' }}</button>
    </div>

    <!-- Batcher Panel — stats shown once in an always-visible compact row
         (previously: the same 4 numbers appeared both collapsed AND
         expanded, with only a static description paragraph actually new
         on expand — moved that to a tooltip instead of an expand/collapse
         that just repeated data). -->
    <div v-if="batcherData" class="batcher-panel">
      <div class="batcher-panel-header">
        <span class="batcher-panel-title" title="The batcher collapses multiple async resolutions into a single DAG walk + re-execution pass. When >50 lines are affected, execution is offloaded to a worker pool to prevent UI freezes.">Async Resolution Batcher</span>
        <div class="batcher-stats">
          <span class="batcher-stat" title="Pending — awaiting async resolution"><span class="msi msi-dense">schedule</span> {{ batcherData.pendingCount }} pending</span>
          <span class="batcher-stat" title="Deduped — identical in-flight resolutions merged into one"><span class="msi msi-dense">merge</span> {{ batcherData.dedupCount }} deduped</span>
          <span class="batcher-stat" title="Offloaded — re-execution handed to a worker pool (>50 lines affected)"><span class="msi msi-dense">bolt</span> {{ batcherData.workerOffloadCount }} offloaded</span>
          <span class="batcher-stat" title="Listeners — components waiting on a resolution"><span class="msi msi-dense">hearing</span> {{ batcherData.listenerCount }} listeners</span>
        </div>
      </div>
    </div>

    <div class="panel-scroll" id="stream-display" ref="streamContainer" @scroll="onScroll">
      <span v-if="stream.events.length === 0" class="empty" style="padding:12px;display:block;text-align:center">No diagnostic events</span>
      <span v-else-if="filteredGroups.length === 0" class="empty" style="padding:12px;display:block;text-align:center">No events match &ldquo;{{ typeFilter }}&rdquo;</span>

      <div
        v-for="[groupKey, events] in filteredGroups"
        :key="groupKey"
        class="stream-group"
        :class="{ collapsed: isCollapsed(groupKey) }"
        :data-group-key="groupKey"
      >
        <div
          class="stream-group-header"
          :class="{ expanded: !isCollapsed(groupKey) }"
          @click="toggleGroup(groupKey)"
        >
          <span class="msi msi-dense stream-group-toggle">{{ isCollapsed(groupKey) ? 'chevron_right' : 'expand_more' }}</span>
          <span
            class="stream-group-key"
            :class="events.some(e => e.type.startsWith('async_')) ? 'stream-group-badge-async' : 'stream-group-badge-event'"
          >
            <span v-if="events.some(e => e.type.startsWith('async_'))" class="msi msi-dense">schedule</span><span v-else>#</span> {{ groupKey }}
          </span>
          <span class="stream-group-count">{{ events.length }} event{{ events.length !== 1 ? 's' : '' }}</span>
        </div>
        <div class="stream-group-content">
          <div v-for="(evt, i) in events" :key="i" class="stream-event">
            <span class="stream-event-time">{{ evt.elapsedNs > 0 ? fmt(evt.elapsedNs) : '—' }}</span>
            <span class="stream-event-clock">{{ fmtClock(evt.timestamp) }}</span>
            <span class="stream-event-type" :class="'type-' + evt.type">{{ fmtType(evt.type) }}</span>
            <span class="stream-event-expr">{{ evt.expression }}</span>
            <span v-if="evt.details" class="stream-event-details">{{ evt.details }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useStreamStore } from '../stores/stream.js';
import { useDiagnosticReportStore } from '../stores/diagnosticReport.js';
import { fmt } from '../utils.js';
import type { DiagnosticEventInfo } from '../engine.js';

const stream = useStreamStore();
const dr = useDiagnosticReportStore();
const streamContainer = ref<HTMLElement | null>(null);

// Batcher metrics from engine result
const batcherData = computed(() => dr.batcherMetrics);

// All groups start expanded per 'nothing collapsed by default' mandate.
const collapsedGroups = ref(new Set<string>());
const typeFilter = ref('');

/** Groups filtered by event-type substring — the highest-volume, most
 * log-like tab in the playground previously had zero filtering. */
const filteredGroups = computed<[string, DiagnosticEventInfo[]][]>(() => {
  const entries = Array.from(stream.groupedEvents.entries());
  const q = typeFilter.value.trim().toLowerCase();
  if (!q) return entries;
  return entries
    .map(([key, events]) => [key, events.filter(e => e.type.toLowerCase().includes(q))] as [string, DiagnosticEventInfo[]])
    .filter(([, events]) => events.length > 0);
});

const allCollapsed = computed(() =>
  filteredGroups.value.length > 0 && filteredGroups.value.every(([key]) => collapsedGroups.value.has(key)),
);

function collapseAll(): void {
  if (allCollapsed.value) {
    collapsedGroups.value.clear();
  } else {
    for (const [key] of filteredGroups.value) collapsedGroups.value.add(key);
  }
}

// Auto-scroll to bottom when events are added — but only if the user
// hasn't manually scrolled away from the bottom, so a live-updating
// stream doesn't fight someone inspecting earlier events.
const stickToBottom = ref(true);

function onScroll(): void {
  const el = streamContainer.value;
  if (!el) return;
  stickToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
}

watch(() => stream.events.length, () => {
  if (!stickToBottom.value) return;
  nextTick(() => {
    if (streamContainer.value) {
      streamContainer.value.scrollTop = streamContainer.value.scrollHeight;
    }
  });
});

function isCollapsed(key: string): boolean {
  return collapsedGroups.value.has(key);
}

function toggleGroup(key: string): void {
  if (collapsedGroups.value.has(key)) {
    collapsedGroups.value.delete(key);
  } else {
    collapsedGroups.value.add(key);
  }
}

function fmtClock(ts: number): string {
  const d = new Date(ts);
  return d.getHours().toString().padStart(2, '0') + ':' +
    d.getMinutes().toString().padStart(2, '0') + ':' +
    d.getSeconds().toString().padStart(2, '0') + '.' +
    d.getMilliseconds().toString().padStart(3, '0');
}

/** Acronyms that should stay fully uppercase instead of naive per-word title-casing. */
const ACRONYMS = new Set(['vm', 'dag', 'ip']);

/** Humanize an event type string (e.g. "vm_halt" -> "VM Halt", "pipeline_start" -> "Pipeline Start"). */
function fmtType(type: string): string {
  return type
    .split('_')
    .map(word => (ACRONYMS.has(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}
</script>
