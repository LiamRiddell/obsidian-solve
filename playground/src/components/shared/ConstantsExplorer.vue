<!--
  ConstantsExplorer.vue — the constants-by-type (Numbers/Strings/BigInts/
  Hex) filterable, collapsible-group table. Extracted from two previously
  separate, near-identical implementations in PipelineTab (had the filter
  input) and BytecodeTab's sidebar (didn't) — this unifies on the fuller
  version so both tabs stay in sync.
-->
<template>
  <div v-if="constants.length > 0" class="diag-section">
    <div class="diag-section-header" @click="expanded = !expanded" role="button" :aria-expanded="expanded">
      <span class="diag-section-title"><span class="msi msi-dense">inventory_2</span> Constants</span>
      <span class="diag-section-tag">{{ filteredTotal }}</span>
      <span class="msi msi-dense diag-section-chevron" :class="{ expanded }">chevron_right</span>
    </div>
    <div v-if="expanded" class="diag-section-body" style="display: flex; flex-direction: column; gap: 10px;">
      <input
        class="constants-filter-input"
        type="text"
        v-model="filter"
        placeholder="Filter by index or value…"
        spellcheck="false"
        @click.stop
      />
      <div v-for="group in filteredGroups" :key="group.type" class="constant-group">
        <div class="constant-group-header" @click="toggleGroup(group.type)" role="button" :aria-expanded="isGroupOpen(group)">
          <span class="constant-group-dot" :class="'dot-' + group.type"></span>
          <span class="constant-group-label">{{ group.label }}</span>
          <span class="constant-group-count">{{ group.matchCount ?? group.items.length }}</span>
          <span class="msi msi-dense constant-group-chevron" :class="{ expanded: isGroupOpen(group) }">chevron_right</span>
        </div>
        <table v-if="isGroupOpen(group)" class="constant-table">
          <thead>
            <tr>
              <th class="constant-col-idx">#</th>
              <th class="constant-col-val">Value</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in group.filteredItems ?? group.items" :key="item.index" class="constant-row" :class="'row-' + group.type">
              <td class="constant-col-idx">{{ item.index }}</td>
              <td class="constant-col-val">
                <code class="constant-value" :class="'val-' + group.type">
                  <template v-for="(seg, i) in valueSegments(group.type, item.value)" :key="i">
                    <mark v-if="seg.highlight" class="constant-highlight">{{ seg.text }}</mark>
                    <span v-else>{{ seg.text }}</span>
                  </template>
                </code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { ConstantInfo } from '@bridge/engine';

const props = defineProps<{
  constants: ConstantInfo[];
}>();

const expanded = ref(true);
const filter = ref('');

/**
 * Per-group open/closed state, keyed by constant type.
 *
 * This used to live as an `expanded` field on the plain objects returned
 * by the `groups`/`filteredGroups` computeds — but a computed's return
 * value is a fresh plain object on every recompute, and mutating a
 * property on a plain (non-reactive) object doesn't notify Vue of
 * anything, so clicking a group header silently did nothing. Tracking it
 * in its own ref fixes that: the click handler mutates a real reactive
 * source, and templates re-render off it correctly.
 */
const groupExpandedState = ref<Record<string, boolean>>({});

function toggleGroup(type: string): void {
  groupExpandedState.value[type] = !groupExpandedState.value[type];
}

/** Whether a group's table should render: manually toggled open, or auto-opened by an active filter match. */
function isGroupOpen(group: ConstantGroup): boolean {
  if (groupExpandedState.value[group.type]) return true;
  return filter.value.trim().length > 0 && (group.matchCount ?? 0) > 0;
}

interface ConstantGroup {
  readonly type: ConstantInfo['type'];
  readonly label: string;
  readonly items: readonly ConstantInfo[];
  filteredItems?: readonly ConstantInfo[];
  matchCount?: number;
}

const filteredTotal = computed(() => {
  const f = filter.value.trim();
  if (!f) return props.constants.length + ' total';
  const matchCount = filteredGroups.value.reduce((sum, g) => sum + (g.matchCount ?? 0), 0);
  return matchCount + ' / ' + props.constants.length + ' total';
});

function valueSegments(type: ConstantInfo['type'], value: string | number): Array<{ text: string; highlight: boolean }> {
  let display: string;
  switch (type) {
    case 'string': display = '"' + String(value) + '"'; break;
    case 'hex': display = '0x' + String(value); break;
    case 'bigint': display = String(value) + 'n'; break;
    default: display = String(value);
  }

  const query = filter.value.trim().toLowerCase();
  if (!query) return [{ text: display, highlight: false }];

  const lower = display.toLowerCase();
  const segments: Array<{ text: string; highlight: boolean }> = [];
  let last = 0, idx = lower.indexOf(query);
  while (idx !== -1) {
    if (idx > last) segments.push({ text: display.slice(last, idx), highlight: false });
    segments.push({ text: display.slice(idx, idx + query.length), highlight: true });
    last = idx + query.length;
    idx = lower.indexOf(query, last);
  }
  if (last < display.length) segments.push({ text: display.slice(last), highlight: false });
  return segments.length > 0 ? segments : [{ text: display, highlight: false }];
}

const groups = computed<ConstantGroup[]>(() => {
  const typeOrder: ConstantInfo['type'][] = ['number', 'string', 'bigint', 'hex'];
  const typeLabel: Record<ConstantInfo['type'], string> = {
    number: 'Numbers', string: 'Strings', bigint: 'BigInts', hex: 'Hex Values',
  };
  const byType = new Map<ConstantInfo['type'], ConstantInfo[]>();
  for (const c of props.constants) {
    if (!byType.has(c.type)) byType.set(c.type, []);
    byType.get(c.type)!.push(c);
  }
  return typeOrder
    .filter((t) => byType.has(t))
    .map((t) => ({ type: t, label: typeLabel[t], items: byType.get(t)! }));
});

const filteredGroups = computed<ConstantGroup[]>(() => {
  const query = filter.value.trim().toLowerCase();
  if (!query) return groups.value;
  return groups.value
    .map((g) => {
      const matches = g.items.filter(
        (item) => String(item.index) === query || String(item.value).toLowerCase().includes(query),
      );
      return { ...g, filteredItems: matches, matchCount: matches.length };
    })
    .filter((g) => (g.matchCount ?? 0) > 0);
});
</script>
