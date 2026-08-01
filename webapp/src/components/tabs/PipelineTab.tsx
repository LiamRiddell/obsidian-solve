import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { ArrowDown } from "lucide-react"
import type { PipelineStageResult } from "@solve-js/types/DiagnosticPipelineResult"
import type { Token } from "@solve-js/lexer/Token"
import { useDiagnosticReportStore, tokenCount, opcodeCount, cacheStatus, asyncStatus, stageCount } from "@/stores/diagnosticReport"
import { usePipelineStore } from "@/stores/pipeline"
import { useUiStore } from "@/stores/ui"
import { useStreamStore } from "@/stores/stream"
import { fmt } from "@bridge/utils"
import { PipelineStage } from "@/components/tabs/PipelineStage"
import { ConstantsExplorer } from "@/components/shared/ConstantsExplorer"
import { VariablesChips } from "@/components/shared/VariablesChips"
import { TimingWaterfall } from "@/components/shared/TimingWaterfall"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"

const GATE_STAGES = new Set(["safety_length", "safety_complexity", "cache_check", "async_preflight"])

function isResultStage(stage: PipelineStageResult): boolean {
  return stage.stage === "result"
}

function isErrorStage(stage: PipelineStageResult): boolean {
  if (stage.stage === "safety_length" || stage.stage === "safety_complexity") {
    return (stage.output as any).passed === false
  }
  return false
}

function isGateStage(stage: string): boolean {
  return GATE_STAGES.has(stage)
}

function getStageTime(stage: PipelineStageResult): string {
  return stage.elapsedNs > 0 ? fmt(stage.elapsedNs) : "—"
}

function getStagePreview(stage: PipelineStageResult): string {
  const o = stage.output as any
  if (stage.skipped) return "skipped"
  switch (stage.stage) {
    case "line_classification":
      return o.classification ?? "—"
    case "safety_length":
      return o.passed ? `OK (${o.expressionLength} chars)` : (o.errorMessage ?? "failed")
    case "lexer":
      return `${(o.tokens ?? []).length} tokens`
    case "normalizer": {
      const removed = (o.inputTokenCount ?? 0) - (o.outputTokenCount ?? 0)
      return `${o.inputTokenCount ?? 0} → ${o.outputTokenCount ?? 0} tokens` + (removed > 0 ? `, ${o.fusions?.length ?? 0} fusions` : "")
    }
    case "safety_complexity":
      return o.passed ? `OK (score ${o.complexityScore})` : (o.errorMessage ?? "failed")
    case "readwrite": {
      const reads = o.reads?.length ?? 0,
        writes = o.writes?.length ?? 0
      if (!reads && !writes) return "none"
      return [reads ? `${reads} read${reads !== 1 ? "s" : ""}` : null, writes ? `${writes} write${writes !== 1 ? "s" : ""}` : null].filter(Boolean).join(", ")
    }
    case "cache_check":
      return o.hit ? "hit" : "miss"
    case "parser":
      return o.uniqueParseletTypes?.length ? o.uniqueParseletTypes.join(", ") : typeof o.astDepth === "number" ? `depth ${o.astDepth}` : "—"
    case "compiler":
      return `${o.opcodeCount ?? 0} opcodes`
    case "async_preflight":
      return o.path === "pending" ? `pending: ${o.pendingQueryKey ?? "?"}` : (o.path ?? "sync")
    case "vm_execute": {
      const parts: string[] = []
      if (typeof o.totalInstructions === "number") parts.push(`${o.totalInstructions} instr`)
      return (o.resultType ?? "value") + (parts.length ? ` (${parts.join(", ")})` : "")
    }
    case "dag_registration": {
      const reads = o.readsRegistered?.length ?? 0,
        writes = o.writesRegistered?.length ?? 0
      return reads || writes ? `${reads} reads, ${writes} writes` : "none"
    }
    case "linecache":
      return o.stored ? `line ${o.lineNumber} cached` : "not stored"
    case "result":
      return o.error ?? String(o.formattedValue ?? o.rawValue ?? "—")
    default:
      return ""
  }
}

function tokClass(t: { type?: string }): string {
  const type = String(t.type || "").toLowerCase()
  if (["number", "hex", "bigint"].includes(type)) return "text-blue-600 dark:text-blue-400"
  if (type === "ident") return "text-emerald-600 dark:text-emerald-400"
  if (["star", "plus", "minus", "slash", "caret", "equals"].includes(type)) return "text-muted-foreground"
  if (type === "keyword" || type.includes("_by")) return "text-violet-600 dark:text-violet-400"
  return "text-muted-foreground"
}

/* ── Stage body building blocks — shared primitives every stage renderer composes from. ── */

function StatGrid({ rows }: { rows: Array<{ label: string; value: string; color?: string }> }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">{r.label}</span>
          <span className="font-mono font-semibold" style={r.color ? { color: r.color } : undefined}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function ChipGroup({ label, items, color, onClickItem }: { label: string; items: string[]; color: string; onClickItem?: (item: string) => void }) {
  if (items.length === 0) return null
  return (
    <div>
      <div className="text-muted-foreground mb-1 text-[9px] tracking-wide uppercase">
        {label} ({items.length})
      </div>
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <span
            key={item}
            onClick={onClickItem ? () => onClickItem(item) : undefined}
            className={cn("rounded border px-1.5 py-0.5 font-mono text-[10px]", onClickItem && "cursor-pointer")}
            style={{ background: color + "22", borderColor: color + "44", color }}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

function EmptyNote({ text }: { text: string }) {
  return <div className="text-muted-foreground text-xs italic">{text}</div>
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="bg-muted h-1 overflow-hidden rounded-full">
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  )
}

interface AsyncTimeline {
  pendingNs: number | null
  resolvedNs: number | null
  errorNs: number | null
  status: "resolved" | "error" | "waiting" | "unknown"
}

/**
 * Ported from playground's PipelineTab.vue — the largest and most
 * data-driven diagnostic tab, showing the per-line pipeline as a vertical
 * flow of stage cards, each with a purpose-built breakdown of that stage's
 * actual output.
 */
export function PipelineTab() {
  const lineResults = useDiagnosticReportStore((s) => s.lineResults)
  const stages = useDiagnosticReportStore((s) => s.stages)
  const stagesByLine = useDiagnosticReportStore((s) => s.stagesByLine)
  const constants = useDiagnosticReportStore((s) => s.constants)
  const variables = useDiagnosticReportStore((s) => s.variables)
  const result = useDiagnosticReportStore((s) => s.result)
  const tokens = useDiagnosticReportStore(tokenCount)
  const opcodes = useDiagnosticReportStore(opcodeCount)
  const cache = useDiagnosticReportStore(cacheStatus)
  const async_ = useDiagnosticReportStore(asyncStatus)
  const stagesCount = useDiagnosticReportStore(stageCount)

  const selectedLine = usePipelineStore((s) => s.selectedLine)
  const dropdownManuallyChanged = usePipelineStore((s) => s.dropdownManuallyChanged)
  const selectLine = usePipelineStore((s) => s.selectLine)
  const saveStageSnapshot = usePipelineStore((s) => s.saveStageSnapshot)
  const getStageSnapshot = usePipelineStore((s) => s.getStageSnapshot)

  const focusParselet = useUiStore((s) => s.focusParselet)
  const streamEvents = useStreamStore((s) => s.events)

  const hasResult = !!result

  const effectiveLine = selectedLine ?? lineResults[0]?.lineNumber ?? null

  const displayStages = useMemo(() => {
    const raw = effectiveLine !== null ? (stagesByLine[effectiveLine] ?? stages) : stages
    return raw.filter((s) => s.stage !== "pipeline_start" && s.stage !== "pipeline_end")
  }, [effectiveLine, stagesByLine, stages])

  const numStages = stagesCount ?? displayStages.length

  // Per-stage collapse state — intentionally NOT reset per line switch
  // (which stage TYPES you want expanded is a viewing preference, not
  // data tied to a specific line).
  const [stagesCollapsed, setStagesCollapsed] = useState<boolean[]>(() => Array(numStages).fill(true))
  useEffect(() => {
    setStagesCollapsed((old) => (old.length === numStages ? old : Array.from({ length: numStages }, (_, i) => old[i] ?? true)))
  }, [numStages])

  function onStageToggle(index: number, value: boolean) {
    setStagesCollapsed((old) => old.map((v, i) => (i === index ? value : v)))
  }

  const allCollapsed = stagesCollapsed.every((c) => c)
  function toggleAllStages() {
    setStagesCollapsed(Array(numStages).fill(!allCollapsed))
  }

  // Flash-pulse animation: stages whose data changed since the last time
  // this line was viewed get a brief highlight.
  const [pulsingStages, setPulsingStages] = useState<number[]>([])
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (pulseTimer.current) clearTimeout(pulseTimer.current)
  }, [])

  const stageOutputsKey = useMemo(() => displayStages.map((s) => JSON.stringify(s.output)), [displayStages])

  useEffect(() => {
    const lineKey = effectiveLine ?? 0
    const oldSnapshot = getStageSnapshot(lineKey)
    const newSnapshot = stageOutputsKey

    if (oldSnapshot && oldSnapshot.length === numStages) {
      const changed: number[] = []
      for (let i = 0; i < numStages; i++) {
        if (oldSnapshot[i] !== newSnapshot[i]) changed.push(i)
      }
      if (changed.length > 0) {
        setPulsingStages(changed)
        if (pulseTimer.current) clearTimeout(pulseTimer.current)
        pulseTimer.current = setTimeout(() => setPulsingStages([]), 650)
      }
    }
    saveStageSnapshot(lineKey, [...newSnapshot])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveLine])

  // Line selector — mirrors the store unless the dropdown itself was the
  // most recent thing to change the selection.
  const [lineSelectVal, setLineSelectVal] = useState(effectiveLine !== null ? String(effectiveLine) : "")
  useEffect(() => {
    if (!dropdownManuallyChanged) setLineSelectVal(effectiveLine !== null ? String(effectiveLine) : "")
  }, [effectiveLine, dropdownManuallyChanged])

  function onLineSelectChange(val: string) {
    setLineSelectVal(val)
    if (!val) return
    const ln = Number(val)
    if (ln === selectedLine) return
    selectLine(ln, true)
  }

  const activeLineStr = effectiveLine !== null ? `Line ${effectiveLine}` : "—"
  const stageLabel = effectiveLine !== null ? `L${effectiveLine}` : "—"
  const activeExpression = lineResults.find((r) => r.lineNumber === effectiveLine)?.expression ?? ""

  function getAsyncTimeline(stage: PipelineStageResult): AsyncTimeline {
    const o = stage.output as any
    const queryKey: string | undefined = o.pendingQueryKey
    const expr = activeExpression
    const matches = (e: (typeof streamEvents)[number]) => e.groupKey === expr || (!!queryKey && e.groupKey === queryKey)

    const pendingEvt = streamEvents.find((e) => e.type === "async_pending" && matches(e))
    const resolvedEvt = streamEvents.find((e) => e.type === "async_resolved" && matches(e) && (!pendingEvt || e.elapsedNs >= pendingEvt.elapsedNs))
    const errorEvt = streamEvents.find((e) => e.type === "async_error" && matches(e))

    let status: AsyncTimeline["status"] = "unknown"
    if (errorEvt) status = "error"
    else if (resolvedEvt) status = "resolved"
    else if (pendingEvt) status = "waiting"

    return { pendingNs: pendingEvt?.elapsedNs ?? null, resolvedNs: resolvedEvt?.elapsedNs ?? null, errorNs: errorEvt?.elapsedNs ?? null, status }
  }

  function renderAsyncGantt(timeline: AsyncTimeline): ReactNode {
    if (timeline.pendingNs === null) {
      return <EmptyNote text="No timeline data captured for this wait yet — check the Stream tab." />
    }
    const endNs = timeline.resolvedNs ?? timeline.errorNs
    const stillWaiting = endNs === null
    const durationNs = endNs !== null ? endNs - timeline.pendingNs : null
    const isError = timeline.status === "error"
    const status: "done" | "error" | "pending" = isError ? "error" : stillWaiting ? "pending" : "done"

    return (
      <TimingWaterfall
        segments={[
          {
            key: "wait",
            startNs: timeline.pendingNs,
            endNs,
            label: stillWaiting ? "Waiting…" : isError ? "Failed" : "Resolved",
            color: isError ? "#ff6b6b" : stillWaiting ? "#faff69" : "#ff9b54",
            status,
            tooltipTitle: "Async Wait",
            tooltipLines: [`Started at ${fmt(timeline.pendingNs)}`, durationNs !== null ? `${isError ? "Failed" : "Resolved"} after ${fmt(durationNs)}` : "Still waiting…"],
          },
        ]}
      />
    )
  }

  const stageRenderers: Record<string, (stage: PipelineStageResult) => ReactNode> = {
    line_classification(stage) {
      const o = stage.output as any
      const classification = o.classification ?? "—"
      const inlineSolveSpans: any[] = o.inlineSolveSpans ?? []
      return (
        <div className="flex flex-col gap-2.5">
          <StatGrid
            rows={[
              { label: "Line Type", value: classification, color: "#90e0ef" },
              { label: "Evaluated", value: o.skip ? "No — skipped" : "Yes", color: o.skip ? "#ff6b6b" : "#b5e48c" },
              { label: "Inline Solves", value: o.hasInlineSolve ? String(inlineSolveSpans.length || 1) : "0" },
            ]}
          />
          {inlineSolveSpans.length > 0 && (
            <div>
              <div className="text-muted-foreground mb-1 text-[9px] tracking-wide uppercase">Inline Solve Spans ({inlineSolveSpans.length})</div>
              <div className="flex flex-wrap gap-1">
                {inlineSolveSpans.map((span: any, i: number) => (
                  <span
                    key={i}
                    title={`Tokens [${span.startTokenIndex}..${span.endTokenIndex}] · column ${span.columnNumber ?? 1}`}
                    className="rounded border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[10px] text-violet-600 dark:text-violet-400"
                  >
                    s`{span.expression ?? "?"}`
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )
    },

    safety_length(stage) {
      const o = stage.output as any
      const pct = o.maxLength > 0 ? (o.expressionLength / o.maxLength) * 100 : 0
      const color = o.passed ? "#90e0ef" : "#ff6b6b"
      return (
        <div className="flex flex-col gap-2">
          <StatGrid
            rows={[
              { label: "Status", value: o.passed ? "Passed" : (o.errorMessage ?? "Failed"), color },
              { label: "Length", value: `${o.expressionLength} chars` },
              { label: "Limit", value: `${o.maxLength} chars` },
            ]}
          />
          <ProgressBar pct={pct} color={color} />
        </div>
      )
    },

    lexer(stage) {
      const o = stage.output as any
      const tokens = (o.tokens ?? []) as Token[]
      const tokenTypes: Record<string, number> = o.tokenTypes ?? {}
      if (!tokens.length) return <EmptyNote text="No tokens produced." />
      const typeEntries = Object.entries(tokenTypes).sort((a, b) => b[1] - a[1])
      const showCount = 20
      return (
        <div className="flex flex-col gap-2.5">
          <StatGrid
            rows={[
              { label: "Tokens", value: String(o.tokenCount ?? tokens.length) },
              { label: "Parens", value: o.hasParens ? "Yes" : "No" },
              { label: "Locale", value: o.locale ?? "—" },
              { label: "Distinct Types", value: String(typeEntries.length) },
            ]}
          />
          {typeEntries.length > 0 && (
            <div>
              <div className="text-muted-foreground mb-1 text-[9px] tracking-wide uppercase">Token Type Breakdown</div>
              <div className="flex flex-wrap gap-1">
                {typeEntries.map(([type, count]) => (
                  <span key={type} className="flex items-center gap-1 rounded border border-cyan-500/20 bg-cyan-500/10 px-1.5 py-0.5 text-[10px]">
                    <span className="font-mono">{type}</span>
                    <span className="font-bold text-cyan-600 dark:text-cyan-400">×{count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="text-muted-foreground mb-1 text-[9px] tracking-wide uppercase">
              Raw Tokens ({tokens.length}
              {tokens.length > showCount ? `, first ${showCount}` : ""})
            </div>
            <div className="flex flex-wrap gap-1">
              {tokens.slice(0, showCount).map((t, i) => (
                <span key={i} title={`Type: ${t.type}\nValue: ${t.value}`} className="bg-muted rounded px-1 py-0.5 font-mono text-[9px]">
                  {t.value}
                </span>
              ))}
              {tokens.length > showCount && <span className="text-muted-foreground text-[10px] italic">+{tokens.length - showCount} more</span>}
            </div>
          </div>
        </div>
      )
    },

    normalizer(stage) {
      const o = stage.output as any
      const fusions: any[] = o.fusions ?? []
      if (stage.skipped) return <EmptyNote text="No normalization rules matched — tokens passed through unchanged." />
      const removed = o.inputTokenCount - o.outputTokenCount
      return (
        <StatGrid
          rows={[
            { label: "Input Tokens", value: String(o.inputTokenCount), color: "#7bdff2" },
            { label: "Output Tokens", value: String(o.outputTokenCount), color: "#90e0ef" },
            { label: "Removed", value: String(removed), color: removed > 0 ? "#ff6b6b" : undefined },
            { label: "Fusions", value: String(fusions.length), color: fusions.length > 0 ? "#c7a9ff" : undefined },
          ]}
        />
      )
    },

    safety_complexity(stage) {
      const o = stage.output as any
      const b = o.breakdown ?? { tokenCount: 0, functionCalls: 0, nestingDepth: 0 }
      const pct = o.maxComplexity > 0 ? (o.complexityScore / o.maxComplexity) * 100 : 0
      const color = o.passed ? "#90e0ef" : "#ff6b6b"
      return (
        <div className="flex flex-col gap-2">
          <StatGrid rows={[{ label: "Status", value: o.passed ? "Passed" : (o.errorMessage ?? "Failed"), color }, { label: "Score", value: `${o.complexityScore} / ${o.maxComplexity}` }]} />
          <ProgressBar pct={pct} color={color} />
          <div className="text-muted-foreground mt-0.5 text-[9px] tracking-wide uppercase">Score Breakdown</div>
          <StatGrid
            rows={[
              { label: "Tokens (×1)", value: String(b.tokenCount) },
              { label: "Function Calls (×5)", value: String(b.functionCalls) },
              { label: "Max Nesting (×10)", value: String(b.nestingDepth) },
            ]}
          />
        </div>
      )
    },

    readwrite(stage) {
      const o = stage.output as any
      const reads: string[] = o.reads ?? []
      const writes: string[] = o.writes ?? []
      if (!reads.length && !writes.length) return <EmptyNote text="This line neither reads nor writes any variable." />
      return (
        <div className="flex flex-col gap-2">
          {o.isAssignment && (
            <span className="self-start rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase" style={{ color: "#faff69", background: "rgba(250,255,105,0.12)", border: "1px solid rgba(250,255,105,0.25)" }}>
              Assignment
            </span>
          )}
          <ChipGroup label="Reads" items={reads} color="#7bdff2" />
          <ChipGroup label="Writes" items={writes} color="#faff69" />
        </div>
      )
    },

    cache_check(stage) {
      const o = stage.output as any
      const hit = o.hit as boolean
      const color = hit ? "#90e0ef" : "#7bdff2"
      return (
        <div className="flex flex-col gap-2">
          <StatGrid rows={[{ label: "Status", value: hit ? "Hit" : "Miss", color }, { label: "Cache Size", value: `${o.cacheSize ?? "?"} entries` }]} />
          <div>
            <div className="text-muted-foreground mb-1 text-[9px] tracking-wide uppercase">Cache Key</div>
            <code className="text-muted-foreground block text-[10px] break-all">{o.cacheKey ?? "—"}</code>
          </div>
        </div>
      )
    },

    parser(stage) {
      if (stage.skipped) return <EmptyNote text="Skipped — bytecode served from cache, no parsing needed." />
      const o = stage.output as any
      const parselets: Array<{ type: string; category: string; prefix: boolean }> = o.parselets ?? []
      const counts = new Map<string, { count: number; category: string; prefix: boolean }>()
      for (const p of parselets) {
        const cur = counts.get(p.type)
        if (cur) cur.count++
        else counts.set(p.type, { count: 1, category: p.category, prefix: p.prefix })
      }
      return (
        <div className="flex flex-col gap-2.5">
          <StatGrid rows={[{ label: "AST Depth", value: String(o.astDepth ?? 0) }, { label: "Parselet Matches", value: String(parselets.length) }, { label: "Distinct Parselets", value: String(counts.size) }]} />
          {counts.size > 0 ? (
            <div>
              <div className="text-muted-foreground mb-1 text-[9px] tracking-wide uppercase">Parselets Matched</div>
              <div className="flex flex-wrap gap-1">
                {Array.from(counts.entries()).map(([type, info]) => (
                  <span
                    key={type}
                    title={`${info.prefix ? "Prefix" : "Infix"} parselet · category: ${info.category}\nClick to inspect in Parselets tab`}
                    onClick={() => focusParselet(type)}
                    className="flex cursor-pointer items-center gap-1 rounded border border-violet-500/20 bg-violet-500/10 px-1.5 py-0.5 text-[10px]"
                  >
                    <span className="font-mono font-bold text-violet-600 dark:text-violet-400">{type}</span>
                    {info.count > 1 && <span className="text-muted-foreground">×{info.count}</span>}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <EmptyNote text="No parselets matched." />
          )}
        </div>
      )
    },

    compiler(stage) {
      if (stage.skipped) return <EmptyNote text="Skipped — bytecode served from cache, no compilation needed." />
      const o = stage.output as any
      return (
        <div className="flex flex-col gap-2">
          <StatGrid
            rows={[
              { label: "Opcodes", value: String(o.opcodeCount ?? 0), color: "#c7a9ff" },
              { label: "Number Constants", value: String(o.numberConstants ?? 0), color: "#7bdff2" },
              { label: "String Constants", value: String(o.stringConstants ?? 0), color: "#90e0ef" },
            ]}
          />
          <div className="flex flex-wrap gap-1">
            <span
              className="rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase"
              style={o.hasAsync ? { background: "rgba(255,155,84,0.15)", color: "#ff9b54" } : { background: "rgba(107,107,117,0.1)", color: "var(--text-muted, #8a8a8a)" }}
            >
              {o.hasAsync ? "Has Async Opcodes" : "No Async Opcodes"}
            </span>
            <span
              className="rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase"
              style={o.cached ? { background: "rgba(144,224,239,0.15)", color: "#90e0ef" } : { background: "rgba(107,107,117,0.1)", color: "var(--text-muted, #8a8a8a)" }}
            >
              {o.cached ? "Served From Cache" : "Freshly Compiled"}
            </span>
          </div>
        </div>
      )
    },

    async_preflight(stage) {
      const o = stage.output as any
      const color = o.path === "pending" ? "#faff69" : "#90e0ef"
      const timeline = getAsyncTimeline(stage)
      const hasTimeline = timeline.pendingNs !== null
      return (
        <div className="flex flex-col gap-2.5">
          <StatGrid
            rows={[
              { label: "Path", value: o.path === "pending" ? "Pending" : "Sync", color },
              { label: "Resolvers Registered", value: String(o.resolverCount ?? 0) },
              { label: "Preflight Guard", value: o.skippedGuard ? "Skipped" : "Checked" },
            ]}
          />
          {o.path === "pending" && (
            <div>
              <div className="text-muted-foreground mb-1 text-[9px] tracking-wide uppercase">Pending Query Key</div>
              <code className="block text-[10px] break-all text-amber-500">{o.pendingQueryKey ?? "—"}</code>
            </div>
          )}
          {hasTimeline && (
            <div>
              <div className="text-muted-foreground mb-1 text-[9px] tracking-wide uppercase">Resolution Timeline</div>
              {renderAsyncGantt(timeline)}
            </div>
          )}
        </div>
      )
    },

    vm_execute(stage) {
      const o = stage.output as any
      return (
        <StatGrid
          rows={[
            { label: "Result Type", value: o.resultType ?? "Value", color: "#faff69" },
            { label: "Instructions", value: String(o.totalInstructions ?? 0) },
            { label: "Max Stack Depth", value: String(o.stackDepth ?? 0) },
            { label: "Pending", value: o.isPending ? "Yes" : "No" },
          ]}
        />
      )
    },

    dag_registration(stage) {
      const o = stage.output as any
      const reads: string[] = o.readsRegistered ?? []
      const writes: string[] = o.writesRegistered ?? []
      const dataSources: string[] = o.dataSourcesRegistered ?? []
      if (!reads.length && !writes.length && !dataSources.length) return <EmptyNote text="Nothing registered in the dependency graph for this line." />
      return (
        <div className="flex flex-col gap-2">
          <ChipGroup label="Reads" items={reads} color="#7bdff2" />
          <ChipGroup label="Writes" items={writes} color="#faff69" />
          <ChipGroup label="Data Sources" items={dataSources} color="#ff9b54" />
        </div>
      )
    },

    linecache(stage) {
      const o = stage.output as any
      return <StatGrid rows={[{ label: "Line", value: String(o.lineNumber ?? "—") }, { label: "Status", value: o.stored ? "Cached" : "Not Stored", color: o.stored ? "#90e0ef" : "#ff6b6b" }]} />
    },

    result(stage) {
      const o = stage.output as any
      if (o.error) return <span className="text-destructive">{o.error}</span>

      const raw = String(o.rawValue ?? "—")
      const formatted = o.formattedValue ?? raw
      const typeBadge = (
        <div className="flex flex-wrap justify-center gap-1">
          <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[9px] font-bold">{o.valueType ?? "Value"}</span>
          {o.unit && <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[9px] font-bold">{o.unit}</span>}
        </div>
      )

      if (raw === formatted) {
        return (
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-sm font-bold" style={{ color: "#faff69" }}>
              {formatted}
            </span>
            {typeBadge}
          </div>
        )
      }

      return (
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-[9px] tracking-wide uppercase">Raw:</span>
            <span className="font-mono text-[11px]" style={{ color: "#ffa07a" }}>
              {raw}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-[9px] tracking-wide uppercase">Formatted:</span>
            <span className="text-sm font-bold" style={{ color: "#faff69" }}>
              {formatted}
            </span>
          </div>
          {typeBadge}
        </div>
      )
    },
  }

  const hasNormalizerDetail = (stage: PipelineStageResult): boolean => {
    if (stage.stage !== "normalizer") return false
    const o = stage.output as any
    return (o.outputTokenCount ?? 0) > 0 || (o.fusions?.length ?? 0) > 0 || (o.rulesApplied?.length ?? 0) > 0
  }

  function renderNormalizerDetail(stage: PipelineStageResult): ReactNode {
    const o = stage.output as any
    const fusions: any[] = o.fusions ?? []
    const rulesApplied: any[] = o.rulesApplied ?? []
    const tokens: any[] = o.tokens ?? []
    return (
      <div className="flex flex-col gap-2.5 text-xs">
        <div className="flex flex-wrap gap-3">
          <span>
            <span className="text-muted-foreground">Tokens: </span>
            <span className="font-mono font-semibold">
              {o.inputTokenCount} → {o.outputTokenCount}
            </span>
          </span>
          <span>
            <span className="text-muted-foreground">Fusions: </span>
            <span className="font-mono font-semibold">{fusions.length}</span>
          </span>
          {rulesApplied.map((r: any) => (
            <span key={r.rule}>
              <span className="text-muted-foreground">{r.rule}: </span>
              <span className="font-mono font-semibold">{r.count}</span>
            </span>
          ))}
        </div>
        {rulesApplied.length > 0 && (
          <div>
            <div className="text-muted-foreground mb-1 text-[9px] tracking-wide uppercase">Rules Applied</div>
            <div className="flex flex-wrap gap-1.5">
              {rulesApplied.map((r: any) => (
                <span key={r.rule} className="flex items-center gap-1 rounded border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[10px]">
                  <span className="font-mono">{r.rule}</span>
                  <span className="font-semibold text-cyan-600 dark:text-cyan-400">×{r.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}
        {fusions.length > 0 && (
          <div>
            <div className="text-muted-foreground mb-1 text-[9px] tracking-wide uppercase">Token Fusions</div>
            <table className="w-full text-[10px]">
              <tbody>
                {fusions.map((f: any, i: number) => (
                  <tr key={i} className="border-t">
                    <td className="py-1 pr-2 font-mono">{f.rule}</td>
                    <td className="py-1 pr-2">
                      <span className="flex flex-wrap gap-1">
                        {(f.sourceTokens ?? []).map((st: any, si: number) => (
                          <span key={si} className={cn("font-mono", tokClass(st))}>
                            {st.value}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="text-muted-foreground py-1 pr-2">→</td>
                    <td className="py-1">
                      <span className="text-muted-foreground">{f.fusedToken.type}</span> <span style={{ color: "#ffa07a" }}>{f.fusedToken.value}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tokens.length > 0 && (
          <div>
            <div className="text-muted-foreground mb-1 text-[9px] tracking-wide uppercase">
              Normalized Tokens ({tokens.length} total{tokens.length > 24 ? `, showing first 24` : ""})
            </div>
            <div className="flex flex-wrap gap-1">
              {tokens.slice(0, 24).map((t: any, i: number) => (
                <span key={i} title={`Type: ${t.type}\nValue: ${t.value}`} className={cn("font-mono text-[9px]", tokClass({ type: t.type }))}>
                  {t.value}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-1.5">
        <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <span className="font-mono">#</span> Line
        </label>
        <select
          value={lineSelectVal}
          onChange={(e) => onLineSelectChange(e.target.value)}
          className="border-input bg-background h-7 max-w-70 rounded-md border px-2 text-xs"
        >
          {lineResults.map((lr) => (
            <option key={lr.lineNumber} value={String(lr.lineNumber ?? 1)}>
              Line {lr.lineNumber ?? 1}: {lr.expression.slice(0, 30)}
              {lr.expression.length > 30 ? "…" : ""}
            </option>
          ))}
        </select>
        <span className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">{activeLineStr}</span>
        <Button variant="outline" size="sm" className="ml-auto" onClick={toggleAllStages}>
          {allCollapsed ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
          {allCollapsed ? "Expand all" : "Collapse all"}
        </Button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {hasResult && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatCard label="Tokens" value={String(tokens)} color="#7bdff2" />
            <StatCard label="Opcodes" value={String(opcodes)} color="#90e0ef" />
            <StatCard label="Cache" value={cache} color="#ff6ec7" />
            <StatCard label="Async" value={async_} color="#ff9b54" />
            {displayStages.length > 0 && <StatCard label="Stages" value={String(displayStages.length)} color="#b5e48c" />}
          </div>
        )}

        {displayStages.length > 0 && (
          <div className="flex flex-col">
            {displayStages.map((stage, i) => (
              <div key={stage.stage}>
                <PipelineStage
                  stepNumber={i + 1}
                  icon={stage.icon}
                  label={stage.label}
                  colorClass={stage.colorClass}
                  timeLabel={getStageTime(stage)}
                  activeLine={stageLabel}
                  preview={getStagePreview(stage)}
                  isResult={isResultStage(stage)}
                  isGate={isGateStage(stage.stage)}
                  executed={hasResult}
                  hasError={isErrorStage(stage)}
                  skipped={stage.skipped}
                  collapsed={stagesCollapsed[i] ?? true}
                  onToggle={(v) => onStageToggle(i, v)}
                  pulsing={pulsingStages.includes(i)}
                  output={stageRenderers[stage.stage] ? stageRenderers[stage.stage](stage) : <span className="text-muted-foreground text-xs">—</span>}
                  detail={stage.stage === "normalizer" && hasNormalizerDetail(stage) ? renderNormalizerDetail(stage) : undefined}
                />
                {i < displayStages.length - 1 && (
                  <div className="text-muted-foreground/50 flex justify-center py-0.5" aria-hidden="true">
                    <ArrowDown className="size-3" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <ConstantsExplorer constants={constants} />
        <VariablesChips variables={variables} />
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-md border p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-[10px] font-medium uppercase">{label}</span>
        <span className="size-1.5 rounded-full" style={{ background: color }} />
      </div>
      <div className="mt-1 font-mono text-lg font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  )
}
