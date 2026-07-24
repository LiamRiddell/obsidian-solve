<template>
  <div class="tab-panel active" id="panel-flow">
    <!--#region Line Selector Bar ────────────────────────────────────────────-->
    <div class="pipeline-line-selector">
      <label class="pipeline-line-label">
        <span class="pipeline-line-icon">#</span>
        <span class="pipeline-line-text">Line</span>
      </label>
      <select class="pipeline-line-select" v-model="lineSelectVal">
        <option
          v-for="lr in lineResults"
          :key="lr.lineNumber"
          :value="String(lr.lineNumber ?? 1)"
        >
          Line {{ lr.lineNumber ?? 1 }}: {{ lr.expression.slice(0, 30)
          }}{{ lr.expression.length > 30 ? "…" : "" }}
        </option>
      </select>
      <span class="pipeline-active-line-badge">{{ activeLineStr }}</span>
      <button class="copy-all-btn" @click="toggleAllStages">
        <span class="msi msi-dense">{{ allCollapsed ? 'expand_more' : 'expand_less' }}</span> {{ allCollapsed ? 'Expand all' : 'Collapse all' }}
      </button>
    </div>
    <!--#endregion-->

    <!-- Everything below scrolls as one region — stage cards, summary
         stats, and constants/variables previously lived partly outside
         the actual scrollable area (the stage list had its own internal
         scroll with flex:1, leaving no room in the outer flex column for
         the sections after it — on any but a very tall viewport they were
         genuinely unreachable, not just visually awkward). -->
    <div class="panel-scroll diag-stack">
      <!--#region Pipeline Summary Stats — moved to the top, matching the
           Perf tab: this is the fastest-scanned, highest-value summary,
           so it shouldn't require scrolling past the stage list to reach.
           Replaces the old sticky context header, which just restated the
           line badge/expression already visible in the selector bar above. -->
      <div v-if="hasResult" class="perf-grid">
        <div class="stat-card">
          <div class="stat-card-header">
            <span class="stat-card-label">Tokens</span>
            <span class="stat-card-icon" style="background:var(--stage-lexer)"></span>
          </div>
          <div class="stat-card-value" style="color:var(--stage-lexer)">{{ tokenCount }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-header">
            <span class="stat-card-label">Opcodes</span>
            <span class="stat-card-icon" style="background:var(--stage-compiler)"></span>
          </div>
          <div class="stat-card-value" style="color:var(--stage-compiler)">{{ opcodeCount }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-header">
            <span class="stat-card-label">Cache</span>
            <span class="stat-card-icon" style="background:var(--stage-cache)"></span>
          </div>
          <div class="stat-card-value" style="color:var(--stage-cache)">{{ cacheStatus }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-header">
            <span class="stat-card-label">Async</span>
            <span class="stat-card-icon" style="background:var(--stage-async)"></span>
          </div>
          <div class="stat-card-value" style="color:var(--stage-async)">{{ asyncStatus }}</div>
        </div>
        <div v-if="displayStages.length > 0" class="stat-card">
          <div class="stat-card-header">
            <span class="stat-card-label">Stages</span>
            <span class="stat-card-icon" style="background:var(--stage-result)"></span>
          </div>
          <div class="stat-card-value" style="color:var(--stage-result)">{{ displayStages.length }}</div>
        </div>
      </div>
      <!--#endregion-->

      <!--#region Pipeline Flow — Data-driven Stage Rendering ──────────────────-->
      <div class="pipeline-flow" v-if="displayStages.length > 0">
        <template v-for="(stage, i) in displayStages" :key="stage.stage">
          <pipeline-stage
            :step-number="i + 1"
            :icon="stage.icon"
            :label="stage.label"
            :color-class="stage.colorClass"
            :time-label="getStageTime(stage)"
            :active-line="stageLabel"
            :preview="getStagePreview(stage)"
            :is-result="isResultStage(stage)"
            :is-gate="isGateStage(stage.stage)"
            :executed="hasResult"
            :has-error="isErrorStage(stage)"
            :skipped="stage.skipped"
            :model-value="stagesCollapsed[i] ?? true"
            :pulsing="pulsingStages.includes(i)"
            @update:model-value="(v: boolean) => onStageToggle(i, v)"
          >
            <!-- Compact output: rendered by the stage renderer for this stage type -->
            <template #output>
              <component
                v-if="stageRenderers[stage.stage]"
                :is="() => stageRenderers[stage.stage](stage)"
              />
              <span v-else class="empty">—</span>
            </template>

            <!--
              Expandable detail: shown only for the normalizer stage when
              fusions are present. Renders the full fusion table with rule
              names, source tokens, arrows, and resulting fused tokens.
            -->
            <template
              v-if="stage.stage === 'normalizer' && hasNormalizerDetail(stage)"
              #detail
            >
              <component :is="() => normalizerDetailRenderer(stage)" />
            </template>
          </pipeline-stage>

          <!-- Connector: makes the vertical flow between stages explicit
               instead of relying on a bare gap between cards. -->
          <div v-if="i < displayStages.length - 1" class="flow-connector" aria-hidden="true">
            <span class="msi msi-dense">arrow_downward</span>
          </div>
        </template>
      </div>
      <!--#endregion-->

      <!--#region Constants & Variables ────────────────────────────────────────-->
      <constants-explorer :constants="allConstants" />
      <variables-chips :variables="allVariables" />
      <!--#endregion-->
    </div>
  </div>
</template>

<script setup lang="ts">
//#region ─── Imports ──────────────────────────────────────────────────────────

import { computed, onUnmounted, ref, watch, h } from "vue";
import { useDiagnosticReportStore } from "../stores/diagnosticReport.js";
import { usePipelineStore } from "../stores/pipeline.js";
import { useUiStore } from "../stores/ui.js";
import { useStreamStore } from "../stores/stream.js";
import { fmt } from "../utils.js";
import PipelineStage from "./PipelineStage.vue";
import ConstantsExplorer from "./shared/ConstantsExplorer.vue";
import VariablesChips from "./shared/VariablesChips.vue";
import TimingWaterfall from "./shared/TimingWaterfall.vue";
import type { Token } from "../engine.js";
import type {
  PipelineStageResult,
} from "@/solve-js/src/types/DiagnosticPipelineResult";

//#endregion
//#region ─── Store Access ─────────────────────────────────────────────────────

const dr = useDiagnosticReportStore();
const pl = usePipelineStore();
const ui = useUiStore();
const stream = useStreamStore();

/** The latest evaluation result from the diagnostic report store. */
const result = computed(() => dr.result);

/** Whether a result has been produced (enables "executed" styling on stages). */
const hasResult = computed(() => !!result.value);

/** Per-line results from the pipeline store (populated by engine store). */
const lineResults = computed(() => dr.lineResults);

//#endregion
//#region ─── Structured Pipeline Stages ───────────────────────────────────────

/**
 * Structured pipeline stages from the diagnostic report store.
 * Shows THAT line's real stages (dr.stagesByLine) rather than dr.stages,
 * which only ever holds whichever line happened to be evaluated last —
 * without this, every line in the dropdown displayed identical (wrong)
 * stage data.
 */
const displayStages = computed<PipelineStageResult[]>(() => {
  const ln = effectiveLine.value;
  const raw = ln !== null ? (dr.stagesByLine[ln] ?? dr.stages) : dr.stages;
  return raw.filter(s => s.stage !== 'pipeline_start' && s.stage !== 'pipeline_end');
});

/** Number of stages to display (or 8 as a minimum for the fallback). */
const numStages = computed(() => dr.stageCount);

//#endregion
//#region ─── Stage Collapse State ─────────────────────────────────────────────

/**
 * Per-stage collapse state.
 * `true` = collapsed (body hidden), `false` = expanded (body visible).
 * Initialized to all-collapsed (so the ~14-stage pipeline is scannable at
 * a glance via each card's header preview) and resized when the stage
 * count changes.
 */
const stagesCollapsed = ref<boolean[]>(Array(numStages.value).fill(true));

watch(numStages, (n) => {
  if (stagesCollapsed.value.length !== n) {
    const old = stagesCollapsed.value;
    stagesCollapsed.value = Array.from({ length: n }, (_, i) => old[i] ?? true);
  }
});

/**
 * Handle a stage header click — toggle expand/collapse.
 *
 * Deliberately NOT saved per-line: which stage TYPES you want expanded is
 * a viewing preference, not data tied to a specific line. Switching lines
 * (including automatically, e.g. the editor's cursor-follow firing on
 * every click) used to blow this away and re-collapse everything whenever
 * the newly-selected line had no expansion history of its own — expanding
 * a stage now stays expanded across every line switch instead.
 * @param index - The stage index in the displayStages array
 * @param value - New collapse state (true = collapsed)
 */
function onStageToggle(index: number, value: boolean): void {
  stagesCollapsed.value[index] = value;
}

//#endregion
//#region ─── Collapse/Expand All (tab toolbar button) ──────────────────────────

/** Whether every stage is currently collapsed — drives the toggle button's label. */
const allCollapsed = computed(() => stagesCollapsed.value.every(c => c));

/** Collapse all stages, or expand all if they're already all collapsed. */
function toggleAllStages(): void {
  stagesCollapsed.value = Array(numStages.value).fill(!allCollapsed.value);
}

//#endregion
//#region ─── Flash-Pulse Animation ────────────────────────────────────────────

/**
 * Stage indices that are currently pulsing.
 * Set when the selected line changes and stage output data differs
 * from the previous line's snapshot.
 */
const pulsingStages = ref<number[]>([]);

/** Timer handle for clearing the pulse animation after 650ms. */
let pulseTimer: ReturnType<typeof setTimeout> | null = null;

/** Serialized stage outputs for change detection (JSON compare). */
const stageOutputs = computed<string[]>(() =>
  displayStages.value.map((s) => JSON.stringify(s.output)),
);

onUnmounted(() => {
  if (pulseTimer) clearTimeout(pulseTimer);
});

/**
 * Compare current stage outputs with the previous line's snapshot.
 * Stages with changed data get a brief pulse animation.
 */
function detectAndPulseChanges(): void {
  const lineKey = effectiveLine.value ?? 0;
  const oldSnapshot = pl.getStageSnapshot(lineKey);
  const newSnapshot = stageOutputs.value;

  if (oldSnapshot && oldSnapshot.length === numStages.value) {
    const changed: number[] = [];
    for (let i = 0; i < numStages.value; i++) {
      if (oldSnapshot[i] !== newSnapshot[i]) changed.push(i);
    }
    if (changed.length > 0) {
      pulsingStages.value = changed;
      if (pulseTimer) clearTimeout(pulseTimer);
      pulseTimer = setTimeout(() => {
        pulsingStages.value = [];
        pulseTimer = null;
      }, 650);
    }
  }

  pl.saveStageSnapshot(lineKey, [...newSnapshot]);
}

//#endregion
//#region ─── Line Selection ──────────────────────────────────────────────────

/**
 * The line currently being inspected. Falls back to the first evaluated
 * line when nothing has been explicitly selected yet — there's no more
 * "All Lines" aggregate state to fall back to instead (removed: it only
 * ever showed whichever line happened to run last in the engine, which
 * read as arbitrary/wrong for every OTHER line — a genuine full-document
 * summary now lives in the Summary tab instead).
 */
const effectiveLine = computed<number | null>(() => pl.selectedLine ?? lineResults.value[0]?.lineNumber ?? null);

// Stage expand/collapse state is intentionally untouched here — see
// onStageToggle's comment. Switching lines only drives the pulse
// highlight for stages whose data actually changed.
watch(effectiveLine, detectAndPulseChanges);

/** Currently selected line in the dropdown. */
const lineSelectVal = ref("");

watch(lineSelectVal, (val) => {
  if (!val) return;
  const ln = Number(val);
  if (ln === pl.selectedLine) return;
  pl.selectLine(ln, true);
});

watch(
  effectiveLine,
  (ln) => {
    if (!pl.dropdownManuallyChanged)
      lineSelectVal.value = ln !== null ? String(ln) : "";
  },
  { immediate: true },
);

/** Display string for the active line badge. */
const activeLineStr = computed(() =>
  effectiveLine.value !== null ? "Line " + effectiveLine.value : "—",
);

/** Compact label for the stage header (e.g., "L3"). */
const stageLabel = computed(() =>
  effectiveLine.value !== null ? "L" + effectiveLine.value : "—",
);

/** Expression text for the selected line. */
const activeExpression = computed(() => {
  const ln = effectiveLine.value;
  const lr = dr.lineResults.find(r => r.lineNumber === ln);
  return lr?.expression ?? '';
});

//#endregion
//#endregion
//#region ─── Stage Helper Functions ───────────────────────────────────────────

/** @returns `true` if this stage is the final result stage. */
function isResultStage(stage: PipelineStageResult): boolean {
  return stage.stage === "result";
}

/**
 * @returns `true` if this stage represents a failed safety check.
 * Safety stages show an error border and red tint when they fail.
 */
function isErrorStage(stage: PipelineStageResult): boolean {
  if (stage.stage === "safety_length" || stage.stage === "safety_complexity") {
    const o = stage.output as any;
    return o.passed === false;
  }
  return false;
}

/**
 * Stage names that act as a gate — a check or branch point that can pass,
 * fail, or redirect the pipeline (skip later stages, short-circuit into a
 * pending/cached path) — rather than a straight-line processing step. Used
 * to badge these stages distinctly so the flow reads like an actual
 * flowchart instead of one undifferentiated list of 13 equal steps.
 *
 * - safety_length / safety_complexity: can fail and halt the pipeline.
 * - cache_check: branches — a hit skips the parser/compiler stages.
 * - async_preflight: branches — pending halts before VM execution.
 */
const GATE_STAGES = new Set(["safety_length", "safety_complexity", "cache_check", "async_preflight"]);

/** @returns `true` if this stage is a gate (can fail or branch the pipeline) rather than a straight-line processing step. */
function isGateStage(stage: string): boolean {
  return GATE_STAGES.has(stage);
}

/**
 * Format the stage's elapsed time for display.
 * @returns A human-readable time string (e.g., "1.2 µs") or "—" if untimed.
 */
function getStageTime(stage: PipelineStageResult): string {
  return stage.elapsedNs > 0 ? fmt(stage.elapsedNs) : "—";
}

/**
 * A short, plain-text one-line summary of a stage's output — shown
 * inline in the (collapsed-by-default) header row, so scanning all ~14
 * stages at a glance is actually useful without expanding each one.
 */
function getStagePreview(stage: PipelineStageResult): string {
  const o = stage.output as any;
  if (stage.skipped) return "skipped";
  switch (stage.stage) {
    case "line_classification":
      return o.classification ?? "—";
    case "safety_length":
      return o.passed ? `OK (${o.expressionLength} chars)` : (o.errorMessage ?? "failed");
    case "lexer":
      return `${(o.tokens ?? []).length} tokens`;
    case "normalizer": {
      const removed = (o.inputTokenCount ?? 0) - (o.outputTokenCount ?? 0);
      return `${o.inputTokenCount ?? 0} → ${o.outputTokenCount ?? 0} tokens` + (removed > 0 ? `, ${o.fusions?.length ?? 0} fusions` : "");
    }
    case "safety_complexity":
      return o.passed ? `OK (score ${o.complexityScore})` : (o.errorMessage ?? "failed");
    case "readwrite": {
      const reads = o.reads?.length ?? 0, writes = o.writes?.length ?? 0;
      if (!reads && !writes) return "none";
      return [reads ? `${reads} read${reads !== 1 ? "s" : ""}` : null, writes ? `${writes} write${writes !== 1 ? "s" : ""}` : null].filter(Boolean).join(", ");
    }
    case "cache_check":
      return o.hit ? "hit" : "miss";
    case "parser":
      return o.uniqueParseletTypes?.length ? o.uniqueParseletTypes.join(", ") : (typeof o.astDepth === "number" ? `depth ${o.astDepth}` : "—");
    case "compiler":
      return `${o.opcodeCount ?? 0} opcodes`;
    case "async_preflight":
      return o.path === "pending" ? `pending: ${o.pendingQueryKey ?? "?"}` : (o.path ?? "sync");
    case "vm_execute": {
      const parts: string[] = [];
      if (typeof o.totalInstructions === "number") parts.push(`${o.totalInstructions} instr`);
      return (o.resultType ?? "value") + (parts.length ? ` (${parts.join(", ")})` : "");
    }
    case "dag_registration": {
      const reads = o.readsRegistered?.length ?? 0, writes = o.writesRegistered?.length ?? 0;
      return reads || writes ? `${reads} reads, ${writes} writes` : "none";
    }
    case "linecache":
      return o.stored ? `line ${o.lineNumber} cached` : "not stored";
    case "result":
      return o.error ?? String(o.formattedValue ?? o.rawValue ?? "—");
    default:
      return "";
  }
}

//#endregion
//#region ─── Shared Helpers ──────────────────────────────────────────────────

/**
 * Map a token type to a CSS class for token chip display in the normalizer detail.
 *
 * @param t - A token-like object with a `type` string property
 * @returns A CSS class name: `"val-number"`, `"val-ident"`, `"val-operator"`, `"val-keyword"`, or `"val-default"`
 */
function tokClass(t: { type?: string }): string {
  const type = String(t.type || "").toLowerCase();
  if (["number", "hex", "bigint"].includes(type)) return "val-number";
  if (type === "ident") return "val-ident";
  if (["star", "plus", "minus", "slash", "caret", "equals"].includes(type))
    return "val-operator";
  if (type === "keyword" || type.includes("_by")) return "val-keyword";
  return "val-default";
}

//#endregion
//#region ─── Normalizer Detail Rendering ──────────────────────────────────────

/**
 * Whether the normalizer stage has fusion detail worth showing in the
 * expandable detail slot.
 *
 * @returns `true` if the normalizer stage has at least one fusion event
 */
function hasNormalizerDetail(stage: PipelineStageResult): boolean {
  if (stage.stage !== "normalizer") return false;
  const o = stage.output as any;
  return (o.outputTokenCount ?? 0) > 0 || (o.fusions?.length ?? 0) > 0 || (o.rulesApplied?.length ?? 0) > 0;
}

/**
 * Renders the full fusion detail table for the normalizer's `#detail` slot.
 *
 * The table shows, for each fusion:
 * - **Rule**: Which normalizer rule triggered the fusion
 * - **Source Tokens**: The original tokens before fusion (color-coded chips)
 * - **→**: An arrow indicating the transformation
 * - **Fused Token**: The resulting token type and value
 *
 * A stats row at the top shows token count change and per-rule application counts.
 *
 * @param stage - The normalizer pipeline stage with fusion data
 * @returns A VNode tree rendered as the detail slot content
 */
function normalizerDetailRenderer(stage: PipelineStageResult) {
  const o = stage.output as any;
  const fusions: any[] = o.fusions ?? [];
  const rulesApplied: any[] = o.rulesApplied ?? [];
  const tokens: any[] = o.tokens ?? [];
  const children: any[] = [];

  // ── Stats row: token count change + per-rule application counts ──
  children.push(
    h("div", { class: "normalize-stats" }, [
      h("span", { class: "normalize-stat" }, [
        h("span", { class: "normalize-stat-label" }, "Tokens:"),
        h("span", { class: "normalize-stat-value" }, `${o.inputTokenCount} → ${o.outputTokenCount}`),
      ]),
      h("span", { class: "normalize-stat" }, [
        h("span", { class: "normalize-stat-label" }, "Fusions:"),
        h("span", { class: "normalize-stat-value" }, String(fusions.length)),
      ]),
      ...rulesApplied.map((r: any) =>
        h("span", { class: "normalize-stat" }, [
          h("span", { class: "normalize-stat-label" }, r.rule + ":"),
          h("span", { class: "normalize-stat-value" }, String(r.count)),
        ]),
      ),
    ]),
  );

  // ── Rules Applied: colored chip grid ──
  if (rulesApplied.length > 0) {
    children.push(
      h("div", { style: { marginTop: "10px" } }, [
        h("div", { style: { fontSize: "9px", color: "#6a6a6a", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" } }, "Rules Applied"),
        h("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
          rulesApplied.map((r: any) =>
            h("span", {
              style: {
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                background: "rgba(144, 224, 239,0.1)",
                border: "1px solid rgba(144, 224, 239,0.2)",
                borderRadius: "4px",
                padding: "3px 8px",
                fontSize: "10px",
              },
            }, [
              h("span", { style: { color: "#d4d4d8", fontFamily: "'JetBrains Mono', monospace" } }, r.rule),
              h("span", { style: { color: "#90e0ef", fontWeight: "600" } }, "×" + r.count),
            ]),
          ),
        ),
      ]),
    );
  }

  // ── Fusion table: rule → source tokens → fused token ──
  if (fusions.length > 0) {
    children.push(
      h("div", { style: { marginTop: "10px" } }, [
        h("div", { style: { fontSize: "9px", color: "#6a6a6a", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" } }, "Token Fusions"),
        h("table", { class: "normalize-fusion-table" }, [
          h("thead", {}, h("tr", {}, [
            h("th", {}, "Rule"),
            h("th", {}, "Source Tokens"),
            h("th", {}, ""),
            h("th", {}, "Fused Token"),
          ])),
          h("tbody", {},
            fusions.map((f: any) =>
              h("tr", {}, [
                h("td", {}, h("span", { class: "normalize-fusion-rule" }, f.rule)),
                h("td", {},
                  h("span", { class: "normalize-fusion-source-tokens" },
                    (f.sourceTokens ?? []).map((st: any) =>
                      h("span", { class: `normalize-fusion-token ${tokClass(st)}` }, st.value),
                    ),
                  ),
                ),
                h("td", {}, h("span", { class: "normalize-fusion-arrow" }, "→")),
                h("td", {}, [
                  h("span", { class: "normalize-fusion-result-type" }, f.fusedToken.type),
                  h("span", { class: "normalize-fusion-result-token", style: { marginLeft: "6px", color: "#ffa07a" } }, f.fusedToken.value),
                ]),
              ]),
            ),
          ),
        ]),
      ]),
    );
  }

  // ── Normalized token stream (post-normalization output) ──
  if (tokens.length > 0) {
    const tokenChips = tokens.slice(0, 24).map((t: any) =>
      h("span", {
        class: `normalize-fusion-token ${tokClass({ type: t.type })}`,
        style: { fontSize: "9px" },
        title: `Type: ${t.type}\nValue: ${t.value}`,
      }, t.value),
    );
    children.push(
      h("div", { style: { marginTop: "10px" } }, [
        h("div", { style: { fontSize: "9px", color: "#6a6a6a", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" } },
          `Normalized Tokens (${tokens.length} total${tokens.length > 24 ? `, showing first 24` : ""})`,
        ),
        h("div", { style: { display: "flex", flexWrap: "wrap", gap: "3px" } }, tokenChips),
      ]),
    );
  }

  return h("div", {}, children);
}

//#endregion
//#region ─── Stage Body Building Blocks ───────────────────────────────────────

/**
 * Small `h()` helpers shared by every stage renderer below, so each stage's
 * body is composed from the same handful of primitives (a labeled stat
 * grid, a titled chip group, an empty-state note) instead of one-off
 * inline-styled markup per stage. See `.stage-stat-grid` etc. in main.css.
 */

/** A grid of small label/value stat cells (e.g. "Tokens: 9", "Depth: 2"). */
function statGrid(rows: Array<{ label: string; value: string; color?: string }>) {
  return h("div", { class: "stage-stat-grid" },
    rows.map(r =>
      h("div", { class: "stage-stat-row" }, [
        h("span", { class: "stage-stat-label" }, r.label),
        h("span", { class: "stage-stat-value", style: r.color ? { color: r.color } : undefined }, r.value),
      ]),
    ),
  );
}

/** A titled group of chips (e.g. "Reads" → [":width", ":height"]). */
function chipGroup(label: string, items: string[], color: string, onClickItem?: (item: string) => void) {
  if (items.length === 0) return null;
  return h("div", {}, [
    h("div", { class: "stage-chip-group-label" }, `${label} (${items.length})`),
    h("div", { class: "stage-chip-row" },
      items.map(item =>
        h("span", {
          style: {
            display: "inline-flex", alignItems: "center",
            background: color + "22", border: `1px solid ${color}44`,
            borderRadius: "4px", padding: "2px 7px", fontSize: "10px",
            fontFamily: "var(--font-mono)", color,
            cursor: onClickItem ? "pointer" : "default",
          },
          onClick: onClickItem ? () => onClickItem(item) : undefined,
        }, item),
      ),
    ),
  ]);
}

/** Muted italic note for an empty/inactive stage body. */
function emptyNote(text: string) {
  return h("div", { class: "stage-empty-note" }, text);
}

/** A thin progress bar, e.g. for "score used of limit". */
function progressBar(pct: number, color: string) {
  return h("div", { class: "stage-progress-bar" }, [
    h("div", { class: "stage-progress-fill", style: { width: `${Math.min(100, pct)}%`, background: color } }),
  ]);
}

//#endregion
//#region ─── Async Preflight Timeline ─────────────────────────────────────────

interface AsyncTimeline {
  /** elapsedNs when the batcher first reported this query as pending, relative to pipeline/stream start. */
  pendingNs: number | null;
  /** elapsedNs when the value resolved successfully, or null if not resolved (yet, or it errored/is still in flight). */
  resolvedNs: number | null;
  /** elapsedNs when the resolver reported an error, or null. */
  errorNs: number | null;
  status: "resolved" | "error" | "waiting" | "unknown";
}

/**
 * Correlates an Async Preflight stage with the Stream tab's timeline
 * events for the same async wait, so the Pipeline tab can show how long
 * the wait actually took — not just "pending" as a static label.
 *
 * The batcher's pending/resolved events are keyed by line expression
 * text; its error events are keyed by the raw resolver query key
 * instead (an existing asymmetry in how engine.ts emits these events) —
 * matching on both covers all three outcomes.
 */
function getAsyncTimeline(stage: PipelineStageResult): AsyncTimeline {
  const o = stage.output as any;
  const queryKey: string | undefined = o.pendingQueryKey;
  const expr = activeExpression.value;
  const events = stream.events;

  const matches = (e: (typeof events)[number]) =>
    e.groupKey === expr || (!!queryKey && e.groupKey === queryKey);

  const pendingEvt = events.find((e) => e.type === "async_pending" && matches(e));
  const resolvedEvt = events.find(
    (e) => e.type === "async_resolved" && matches(e) && (!pendingEvt || e.elapsedNs >= pendingEvt.elapsedNs),
  );
  const errorEvt = events.find((e) => e.type === "async_error" && matches(e));

  let status: AsyncTimeline["status"] = "unknown";
  if (errorEvt) status = "error";
  else if (resolvedEvt) status = "resolved";
  else if (pendingEvt) status = "waiting";

  return {
    pendingNs: pendingEvt?.elapsedNs ?? null,
    resolvedNs: resolvedEvt?.elapsedNs ?? null,
    errorNs: errorEvt?.elapsedNs ?? null,
    status,
  };
}

/**
 * Renders the async wait as one segment on the shared TimingWaterfall —
 * positioned along the same time axis the async events themselves use
 * (elapsed time since the pipeline started), so the segment's offset
 * from the left edge shows how much sync work ran before the wait
 * began, and its width shows how long the wait itself lasted. The same
 * component renders the Perf tab's Pipeline Flamegraph, so both give
 * the same DevTools-style ruler+segment reading of pipeline timing.
 */
function renderAsyncGantt(timeline: AsyncTimeline) {
  if (timeline.pendingNs === null) {
    return emptyNote("No timeline data captured for this wait yet — check the Stream tab.");
  }

  const endNs = timeline.resolvedNs ?? timeline.errorNs;
  const stillWaiting = endNs === null;
  const durationNs = endNs !== null ? endNs - timeline.pendingNs : null;
  const isError = timeline.status === "error";
  const status: "done" | "error" | "pending" = isError ? "error" : stillWaiting ? "pending" : "done";

  return h(TimingWaterfall, {
    segments: [
      {
        key: "wait",
        startNs: timeline.pendingNs,
        endNs,
        label: stillWaiting ? "Waiting…" : isError ? "Failed" : "Resolved",
        color: isError ? "var(--error)" : stillWaiting ? "var(--accent)" : "var(--stage-async)",
        status,
        tooltipTitle: "Async Wait",
        tooltipLines: [
          `Started at ${fmt(timeline.pendingNs)}`,
          durationNs !== null
            ? `${isError ? "Failed" : "Resolved"} after ${fmt(durationNs)}`
            : "Still waiting…",
        ],
      },
    ],
  });
}

//#endregion
//#region ─── Stage Renderers ──────────────────────────────────────────────────

/**
 * Data-driven stage renderers.
 *
 * Each renderer is a function that receives a PipelineStageResult and
 * returns a VNode tree — a purpose-built breakdown of what that specific
 * stage actually does, built from the `statGrid`/`chipGroup`/etc.
 * primitives above. The renderer is selected by `stage.stage` key.
 */
const stageRenderers: Record<
  string,
  (stage: PipelineStageResult) => ReturnType<typeof h>
> = {
  // ── Line Classification ──────────────────────────────────────
  line_classification(stage) {
    const o = stage.output as any;
    const classification = o.classification ?? "—";
    const inlineSolveSpans: any[] = o.inlineSolveSpans ?? [];
    const children: any[] = [
      statGrid([
        { label: "Line Type", value: classification, color: "#90e0ef" },
        { label: "Evaluated", value: o.skip ? "No — skipped" : "Yes", color: o.skip ? "#ff6b6b" : "#b5e48c" },
        { label: "Inline Solves", value: o.hasInlineSolve ? String(inlineSolveSpans.length || 1) : "0" },
      ]),
    ];
    if (inlineSolveSpans.length > 0) {
      children.push(h("div", {}, [
        h("div", { class: "stage-chip-group-label" }, `Inline Solve Spans (${inlineSolveSpans.length})`),
        h("div", { class: "stage-chip-row" },
          inlineSolveSpans.map((span: any) =>
            h("span", {
              style: {
                display: "inline-flex", alignItems: "center",
                background: "rgba(205,132,252,0.15)", border: "1px solid rgba(205,132,252,0.3)",
                borderRadius: "4px", padding: "2px 7px", fontSize: "10px",
                fontFamily: "var(--font-mono)", color: "#c084fc",
              },
              title: `Tokens [${span.startTokenIndex}..${span.endTokenIndex}] · column ${span.columnNumber ?? 1}`,
            }, `s\`${span.expression ?? "?"}\``),
          ),
        ),
      ]));
    }
    return h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } }, children);
  },

  // ── Safety Length ───────────────────────────────────────────
  safety_length(stage) {
    const o = stage.output as any;
    const pct = o.maxLength > 0 ? (o.expressionLength / o.maxLength) * 100 : 0;
    const color = o.passed ? "#90e0ef" : "#ff6b6b";
    return h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, [
      statGrid([
        { label: "Status", value: o.passed ? "Passed" : (o.errorMessage ?? "Failed"), color },
        { label: "Length", value: `${o.expressionLength} chars` },
        { label: "Limit", value: `${o.maxLength} chars` },
      ]),
      progressBar(pct, color),
    ]);
  },

  // ── Lexer ─────────────────────────────────────────────────
  lexer(stage) {
    const o = stage.output as any;
    const tokens = (o.tokens ?? []) as Token[];
    const tokenTypes: Record<string, number> = o.tokenTypes ?? {};
    if (!tokens.length) return emptyNote("No tokens produced.");

    const typeEntries = Object.entries(tokenTypes).sort((a, b) => b[1] - a[1]);
    const showCount = 20;

    return h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } }, [
      statGrid([
        { label: "Tokens", value: String(o.tokenCount ?? tokens.length) },
        { label: "Parens", value: o.hasParens ? "Yes" : "No" },
        { label: "Locale", value: o.locale ?? "—" },
        { label: "Distinct Types", value: String(typeEntries.length) },
      ]),
      typeEntries.length > 0 ? h("div", {}, [
        h("div", { class: "stage-chip-group-label" }, "Token Type Breakdown"),
        h("div", { class: "stage-chip-row" },
          typeEntries.map(([type, count]) =>
            h("span", {
              style: {
                display: "inline-flex", alignItems: "center", gap: "4px",
                background: "rgba(123, 223, 242,0.1)", border: "1px solid rgba(123, 223, 242,0.2)",
                borderRadius: "4px", padding: "2px 7px", fontSize: "10px",
              },
            }, [
              h("span", { style: { fontFamily: "var(--font-mono)", color: "#d4d4d8" } }, type),
              h("span", { style: { color: "#7bdff2", fontWeight: "700" } }, "×" + count),
            ]),
          ),
        ),
      ]) : null,
      h("div", {}, [
        h("div", { class: "stage-chip-group-label" }, `Raw Tokens (${tokens.length}${tokens.length > showCount ? `, first ${showCount}` : ""})`),
        h("div", { class: "stage-chip-row" }, [
          ...tokens.slice(0, showCount).map((t: Token) =>
            h("span", {
              class: `token token-${String(t.type || "unknown").toLowerCase()}`,
              style: { fontSize: "9px", cursor: "default" },
              title: `Type: ${t.type}\nValue: ${t.value}`,
            }, t.value),
          ),
          tokens.length > showCount ? h("span", { class: "stage-empty-note" }, `+${tokens.length - showCount} more`) : null,
        ]),
      ]),
    ]);
  },

  // ── Normalizer ────────────────────────────────────────────
  normalizer(stage) {
    const o = stage.output as any;
    const fusions: any[] = o.fusions ?? [];
    if (stage.skipped) return emptyNote("No normalization rules matched — tokens passed through unchanged.");
    const removed = o.inputTokenCount - o.outputTokenCount;
    return statGrid([
      { label: "Input Tokens", value: String(o.inputTokenCount), color: "#7bdff2" },
      { label: "Output Tokens", value: String(o.outputTokenCount), color: "#90e0ef" },
      { label: "Removed", value: String(removed), color: removed > 0 ? "#ff6b6b" : undefined },
      { label: "Fusions", value: String(fusions.length), color: fusions.length > 0 ? "#c7a9ff" : undefined },
    ]);
  },

  // ── Safety Complexity ─────────────────────────────────────
  safety_complexity(stage) {
    const o = stage.output as any;
    const b = o.breakdown ?? { tokenCount: 0, functionCalls: 0, nestingDepth: 0 };
    const pct = o.maxComplexity > 0 ? (o.complexityScore / o.maxComplexity) * 100 : 0;
    const color = o.passed ? "#90e0ef" : "#ff6b6b";
    return h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, [
      statGrid([
        { label: "Status", value: o.passed ? "Passed" : (o.errorMessage ?? "Failed"), color },
        { label: "Score", value: `${o.complexityScore} / ${o.maxComplexity}` },
      ]),
      progressBar(pct, color),
      h("div", { class: "stage-chip-group-label", style: { marginTop: "2px" } }, "Score Breakdown"),
      statGrid([
        { label: "Tokens (×1)", value: String(b.tokenCount) },
        { label: "Function Calls (×5)", value: String(b.functionCalls) },
        { label: "Max Nesting (×10)", value: String(b.nestingDepth) },
      ]),
    ]);
  },

  // ── Read/Write ────────────────────────────────────────────
  readwrite(stage) {
    const o = stage.output as any;
    const reads: string[] = o.reads ?? [];
    const writes: string[] = o.writes ?? [];
    if (!reads.length && !writes.length) return emptyNote("This line neither reads nor writes any variable.");
    return h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, [
      o.isAssignment ? h("span", {
        style: { alignSelf: "flex-start", fontSize: "9px", fontWeight: 700, color: "#faff69", background: "rgba(250,255,105,0.12)", border: "1px solid rgba(250,255,105,0.25)", borderRadius: "3px", padding: "1px 6px", textTransform: "uppercase", letterSpacing: "0.4px" },
      }, "Assignment") : null,
      chipGroup("Reads", reads, "#7bdff2"),
      chipGroup("Writes", writes, "#faff69"),
    ]);
  },

  // ── Cache Check ───────────────────────────────────────────
  cache_check(stage) {
    const o = stage.output as any;
    const hit = o.hit as boolean;
    const color = hit ? "#90e0ef" : "#7bdff2";
    return h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, [
      statGrid([
        { label: "Status", value: hit ? "Hit" : "Miss", color },
        { label: "Cache Size", value: `${o.cacheSize ?? "?"} entries` },
      ]),
      h("div", {}, [
        h("div", { class: "stage-chip-group-label" }, "Cache Key"),
        h("code", { style: { display: "block", fontSize: "10px", color: "var(--text-secondary)", wordBreak: "break-all" } }, o.cacheKey ?? "—"),
      ]),
    ]);
  },

  // ── Parser ────────────────────────────────────────────────
  parser(stage) {
    if (stage.skipped) return emptyNote("Skipped — bytecode served from cache, no parsing needed.");
    const o = stage.output as any;
    const parselets: Array<{ type: string; category: string; prefix: boolean }> = o.parselets ?? [];

    // Group full parselet matches by type to get real match counts —
    // uniqueParseletTypes alone (previously the only thing shown) loses
    // how many TIMES each parselet fired.
    const counts = new Map<string, { count: number; category: string; prefix: boolean }>();
    for (const p of parselets) {
      const cur = counts.get(p.type);
      if (cur) cur.count++;
      else counts.set(p.type, { count: 1, category: p.category, prefix: p.prefix });
    }

    return h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } }, [
      statGrid([
        { label: "AST Depth", value: String(o.astDepth ?? 0) },
        { label: "Parselet Matches", value: String(parselets.length) },
        { label: "Distinct Parselets", value: String(counts.size) },
      ]),
      counts.size > 0 ? h("div", {}, [
        h("div", { class: "stage-chip-group-label" }, "Parselets Matched"),
        h("div", { class: "stage-chip-row" },
          Array.from(counts.entries()).map(([type, info]) =>
            h("span", {
              style: {
                display: "inline-flex", alignItems: "center", gap: "4px",
                background: "rgba(199, 169, 255,0.12)", border: "1px solid rgba(199, 169, 255,0.2)",
                borderRadius: "4px", padding: "2px 7px", fontSize: "10px", cursor: "pointer",
              },
              title: `${info.prefix ? "Prefix" : "Infix"} parselet · category: ${info.category}\nClick to inspect in Parselets tab`,
              onClick: () => ui.focusParselet(type),
            }, [
              h("span", { style: { fontFamily: "var(--font-mono)", color: "#c7a9ff", fontWeight: "700" } }, type),
              info.count > 1 ? h("span", { style: { color: "#6a6a6a" } }, "×" + info.count) : null,
            ]),
          ),
        ),
      ]) : emptyNote("No parselets matched."),
    ]);
  },

  // ── Compiler ──────────────────────────────────────────────
  compiler(stage) {
    if (stage.skipped) return emptyNote("Skipped — bytecode served from cache, no compilation needed.");
    const o = stage.output as any;
    return h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, [
      statGrid([
        { label: "Opcodes", value: String(o.opcodeCount ?? 0), color: "#c7a9ff" },
        { label: "Number Constants", value: String(o.numberConstants ?? 0), color: "#7bdff2" },
        { label: "String Constants", value: String(o.stringConstants ?? 0), color: "#90e0ef" },
      ]),
      h("div", { class: "stage-chip-row" }, [
        h("span", {
          style: { fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", padding: "2px 7px", borderRadius: "3px", background: o.hasAsync ? "rgba(255,155,84,0.15)" : "rgba(107,107,117,0.1)", color: o.hasAsync ? "var(--stage-async)" : "var(--text-muted)" },
        }, o.hasAsync ? "Has Async Opcodes" : "No Async Opcodes"),
        h("span", {
          style: { fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", padding: "2px 7px", borderRadius: "3px", background: o.cached ? "rgba(144,224,239,0.15)" : "rgba(107,107,117,0.1)", color: o.cached ? "var(--stage-compiler)" : "var(--text-muted)" },
        }, o.cached ? "Served From Cache" : "Freshly Compiled"),
      ]),
    ]);
  },

  // ── Async Preflight ───────────────────────────────────────
  async_preflight(stage) {
    const o = stage.output as any;
    const color = o.path === "pending" ? "#faff69" : "#90e0ef";

    // Once a wait resolves, this line's stage snapshot gets replaced by a
    // fresh evaluation where path is back to "sync" — the "it was pending"
    // fact disappears from the CURRENT stage output entirely. Look up the
    // Stream tab's timeline regardless of the current path, so a line that
    // waited on real async data still shows how long that took even after
    // it settles (resolution is often ~75ms, faster than a human can catch
    // the stage mid-"pending" — gating on the live path alone meant this
    // section effectively never appeared in normal use).
    const timeline = getAsyncTimeline(stage);
    const hasTimeline = timeline.pendingNs !== null;

    // Always return the same div-wrapped shape (never a bare child
    // shortcut) — this renderer is invoked through an anonymous
    // functional `:is="() => stageRenderers[...](stage)"` binding, and
    // returning structurally different vnode shapes across renders of
    // the same slot (e.g. a bare statGrid div sometimes, a wrapping div
    // other times) crashed Vue's patcher ("Cannot read properties of
    // null (reading 'subTree')") once a nested real component
    // (TimingWaterfall, via renderAsyncGantt) started conditionally
    // appearing as this stage's Stream-tab history filled in after the
    // wait actually resolved. Toggle the optional rows' PRESENCE inside
    // a stable root instead.
    return h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } }, [
      statGrid([
        { label: "Path", value: o.path === "pending" ? "Pending" : "Sync", color },
        { label: "Resolvers Registered", value: String(o.resolverCount ?? 0) },
        { label: "Preflight Guard", value: o.skippedGuard ? "Skipped" : "Checked" },
      ]),
      o.path === "pending"
        ? h("div", {}, [
            h("div", { class: "stage-chip-group-label" }, "Pending Query Key"),
            h("code", { style: { display: "block", fontSize: "10px", color: "#faff69", wordBreak: "break-all" } }, o.pendingQueryKey ?? "—"),
          ])
        : null,
      hasTimeline
        ? h("div", {}, [
            h("div", { class: "stage-chip-group-label" }, "Resolution Timeline"),
            renderAsyncGantt(timeline),
          ])
        : null,
    ]);
  },

  // ── VM Execute ────────────────────────────────────────────
  vm_execute(stage) {
    const o = stage.output as any;
    return statGrid([
      { label: "Result Type", value: o.resultType ?? "Value", color: "#faff69" },
      { label: "Instructions", value: String(o.totalInstructions ?? 0) },
      { label: "Max Stack Depth", value: String(o.stackDepth ?? 0) },
      { label: "Pending", value: o.isPending ? "Yes" : "No" },
    ]);
  },

  // ── DAG Registration ──────────────────────────────────────
  dag_registration(stage) {
    const o = stage.output as any;
    const reads: string[] = o.readsRegistered ?? [];
    const writes: string[] = o.writesRegistered ?? [];
    const dataSources: string[] = o.dataSourcesRegistered ?? [];
    if (!reads.length && !writes.length && !dataSources.length) return emptyNote("Nothing registered in the dependency graph for this line.");
    return h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, [
      chipGroup("Reads", reads, "#7bdff2"),
      chipGroup("Writes", writes, "#faff69"),
      chipGroup("Data Sources", dataSources, "#ff9b54"),
    ]);
  },

  // ── LineCache ─────────────────────────────────────────────
  linecache(stage) {
    const o = stage.output as any;
    return statGrid([
      { label: "Line", value: String(o.lineNumber ?? "—") },
      { label: "Status", value: o.stored ? "Cached" : "Not Stored", color: o.stored ? "#90e0ef" : "#ff6b6b" },
    ]);
  },

  // ── Result ────────────────────────────────────────────────
  result(stage) {
    const o = stage.output as any;
    if (o.error)
      return h("span", { style: { color: "#ff6b6b" } }, o.error);

    const raw = String(o.rawValue ?? "—");
    const formatted = o.formattedValue ?? raw;
    const typeBadge = h("div", { class: "stage-chip-row", style: { justifyContent: "center" } }, [
      h("span", { style: { fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", background: "var(--bg-tertiary)", borderRadius: "3px", padding: "1px 6px" } }, o.valueType ?? "Value"),
      o.unit ? h("span", { style: { fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", background: "var(--bg-tertiary)", borderRadius: "3px", padding: "1px 6px" } }, o.unit) : null,
    ]);

    // ── Single value ──
    if (raw === formatted) {
      return h("div", { style: { display: "flex", flexDirection: "column", gap: "6px", alignItems: "center" } }, [
        h("span", { style: { color: "#faff69", fontSize: "14px", fontWeight: "700" } }, formatted),
        typeBadge,
      ]);
    }

    // Show raw value + formatted string side by side
    return h("div", { style: { display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" } }, [
      h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, [
        h("span", { style: { fontSize: "9px", color: "#6a6a6a", textTransform: "uppercase", letterSpacing: "0.5px" } }, "Raw:"),
        h("span", { style: { color: "#ffa07a", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace" } }, raw),
      ]),
      h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, [
        h("span", { style: { fontSize: "9px", color: "#6a6a6a", textTransform: "uppercase", letterSpacing: "0.5px" } }, "Formatted:"),
        h("span", { style: { color: "#faff69", fontSize: "14px", fontWeight: "700" } }, formatted),
      ]),
      typeBadge,
    ]);
  },
};

//#endregion
//#region ─── Detail Stats (Pipeline Summary Bar) ──────────────────────────────

/** Total raw token count (pre-normalization). */
const tokenCount = computed(() => String(dr.tokenCount));

/** Total opcode count in the compiled program. */
const opcodeCount = computed(() => String(dr.opcodeCount));

/** Cache status: "hit", "miss", or "—". */
const cacheStatus = computed(() => dr.cacheStatus);

/** Async status: "yes" or "no". */
const asyncStatus = computed(() => dr.asyncStatus);

//#endregion
//#region ─── Constants & Variables ────────────────────────────────────────────

/** All constants from the compiled bytecode program — passed to ConstantsExplorer. */
const allConstants = computed(() => dr.constants);

/** All variables extracted from the token stream — passed to VariablesChips. */
const allVariables = computed<string[]>(() => dr.variables);

//#endregion
</script>
