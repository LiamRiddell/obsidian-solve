<template>
  <div class="tab-panel active" id="panel-flow">
    <!--#region Line Selector Bar ────────────────────────────────────────────-->
    <div class="pipeline-line-selector">
      <label class="pipeline-line-label">
        <span class="pipeline-line-icon">#</span>
        <span class="pipeline-line-text">Line</span>
      </label>
      <select class="pipeline-line-select" v-model="lineSelectVal">
        <option value="0">All Lines (aggregate)</option>
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
    </div>
    <!--#endregion-->

    <!--#region Pipeline Flow — Data-driven Stage Rendering ──────────────────-->
    <div class="pipeline-flow" v-if="displayStages.length > 0">
      <!-- Sticky Context Header -->
      <div v-if="hasResult" class="pipeline-context-header">
        <div class="pipeline-context-left">
          <span class="pipeline-context-label">Pipeline</span>
          <span class="pipeline-context-badge">{{ stageLabel }}</span>
        </div>
        <span class="pipeline-context-expr" :title="activeExpression">{{ activeExpression || '(empty expression)' }}</span>
      </div>

      <!-- Stage cards -->
      <template v-for="(stage, i) in displayStages" :key="stage.stage">
        <pipeline-stage
          :step-number="stage.stepNumber"
          :icon="stage.icon"
          :label="stage.label"
          :color-class="stage.colorClass"
          :time-label="getStageTime(stage)"
          :active-line="stageLabel"
          :input="getStageInput(stage)"
          :output-label="getStageOutputLabel(stage)"
          :show-arrow="!isResultStage(stage)"
          :is-result="isResultStage(stage)"
          :executed="hasResult"
          :has-error="isErrorStage(stage)"
          :skipped="stage.skipped"
          :model-value="stagesCollapsed[i] ?? false"
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

        <!-- Connector arrow between stages (hidden after the last stage) -->
        <div v-if="i < displayStages.length - 1" class="flow-stage-connector">
          <span class="connector-arrow">▼</span>
        </div>
      </template>
    </div>
    <!--#endregion-->

    <!--#region Pipeline Summary Stats ───────────────────────────────────────-->
    <div class="pipeline-detail">
      <div class="detail-row">
        <span class="detail-label">Tokens</span>
        <span class="detail-value">{{ tokenCount }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Opcodes</span>
        <span class="detail-value">{{ opcodeCount }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Cache</span>
        <span class="detail-value">{{ cacheStatus }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Async</span>
        <span class="detail-value">{{ asyncStatus }}</span>
      </div>
      <div v-if="displayStages.length > 0" class="detail-row">
        <span class="detail-label">Stages</span>
        <span class="detail-value"
          >{{ displayStages.length }} stage{{
            displayStages.length !== 1 ? "s" : ""
          }}</span
        >
      </div>
    </div>
    <!--#endregion-->

    <!--#region Constants Table ──────────────────────────────────────────────-->
    <div v-if="allConstants.length > 0" class="constants-table-section">
      <div
        class="constants-section-header"
        @click="constantsExpanded = !constantsExpanded"
        role="button"
        :aria-expanded="constantsExpanded"
      >
        <span class="constants-section-title">📦 Constants</span>
        <span class="constants-section-total">{{ filteredTotal }}</span>
        <span
          class="constants-section-chevron"
          :class="{ expanded: constantsExpanded }"
          >▸</span
        >
      </div>
      <div
        v-if="constantsExpanded"
        class="constants-filter-row"
        @click.stop
      >
        <input
          class="constants-filter-input"
          type="text"
          v-model="constantsFilter"
          placeholder="Filter by index or value…"
          spellcheck="false"
        />
      </div>
      <template v-if="constantsExpanded">
        <div
          v-for="group in filteredConstantGroups"
          :key="group.type"
          class="constant-group"
        >
          <div
            class="constant-group-header"
            @click="group.expanded = !group.expanded"
            role="button"
            :aria-expanded="group.expanded"
          >
            <span class="constant-group-dot" :class="'dot-' + group.type"></span>
            <span class="constant-group-label">{{ group.label }}</span>
            <span class="constant-group-count">{{
              group.matchCount ?? group.items.length
            }}</span>
            <span
              class="constant-group-chevron"
              :class="{ expanded: group.expanded }"
              >▸</span
            >
          </div>
          <table v-if="group.expanded" class="constant-table">
            <thead>
              <tr>
                <th class="constant-col-idx">#</th>
                <th class="constant-col-val">Value</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in group.filteredItems ?? group.items"
                :key="item.index"
                class="constant-row"
                :class="'row-' + group.type"
              >
                <td class="constant-col-idx">{{ item.index }}</td>
                <td class="constant-col-val">
                  <code
                    class="constant-value"
                    :class="'val-' + group.type"
                  >
                    <template
                      v-for="(seg, i) in valueSegments(group.type, item.value)"
                      :key="i"
                    >
                      <mark v-if="seg.highlight" class="constant-highlight">{{
                        seg.text
                      }}</mark>
                      <span v-else>{{ seg.text }}</span>
                    </template>
                  </code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
    <!--#endregion-->

    <!--#region Variables Section ────────────────────────────────────────────-->
    <div v-if="allVariables.length > 0" class="variables-section">
      <div
        class="variables-section-header"
        @click="variablesExpanded = !variablesExpanded"
        role="button"
        :aria-expanded="variablesExpanded"
      >
        <span class="variables-section-title">📋 Variables</span>
        <span class="variables-section-total"
          >{{ allVariables.length }} variable{{
            allVariables.length !== 1 ? "s" : ""
          }}</span
        >
        <span
          class="variables-section-chevron"
          :class="{ expanded: variablesExpanded }"
          >▸</span
        >
      </div>
      <div v-if="variablesExpanded" class="variables-chips">
        <span
          v-for="v in allVariables"
          :key="v"
          class="variable-chip"
          :title="'Variable: :' + v"
          >:{{ v }}</span
        >
      </div>
    </div>
    <!--#endregion-->
  </div>
</template>

<script setup lang="ts">
//#region ─── Imports ──────────────────────────────────────────────────────────

import { computed, onUnmounted, ref, watch, h } from "vue";
import { useDiagnosticReportStore } from "../stores/diagnosticReport.js";
import { usePipelineStore } from "../stores/pipeline.js";
import { useUiStore } from "../stores/ui.js";
import { fmt } from "../utils.js";
import PipelineStage from "./PipelineStage.vue";
import type { Token, ConstantInfo } from "../engine.js";
import type {
  PipelineStageResult,
} from "@/solve-js/src/types/DiagnosticPipelineResult";

//#endregion
//#region ─── Store Access ─────────────────────────────────────────────────────

const dr = useDiagnosticReportStore();
const pl = usePipelineStore();
const ui = useUiStore();

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
 * Populated by the engine store's onmessage handler via dr.setResult().
 */
const displayStages = computed<PipelineStageResult[]>(() =>
  dr.stages.filter(s => s.stage !== 'pipeline_start' && s.stage !== 'pipeline_end'),
);

/** Number of stages to display (or 8 as a minimum for the fallback). */
const numStages = computed(() => dr.stageCount);

//#endregion
//#region ─── Stage Collapse State ─────────────────────────────────────────────

/**
 * Per-stage collapse state.
 * `true` = collapsed (body hidden), `false` = expanded (body visible).
 * Initialized to all-collapsed and resized when the stage count changes.
 */
const stagesCollapsed = ref<boolean[]>(Array(numStages.value).fill(false));

watch(numStages, (n) => {
  if (stagesCollapsed.value.length !== n) {
    const old = stagesCollapsed.value;
    stagesCollapsed.value = Array.from({ length: n }, (_, i) => old[i] ?? false);
  }
});

/**
 * Persist the current expansion state to the pipeline store
 * so it survives line-switch re-renders.
 */
function saveCurrentExpansion(): void {
  const lineKey = pl.selectedLine ?? 0;
  pl.saveStageExpansion(lineKey, [...stagesCollapsed.value]);
}

/**
 * Handle a stage header click — toggle expand/collapse and persist.
 * @param index - The stage index in the displayStages array
 * @param value - New collapse state (true = collapsed)
 */
function onStageToggle(index: number, value: boolean): void {
  stagesCollapsed.value[index] = value;
  saveCurrentExpansion();
}

//#endregion
//#region ─── Collapse/Expand All (HeaderBar Buttons) ──────────────────────────

/** Watch the collapse-all trigger from the HeaderBar and collapse all stages. */
watch(
  () => pl.collapseAllTrigger,
  () => {
    stagesCollapsed.value = Array(numStages.value).fill(true);
    saveCurrentExpansion();
  },
);

/** Watch the expand-all trigger from the HeaderBar and expand all stages. */
watch(
  () => pl.expandAllTrigger,
  () => {
    stagesCollapsed.value = Array(numStages.value).fill(false);
    saveCurrentExpansion();
  },
);

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
  const lineKey = pl.selectedLine ?? 0;
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

watch(
  () => pl.selectedLine,
  () => {
    // Restore expansion state from store for this line
    const lineKey = pl.selectedLine ?? 0;
    const saved = pl.getStageExpansion(lineKey);
    if (saved && saved.length === numStages.value) {
      stagesCollapsed.value = [...saved];
    } else if (saved && saved.length !== numStages.value) {
      // Stage count changed since last save — resize while preserving saved state
      stagesCollapsed.value = Array.from(
        { length: numStages.value },
        (_, i) => saved[i] ?? false,
      );
    } else {
      // No saved state for this line — default to all collapsed
      stagesCollapsed.value = Array(numStages.value).fill(false);
    }
    detectAndPulseChanges();
  },
);

//#endregion
//#region ─── Line Selection ──────────────────────────────────────────────────

/** Currently selected line in the dropdown ("0" = All Lines). */
const lineSelectVal = ref("0");

watch(lineSelectVal, (val) => {
  const ln = val === "0" ? null : Number(val);
  if (ln === pl.selectedLine) return;
  pl.selectLine(ln, true);
});

watch(
  () => pl.selectedLine,
  (ln) => {
    if (!pl.dropdownManuallyChanged)
      lineSelectVal.value = ln === null ? "0" : String(ln);
  },
);

/** Display string for the active line badge. */
const activeLineStr = computed(() =>
  pl.selectedLine !== null
    ? "Line " + pl.selectedLine
    : "All Lines",
);

/** Compact label for the stage header (e.g., "L3" or "All"). */
const stageLabel = computed(() =>
  pl.selectedLine !== null
    ? "L" + pl.selectedLine
    : "All",
);

/** Expression text for the selected line (or the first line, or full expression). */
const activeExpression = computed(() => {
  const ln = pl.selectedLine;
  if (ln !== null) {
    const lr = dr.lineResults.find(r => r.lineNumber === ln);
    return lr?.expression ?? '';
  }
  const first = dr.lineResults[0];
  return first?.expression ?? dr.expression ?? '';
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
 * Format the stage's elapsed time for display.
 * @returns A human-readable time string (e.g., "1.2 µs") or "—" if untimed.
 */
function getStageTime(stage: PipelineStageResult): string {
  return stage.elapsedNs > 0 ? fmt(stage.elapsedNs) : "—";
}

/**
 * Map a stage to its human-readable input description.
 * @returns A short description of what the stage transforms (e.g., "Tokens → AST").
 */
function getStageInput(stage: PipelineStageResult): string {
  const inputs: Record<string, string> = {
    line_classification: "Expression → Classification",
    safety_length: "Expression → Limit Check",
    lexer: "Expression → Tokens",
    normalizer: "Tokens → Normalized Tokens",
    safety_complexity: "Tokens → Complexity Score",
    readwrite: "Tokens → Variable Tracking",
    cache_check: "Bytecode Lookup",
    parser: "Tokens → AST",
    compiler: "AST → Bytecode",
    async_preflight: "Resolver Registry",
    vm_execute: "Bytecode → Stack",
    dag_registration: "Reads/Writes → DAG",
    linecache: "Store Result",
    result: "",
  };
  return inputs[stage.stage] || stage.stage;
}

/**
 * Map a stage to its output category label.
 * @returns A short label for the output section (e.g., "Tokens", "Opcodes").
 */
function getStageOutputLabel(stage: PipelineStageResult): string {
  const labels: Record<string, string> = {
    line_classification: "Type",
    safety_length: "Status",
    lexer: "Tokens",
    normalizer: "Fusions",
    safety_complexity: "Status",
    readwrite: "Variables",
    cache_check: "Status",
    parser: "Parselets",
    compiler: "Opcodes",
    async_preflight: "Path",
    vm_execute: "Type",
    dag_registration: "Registered",
    linecache: "Line",
    result: "",
  };
  return labels[stage.stage] || "";
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
        h("div", { style: { fontSize: "9px", color: "#6b6b75", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" } }, "Rules Applied"),
        h("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
          rulesApplied.map((r: any) =>
            h("span", {
              style: {
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                background: "rgba(78,201,176,0.1)",
                border: "1px solid rgba(78,201,176,0.2)",
                borderRadius: "4px",
                padding: "3px 8px",
                fontSize: "10px",
              },
            }, [
              h("span", { style: { color: "#d4d4d8", fontFamily: "'JetBrains Mono', monospace" } }, r.rule),
              h("span", { style: { color: "#4ec9b0", fontWeight: "600" } }, "×" + r.count),
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
        h("div", { style: { fontSize: "9px", color: "#6b6b75", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" } }, "Token Fusions"),
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
                  h("span", { class: "normalize-fusion-result-token", style: { marginLeft: "6px", color: "#dcdcaa" } }, f.fusedToken.value),
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
        h("div", { style: { fontSize: "9px", color: "#6b6b75", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" } },
          `Normalized Tokens (${tokens.length} total${tokens.length > 24 ? `, showing first 24` : ""})`,
        ),
        h("div", { style: { display: "flex", flexWrap: "wrap", gap: "3px" } }, tokenChips),
      ]),
    );
  }

  return h("div", {}, children);
}

//#endregion
//#region ─── Stage Renderers ──────────────────────────────────────────────────

/**
 * Data-driven stage renderers.
 *
 * Each renderer is a function that receives a PipelineStageResult and returns
 * a VNode tree for the stage's compact output area. The renderer is selected
 * by `stage.stage` key, ensuring each pipeline stage type gets its own
 * specialized visualization.
 */
const stageRenderers: Record<
  string,
  (stage: PipelineStageResult) => ReturnType<typeof h>
> = {
  // ── Line Classification ──────────────────────────────────────
  line_classification(stage) {
    const o = stage.output as any;
    const classification = o.classification ?? "—";
    const skip = o.skip;
    const hasInlineSolve = o.hasInlineSolve;
    const inlineSolveSpans: any[] = o.inlineSolveSpans ?? [];

    // Compact classification chip
    const chips: any[] = [];

    // Classification type badge (color by common types)
    const typeColors: Record<string, string> = {
      expression: "#4ec9b0",
      prose: "#6b6b75",
      heading: "#9b7bec",
      list: "#5ac8fa",
      blockquote: "#6b6b75",
      code_fence: "#ffd866",
      math_fence: "#ffd866",
      table: "#5ac8fa",
      hr: "#6b6b75",
      wikilink: "#9b7bec",
      comment: "#6b6b75",
      empty: "#6b6b75",
    };
    const chipColor = typeColors[classification] ?? "#6b6b75";

    chips.push(
      h("span", {
        style: {
          fontSize: "10px",
          padding: "1px 6px",
          borderRadius: "3px",
          background: chipColor + "22",
          color: chipColor,
          border: "1px solid " + chipColor + "44",
          fontWeight: "500",
        },
        title: `Classified as: ${classification}`,
      }, classification),
    );

    // Skip badge if the line was classified as non-evaluable
    if (skip) {
      chips.push(
        h("span", {
          style: {
            fontSize: "9px",
            padding: "1px 6px",
            borderRadius: "3px",
            background: "rgba(244,135,113,0.15)",
            color: "#f48771",
            border: "1px solid rgba(244,135,113,0.3)",
          },
          title: "Line is not an expression — skipped",
        }, "Skipped"),
      );
    }

    // Per-span detail chips: s`expr` [start..end]
    if (inlineSolveSpans.length > 0) {
      for (const span of inlineSolveSpans) {
        const expr = span.expression ?? "?";
        const start = span.startTokenIndex ?? 0;
        const end = span.endTokenIndex ?? 0;
        chips.push(
          h("span", {
            style: {
              fontSize: "9px",
              padding: "1px 6px",
              borderRadius: "3px",
              background: "rgba(205,132,252,0.15)",
              color: "#c084fc",
              border: "1px solid rgba(205,132,252,0.3)",
            },
            title: `s\`${expr}\`\nTokens: [${start}..${end}]\nColumn: ${span.columnNumber ?? 1}`,
          }, `s\`${expr}\` [${start}..${end}]`),
        );
      }
    } else if (hasInlineSolve) {
      // Fallback: old-style badge (no span details available)
      chips.push(
        h("span", {
          style: {
            fontSize: "9px",
            padding: "1px 6px",
            borderRadius: "3px",
            background: "rgba(205,132,252,0.15)",
            color: "#c084fc",
            border: "1px solid rgba(205,132,252,0.3)",
          },
          title: "Contains s`` inline solve markers",
        }, "Inline Solve"),
      );
    }

    return h("div", { style: { display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" } }, chips);
  },

  // ── Safety Length ───────────────────────────────────────────
  safety_length(stage) {
    const o = stage.output as any;
    const color = o.passed ? "#4ec9b0" : "#f48771";
    const text = o.passed
      ? `Passed (${o.expressionLength} chars)`
      : o.errorMessage ?? "Failed";
    return h("span", { style: { color, fontSize: "10px" } }, text);
  },

  // ── Lexer ─────────────────────────────────────────────────
  lexer(stage) {
    const o = stage.output as any;
    const tokens = (o.tokens ?? []) as Token[];
    if (!tokens.length) return h("span", { class: "empty" }, "—");

    // Token classification breakdown: count by category
    const categories: Record<string, { count: number; types: string[] }> = {
      Literals: { count: 0, types: [] },
      Operators: { count: 0, types: [] },
      Keywords: { count: 0, types: [] },
      Identifiers: { count: 0, types: [] },
      Other: { count: 0, types: [] },
    };

    const literalTypes = ["NUMBER", "STRING", "BIGINT", "HEX", "BOOLEAN", "PERCENTAGE"];
    const operatorTypes = ["PLUS", "MINUS", "STAR", "SLASH", "CARET", "PERCENT", "STAR_STAR",
      "AMP", "PIPE", "CARET", "TILDE", "LT", "GT", "EQ_EQ", "BANG_EQ", "LT_EQ", "GT_EQ",
      "AMP_AMP", "PIPE_PIPE", "BANG", "ASSIGN"];
    const keywordTypes = ["KW_TRUE", "KW_FALSE", "KW_IF", "KW_ELSE", "KW_LET", "KW_CONST",
      "KW_FN", "KW_RETURN"];

    for (const t of tokens) {
      const type = String(t.type || "").toUpperCase();
      if (literalTypes.includes(type)) { categories.Literals.count++; categories.Literals.types.push(type); }
      else if (operatorTypes.includes(type)) { categories.Operators.count++; categories.Operators.types.push(type); }
      else if (keywordTypes.includes(type)) { categories.Keywords.count++; categories.Keywords.types.push(type); }
      else if (type === "IDENT") { categories.Identifiers.count++; categories.Identifiers.types.push(type); }
      else { categories.Other.count++; categories.Other.types.push(type); }
    }

    // Color scheme per category
    const catColors: Record<string, { bg: string; fg: string; border: string }> = {
      Literals:    { bg: "rgba(90,200,250,0.12)",  fg: "#5ac8fa", border: "rgba(90,200,250,0.25)" },
      Operators:   { bg: "rgba(255,216,102,0.12)", fg: "#ffd866", border: "rgba(255,216,102,0.25)" },
      Keywords:    { bg: "rgba(155,123,236,0.15)", fg: "#9b7bec", border: "rgba(155,123,236,0.3)" },
      Identifiers: { bg: "rgba(78,201,176,0.12)",  fg: "#4ec9b0", border: "rgba(78,201,176,0.25)" },
      Other:       { bg: "rgba(107,107,117,0.1)",  fg: "#6b6b75", border: "rgba(107,107,117,0.15)" },
    };

    const nonEmpty = Object.entries(categories).filter(([, v]) => v.count > 0);

    return h("div", { style: { display: "flex", flexDirection: "column", gap: "6px", width: "100%" } }, [
      // Token chips (first 8)
      h("span", { style: { display: "flex", flexWrap: "wrap", gap: "3px" } },
        tokens.slice(0, 8).map((t: Token) =>
          h("span", {
            class: `token token-${String(t.type || "unknown").toLowerCase()}`,
            style: { fontSize: "9px", cursor: "default" },
            title: `Type: ${t.type}\nValue: ${t.value}\nKeyword/Phrase resolution`,
          }, t.value),
        ),
      ),
      // Graphical chip layout: [LITERALS: 3] [OPERATORS: 2] …
      h("span", { style: { display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center" } },
        nonEmpty.map(([label, info]) => {
          const c = catColors[label] ?? catColors.Other;
          return h("span", {
            style: {
              display: "inline-flex", alignItems: "center", gap: "4px",
              background: c.bg, border: "1px solid " + c.border,
              borderRadius: "4px", padding: "2px 8px", fontSize: "10px",
            },
            title: `${label}: ${info.types.join(", ")}`,
          }, [
            h("span", { style: { color: "#6b6b75", fontWeight: "600", fontSize: "8px", textTransform: "uppercase", letterSpacing: "0.4px" } }, label.toUpperCase()),
            h("span", { style: { color: c.fg, fontWeight: "700", fontVariantNumeric: "tabular-nums" } }, String(info.count)),
          ]);
        }),
      ),
    ]);
  },

  // ── Normalizer ────────────────────────────────────────────
  normalizer(stage) {
    const o = stage.output as any;
    const fusions: any[] = o.fusions ?? [];

    if (stage.skipped)
      return h(
        "span",
        { style: { color: "#6b6b75", fontSize: "10px" } },
        "No rules active",
      );

    // Compact graphical chip layout: IN → FUSION → OUT
    const removed = o.inputTokenCount - o.outputTokenCount;
    return h("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        flexWrap: "wrap",
      },
    }, [
      // IN badge
      h("span", {
        style: {
          display: "inline-flex", alignItems: "center", gap: "4px",
          background: "rgba(90,200,250,0.12)", border: "1px solid rgba(90,200,250,0.25)",
          borderRadius: "4px", padding: "2px 8px", fontSize: "10px",
        },
      }, [
        h("span", { style: { color: "#6b6b75", fontWeight: "600", fontSize: "8px", textTransform: "uppercase", letterSpacing: "0.4px" } }, "IN"),
        h("span", { style: { color: "#5ac8fa", fontWeight: "700", fontVariantNumeric: "tabular-nums" } }, String(o.inputTokenCount)),
        h("span", { style: { color: "#6b6b75", fontSize: "8px" } }, o.inputTokenCount === 1 ? "TOKEN" : "TOKENS"),
      ]),
      // Arrow
      h("span", { style: { color: "#6b6b75", fontSize: "11px", margin: "0 2px" } }, "→"),
      // FUSION badge
      h("span", {
        style: {
          display: "inline-flex", alignItems: "center", gap: "4px",
          background: fusions.length > 0 ? "rgba(155,123,236,0.15)" : "rgba(107,107,117,0.1)",
          border: fusions.length > 0 ? "1px solid rgba(155,123,236,0.3)" : "1px solid rgba(107,107,117,0.15)",
          borderRadius: "4px", padding: "2px 8px", fontSize: "10px",
        },
      }, [
        h("span", { style: { color: "#6b6b75", fontWeight: "600", fontSize: "8px", textTransform: "uppercase", letterSpacing: "0.4px" } }, "FUSION"),
        h("span", { style: { color: fusions.length > 0 ? "#9b7bec" : "#6b6b75", fontWeight: "700", fontVariantNumeric: "tabular-nums" } }, String(fusions.length)),
        h("span", { style: { color: removed > 0 ? "#f48771" : "#6b6b75", fontSize: "8px" } }, removed > 0 ? `−${removed}` : "TOKENS"),
      ]),
      // Arrow
      h("span", { style: { color: "#6b6b75", fontSize: "11px", margin: "0 2px" } }, "→"),
      // OUT badge
      h("span", {
        style: {
          display: "inline-flex", alignItems: "center", gap: "4px",
          background: "rgba(78,201,176,0.12)", border: "1px solid rgba(78,201,176,0.25)",
          borderRadius: "4px", padding: "2px 8px", fontSize: "10px",
        },
      }, [
        h("span", { style: { color: "#6b6b75", fontWeight: "600", fontSize: "8px", textTransform: "uppercase", letterSpacing: "0.4px" } }, "OUT"),
        h("span", { style: { color: "#4ec9b0", fontWeight: "700", fontVariantNumeric: "tabular-nums" } }, String(o.outputTokenCount)),
        h("span", { style: { color: "#6b6b75", fontSize: "8px" } }, o.outputTokenCount === 1 ? "TOKEN" : "TOKENS"),
      ]),
    ]);
  },

  // ── Safety Complexity ─────────────────────────────────────
  safety_complexity(stage) {
    const o = stage.output as any;
    const color = o.passed ? "#4ec9b0" : "#f48771";
    const text = o.passed
      ? `Passed (score: ${o.complexityScore})`
      : o.errorMessage ?? "Failed";
    return h("span", { style: { color, fontSize: "10px" } }, text);
  },

  // ── Read/Write ────────────────────────────────────────────
  readwrite(stage) {
    const o = stage.output as any;
    const reads: string[] = o.reads ?? [];
    const writes: string[] = o.writes ?? [];
    if (!reads.length && !writes.length)
      return h(
        "span",
        { style: { color: "#6b6b75", fontSize: "10px" } },
        "None",
      );

    const chips: any[] = [];
    if (reads.length) {
      chips.push(
        h("span", {
          style: {
            display: "inline-flex", alignItems: "center", gap: "4px",
            background: "rgba(90,200,250,0.12)", border: "1px solid rgba(90,200,250,0.25)",
            borderRadius: "4px", padding: "2px 8px", fontSize: "10px",
          },
          title: `Reads: ${reads.join(", ")}`,
        }, [
          h("span", { style: { color: "#6b6b75", fontWeight: "600", fontSize: "8px", textTransform: "uppercase", letterSpacing: "0.4px" } }, "READS"),
          h("span", { style: { color: "#5ac8fa", fontWeight: "700", fontVariantNumeric: "tabular-nums" } }, String(reads.length)),
        ]),
      );
    }
    if (writes.length) {
      chips.push(
        h("span", {
          style: {
            display: "inline-flex", alignItems: "center", gap: "4px",
            background: "rgba(255,216,102,0.12)", border: "1px solid rgba(255,216,102,0.25)",
            borderRadius: "4px", padding: "2px 8px", fontSize: "10px",
          },
          title: `Writes: ${writes.join(", ")}`,
        }, [
          h("span", { style: { color: "#6b6b75", fontWeight: "600", fontSize: "8px", textTransform: "uppercase", letterSpacing: "0.4px" } }, "WRITES"),
          h("span", { style: { color: "#ffd866", fontWeight: "700", fontVariantNumeric: "tabular-nums" } }, String(writes.length)),
        ]),
      );
    }

    return h("span", { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" } }, chips);
  },

  // ── Cache Check ───────────────────────────────────────────
  cache_check(stage) {
    const o = stage.output as any;
    const hit = o.hit as boolean;
    const statusColor = hit ? "#4ec9b0" : "#5ac8fa";
    const statusBg = hit ? "rgba(78,201,176,0.12)" : "rgba(90,200,250,0.12)";
    const statusBorder = hit ? "rgba(78,201,176,0.25)" : "rgba(90,200,250,0.25)";
    const cached = dr.wasCached;
    const totalOps = dr.opcodes.length;

    return h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" } }, [
      // Status chip
      h("span", {
        style: {
          display: "inline-flex", alignItems: "center", gap: "4px",
          background: statusBg, border: "1px solid " + statusBorder,
          borderRadius: "4px", padding: "2px 8px", fontSize: "10px",
        },
      }, [
        h("span", { style: { color: "#6b6b75", fontWeight: "600", fontSize: "8px", textTransform: "uppercase", letterSpacing: "0.4px" } }, "STATUS"),
        h("span", { style: { color: statusColor, fontWeight: "700" } }, hit ? "HIT" : "MISS"),
      ]),
      // Detail line
      h("span", { style: { fontSize: "9px", color: "#6b6b75" } }, [
        hit
          ? `Cache size: ${o.cacheSize ?? "?"} entries`
          : `Key: ${(o.cacheKey ?? "").slice(0, 30)}`,
      ]),
      ...(cached ? [h("span", { style: { fontSize: "9px", color: "#4ec9b0" } },
        `${totalOps} opcodes served from cache`,
      )] : []),
    ]);
  },

  // ── Parser ────────────────────────────────────────────────
  parser(stage) {
    if (stage.skipped)
      return h(
        "span",
        { style: { color: "#6b6b75", fontSize: "10px" } },
        "Skipped (cache hit)",
      );
    const o = stage.output as any;
    if (o.uniqueParseletTypes?.length) {
      return h("span", { style: { display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" } },
        o.uniqueParseletTypes.map((p: string) =>
          h("span", {
            style: {
              display: "inline-flex", alignItems: "center", gap: "4px",
              background: "rgba(155,123,236,0.12)", border: "1px solid rgba(155,123,236,0.2)",
              borderRadius: "4px", padding: "2px 8px", fontSize: "10px",
              cursor: "pointer",
            },
            title: `Parselet: ${p}\nClick to inspect in Parselets tab`,
            onClick: () => ui.focusParselet(p),
          }, [
            h("span", { style: { color: "#6b6b75", fontWeight: "600", fontSize: "8px", textTransform: "uppercase", letterSpacing: "0.4px" } }, "PARSELET"),
            h("span", { style: { color: "#9b7bec", fontWeight: "700", fontFamily: "'JetBrains Mono', monospace" } }, p),
          ]),
        ),
      );
    }
    return h("span", { class: "empty" }, "—");
  },

  // ── Compiler ──────────────────────────────────────────────
  compiler(stage) {
    if (stage.skipped)
      return h(
        "span",
        { style: { color: "#6b6b75", fontSize: "10px" } },
        "Skipped (cache hit)",
      );
    const o = stage.output as any;
    const chips: any[] = [
      { label: "OPCODES", count: o.opcodeCount ?? 0, bg: "rgba(155,123,236,0.15)", fg: "#9b7bec", border: "rgba(155,123,236,0.3)" },
      { label: "NUMS",    count: o.numberConstants ?? 0, bg: "rgba(90,200,250,0.12)",  fg: "#5ac8fa", border: "rgba(90,200,250,0.25)" },
      { label: "STRS",    count: o.stringConstants ?? 0, bg: "rgba(78,201,176,0.12)",  fg: "#4ec9b0", border: "rgba(78,201,176,0.25)" },
    ];

    return h("span", { style: { display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" } },
      chips.map((c, i, arr) => {
        const nodes: any[] = [
          h("span", {
            style: {
              display: "inline-flex", alignItems: "center", gap: "4px",
              background: c.bg, border: "1px solid " + c.border,
              borderRadius: "4px", padding: "2px 8px", fontSize: "10px",
            },
            title: `${c.label}: ${c.count}`,
          }, [
            h("span", { style: { color: "#6b6b75", fontWeight: "600", fontSize: "8px", textTransform: "uppercase", letterSpacing: "0.4px" } }, c.label),
            h("span", { style: { color: c.fg, fontWeight: "700", fontVariantNumeric: "tabular-nums" } }, String(c.count)),
          ]),
        ];
        if (i < arr.length - 1) {
          nodes.push(h("span", { style: { color: "#6b6b75", fontSize: "11px", margin: "0 2px" } }, "→"));
        }
        return nodes;
      }).flat(),
    );
  },

  // ── Async Preflight ───────────────────────────────────────
  async_preflight(stage) {
    const o = stage.output as any;
    if (o.path === "pending")
      return h(
        "span",
        { style: { color: "#ffd866", fontSize: "10px" } },
        `Pending: ${o.pendingQueryKey ?? "?"}`,
      );
    if (stage.skipped)
      return h(
        "span",
        { style: { color: "#6b6b75", fontSize: "10px" } },
        "Skipped (no async)",
      );
    return h(
      "span",
      { style: { color: "#6b6b75", fontSize: "10px" } },
      "Sync path",
    );
  },

  // ── VM Execute ────────────────────────────────────────────
  vm_execute(stage) {
    const o = stage.output as any;
    return h(
      "span",
      { style: { color: "#29ce99", fontSize: "10px" } },
      o.resultType ?? "Value",
    );
  },

  // ── DAG Registration ──────────────────────────────────────
  dag_registration(stage) {
    const o = stage.output as any;
    const parts: string[] = [];
    if (o.readsRegistered?.length)
      parts.push(`${o.readsRegistered.length} reads`);
    if (o.writesRegistered?.length)
      parts.push(`${o.writesRegistered.length} writes`);
    if (!parts.length)
      return h(
        "span",
        { style: { color: "#6b6b75", fontSize: "10px" } },
        "None",
      );
    return h(
      "span",
      { style: { color: "#6b6b75", fontSize: "10px" } },
      parts.join(", "),
    );
  },

  // ── LineCache ─────────────────────────────────────────────
  linecache(stage) {
    const o = stage.output as any;
    return h(
      "span",
      { style: { color: "#6b6b75", fontSize: "10px" } },
      o.stored ? `Line ${o.lineNumber} cached` : "Not stored",
    );
  },

  // ── Result ────────────────────────────────────────────────
  result(stage) {
    const o = stage.output as any;
    if (o.error)
      return h("span", { style: { color: "#f48771" } }, o.error);

    const raw = String(o.rawValue ?? "—");
    const formatted = o.formattedValue ?? raw;
    const allValues: Array<{value: string, formatted: string, unit?: string}> | undefined = o.allValues;

    // ── Multi-target: render value chips for each currency/unit ──
    if (allValues && allValues.length > 1) {
      return h("div", { style: { display: "flex", flexDirection: "column", gap: "6px", alignItems: "center" } }, [
        // Multi-value chip row
        h("div", { style: { display: "flex", flexWrap: "wrap", gap: "5px", justifyContent: "center" } },
          allValues.map((v) =>
            h("span", {
              style: {
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                background: "rgba(41,206,153,0.12)",
                border: "1px solid rgba(41,206,153,0.25)",
                borderRadius: "6px",
                padding: "3px 10px",
              },
              title: `Raw: ${v.value}`,
            }, [
              h("span", {
                style: { color: "#29ce99", fontSize: "13px", fontWeight: "700", fontVariantNumeric: "tabular-nums" },
              }, v.formatted),
              v.unit ? h("span", {
                style: { color: "#6b6b75", fontSize: "9px", fontWeight: "500" },
              }, v.unit) : null,
            ]),
          ),
        ),
        // Raw + formatted detail row
        raw !== formatted ? h("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginTop: "2px" } }, [
          h("span", { style: { fontSize: "9px", color: "#6b6b75", textTransform: "uppercase", letterSpacing: "0.5px" } }, "Raw:"),
          h("span", { style: { color: "#dcdcaa", fontSize: "10px", fontFamily: "'JetBrains Mono', monospace" } }, raw),
        ]) : null,
      ]);
    }

    // ── Single value: existing rendering ──
    if (raw === formatted) {
      return h("span", { style: { color: "#29ce99", fontSize: "14px", fontWeight: "700" } }, formatted);
    }

    // Show raw value + formatted string side by side
    return h("div", { style: { display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" } }, [
      h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, [
        h("span", { style: { fontSize: "9px", color: "#6b6b75", textTransform: "uppercase", letterSpacing: "0.5px" } }, "Raw:"),
        h("span", { style: { color: "#dcdcaa", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace" } }, raw),
      ]),
      h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, [
        h("span", { style: { fontSize: "9px", color: "#6b6b75", textTransform: "uppercase", letterSpacing: "0.5px" } }, "Formatted:"),
        h("span", { style: { color: "#29ce99", fontSize: "14px", fontWeight: "700" } }, formatted),
      ]),
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
//#region ─── Constants Table ──────────────────────────────────────────────────

/**
 * A group of constants of the same type (number, string, bigint, hex)
 * with expand/collapse state and optional filter results.
 */
interface ConstantGroup {
  readonly type: ConstantInfo["type"];
  readonly label: string;
  readonly items: readonly ConstantInfo[];
  expanded: boolean;
  filteredItems?: readonly ConstantInfo[];
  matchCount?: number;
}

/** All constants from the compiled bytecode program. */
const allConstants = computed<ConstantInfo[]>(() => dr.constants);

/** Whether the constants section is expanded. */
const constantsExpanded = ref(true);

/** Filter input for the constants table (filter by index or value). */
const constantsFilter = ref("");

/** Total count string for the constants header. */
const filteredTotal = computed(() => {
  const f = constantsFilter.value.trim();
  if (!f) return allConstants.value.length + " total";
  const matchCount = filteredConstantGroups.value.reduce(
    (sum, g) => sum + (g.matchCount ?? 0),
    0,
  );
  return matchCount + " / " + allConstants.value.length + " total";
});

/** All variables extracted from the token stream. */
const allVariables = computed<string[]>(() => dr.variables);

/** Whether the variables section is expanded. */
const variablesExpanded = ref(true);

/**
 * Split a constant value into segments, highlighting matches of the filter query.
 * @param type  - The constant type (determines display format)
 * @param value - The raw constant value
 * @returns Array of text segments with highlight flags
 */
function valueSegments(
  type: ConstantInfo["type"],
  value: string | number,
): Array<{ text: string; highlight: boolean }> {
  let display: string;
  switch (type) {
    case "string":
      display = '"' + String(value) + '"';
      break;
    case "hex":
      display = "0x" + String(value);
      break;
    case "bigint":
      display = String(value) + "n";
      break;
    default:
      display = String(value);
  }

  const query = constantsFilter.value.trim().toLowerCase();
  if (!query) return [{ text: display, highlight: false }];

  const lower = display.toLowerCase();
  const segments: Array<{ text: string; highlight: boolean }> = [];
  let last = 0,
    idx = lower.indexOf(query);

  while (idx !== -1) {
    if (idx > last)
      segments.push({ text: display.slice(last, idx), highlight: false });
    segments.push({
      text: display.slice(idx, idx + query.length),
      highlight: true,
    });
    last = idx + query.length;
    idx = lower.indexOf(query, last);
  }

  if (last < display.length)
    segments.push({ text: display.slice(last), highlight: false });
  return segments.length > 0 ? segments : [{ text: display, highlight: false }];
}

/** Constants grouped by type (number, string, bigint, hex) in display order. */
const constantGroups = computed<ConstantGroup[]>(() => {
  const typeOrder: ConstantInfo["type"][] = [
    "number",
    "string",
    "bigint",
    "hex",
  ];
  const typeLabel: Record<ConstantInfo["type"], string> = {
    number: "Numbers",
    string: "Strings",
    bigint: "BigInts",
    hex: "Hex Values",
  };

  const groups = new Map<ConstantInfo["type"], ConstantInfo[]>();
  for (const c of allConstants.value) {
    if (!groups.has(c.type)) groups.set(c.type, []);
    groups.get(c.type)!.push(c);
  }

  return typeOrder
    .filter((t) => groups.has(t))
    .map((t) => ({
      type: t,
      label: typeLabel[t],
      items: groups.get(t)!,
      expanded: false,
    }));
});

/** Constants groups filtered by the current filter query. */
const filteredConstantGroups = computed<ConstantGroup[]>(() => {
  const query = constantsFilter.value.trim().toLowerCase();
  if (!query) return constantGroups.value;

  return constantGroups.value
    .map((g) => {
      const matches = g.items.filter(
        (item) =>
          String(item.index) === query ||
          String(item.value).toLowerCase().includes(query),
      );
      return {
        ...g,
        filteredItems: matches,
        matchCount: matches.length,
        expanded: matches.length > 0 || g.expanded,
      };
    })
    .filter((g) => (g.matchCount ?? 0) > 0);
});

//#endregion
</script>
