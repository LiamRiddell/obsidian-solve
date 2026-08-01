<!--
  TimingWaterfall.vue — a single shared timeline visualization: a ruler
  with time ticks plus one track of segments positioned by their actual
  start/end time, in the spirit of Chrome DevTools' Performance panel.

  Used by both the Pipeline tab's Async Preflight "Resolution Timeline"
  (one segment: the async wait) and the Perf tab's Pipeline Flamegraph
  (multiple contiguous segments: Lexer/Parser/Compiler/VM/Overhead) — two
  places that were each drawing their own bespoke timing bar before this,
  with no shared ruler/axis between them.
-->
<template>
  <div class="timing-waterfall">
    <div class="timing-waterfall-ruler">
      <span
        v-for="t in ticks"
        :key="t.pct"
        class="timing-waterfall-tick"
        :style="{ left: t.pct + '%' }"
        >{{ t.label }}</span
      >
    </div>
    <div class="timing-waterfall-track">
      <div
        v-for="seg in positionedSegments"
        :key="seg.key"
        class="timing-waterfall-segment"
        :class="[seg.status, { dimmed: seg.dimmed, highlighted: seg.highlighted, clickable: clickable }]"
        :style="{ left: seg.startPct + '%', width: seg.widthPct + '%', background: seg.color }"
        @click="clickable && emit('segment-click', seg.key)"
      >
        <span v-if="seg.showLabel" class="timing-waterfall-segment-label">{{ seg.label }}</span>
        <div class="timing-waterfall-tooltip">
          <div class="timing-waterfall-tooltip-title" :style="{ color: seg.color }">{{ seg.tooltipTitle ?? seg.label }}</div>
          <div v-for="(line, i) in seg.tooltipLines ?? []" :key="i" class="timing-waterfall-tooltip-line">{{ line }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { fmt } from '@bridge/utils';

export interface WaterfallSegment {
  /** Stable identifier — echoed back on `segment-click`. */
  key: string;
  /** Start time in nanoseconds, relative to the same origin as every other segment on this track. */
  startNs: number;
  /** End time in nanoseconds, or `null` for an ongoing/indeterminate segment (renders as a short animated stripe). */
  endNs: number | null;
  /** Label shown on the bar itself when it's wide enough, and as the tooltip title fallback. */
  label: string;
  /** CSS color for the segment fill. */
  color: string;
  status?: "done" | "pending" | "error";
  /** Overrides `label` as the tooltip's bold title line. */
  tooltipTitle?: string;
  /** Additional plain lines shown in the tooltip below the title. */
  tooltipLines?: string[];
  dimmed?: boolean;
  highlighted?: boolean;
}

const props = withDefaults(
  defineProps<{
    segments: WaterfallSegment[];
    /** Explicit ruler max, in ns. Defaults to the furthest segment end (or start, for ongoing segments), padded ~8%. */
    totalNs?: number;
    /** Number of ruler tick marks (excluding the leading 0). */
    tickCount?: number;
    /** Whether segments emit `segment-click` (used for the Perf tab's stage filter). */
    clickable?: boolean;
  }>(),
  { tickCount: 4, clickable: false },
);

const emit = defineEmits<{
  (e: "segment-click", key: string): void;
}>();

const trackMaxNs = computed(() => {
  if (props.totalNs && props.totalNs > 0) return props.totalNs;
  const ends = props.segments.map((s) => s.endNs ?? s.startNs);
  return Math.max(...ends, 1) * 1.08;
});

const ticks = computed(() =>
  Array.from({ length: props.tickCount + 1 }, (_, i) => {
    const pct = (i / props.tickCount) * 100;
    return { pct, label: fmt((pct / 100) * trackMaxNs.value) };
  }),
);

const positionedSegments = computed(() =>
  props.segments.map((seg) => {
    const ongoing = seg.endNs === null;
    const end = seg.endNs ?? trackMaxNs.value;
    const startPct = (seg.startNs / trackMaxNs.value) * 100;
    const widthPct = ongoing
      ? Math.max(100 - startPct, 4)
      : Math.max(((end - seg.startNs) / trackMaxNs.value) * 100, 1.5);
    return {
      ...seg,
      startPct,
      widthPct,
      showLabel: widthPct > 12,
    };
  }),
);
</script>
