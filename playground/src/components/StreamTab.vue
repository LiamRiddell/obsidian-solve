<template>
  <div class="tab-panel active" id="panel-stream">
    <div class="panel-toolbar">
      <span
        id="stream-event-count"
        class="stream-event-count"
        :class="{ 'stream-live': stream.streamingActive }"
      >
        {{ stream.events.length }} events<span v-if="stream.streamingActive"> · ⟳ live</span>
      </span>
      <span class="toggle-label" style="font-size:10px;color:var(--text-muted)">Diagnostic event stream</span>
    </div>
    <div class="panel-scroll" id="stream-display" ref="streamContainer">
      <span v-if="stream.events.length === 0" class="empty" style="padding:12px;display:block;text-align:center">No diagnostic events</span>

      <div
        v-for="(events, groupKey) in stream.groupedEvents"
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
          <span class="stream-group-toggle">{{ isCollapsed(groupKey) ? '▶' : '▼' }}</span>
          <span
            class="stream-group-key"
            :class="events.some(e => e.type.startsWith('async_')) ? 'stream-group-badge-async' : 'stream-group-badge-event'"
          >
            {{ events.some(e => e.type.startsWith('async_')) ? '⟳' : '#' }} {{ groupKey }}
          </span>
          <span class="stream-group-count">{{ events.length }} event{{ events.length !== 1 ? 's' : '' }}</span>
        </div>
        <div class="stream-group-content">
          <div v-for="(evt, i) in events" :key="i" class="stream-event">
            <span class="stream-event-time">{{ evt.elapsedNs > 0 ? (evt.elapsedNs / 1_000_000).toFixed(2) + 'ms' : '—' }}</span>
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

const stream = useStreamStore();
const streamContainer = ref<HTMLElement | null>(null);

// Groups with async events start expanded; others start collapsed (matching vanilla)
const collapsedGroups = ref(new Set<string>());

// Auto-scroll to bottom when events are added
watch(() => stream.events.length, () => {
  nextTick(() => {
    if (streamContainer.value) {
      streamContainer.value.scrollTop = streamContainer.value.scrollHeight;
    }
  });
});

function isCollapsed(key: string): boolean {
  // If not yet in the set, compute default: async groups expanded, others collapsed
  if (!collapsedGroups.value.has(key)) {
    const events = stream.groupedEvents.get(key);
    const collapsed = !events?.some(e =>
      e.type === 'async_pending' || e.type === 'async_resolved' || e.type === 'async_error',
    );
    if (collapsed) collapsedGroups.value.add(key);
    return collapsed;
  }
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

/** Capitalize each word in a type label (matching vanilla). */
function fmtType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
</script>
