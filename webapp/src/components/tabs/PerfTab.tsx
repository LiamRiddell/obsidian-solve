import { useMemo, useState } from "react"
import { Gauge, Flame, Columns3, Grid3x3, BarChart3, ChevronRight, Zap, X } from "lucide-react"
import { useDiagnosticReportStore } from "@/stores/diagnosticReport"
import { usePipelineStore } from "@/stores/pipeline"
import { fmt, computeOverhead, getDominantStage, STAGE_COLORS, TELEMETRY_STAGE_COLORS } from "@bridge/utils"
import { EmptyState } from "@/components/shared/EmptyState"
import { TimingWaterfall, type WaterfallSegment } from "@/components/shared/TimingWaterfall"
import { cn } from "@/lib/utils"

const EMPTY_STATS = { lexerTime: 0, parserTime: 0, bytecodeTime: 0, executionTime: 0, totalTime: 0 }

function sparklineData(values: number[]): { points: string; avgY: number } | null {
  if (values.length < 2) return null
  const w = 120,
    h = 20
  const max = Math.max(...values, 1)
  const pts = values.map((v, i) => (i / (values.length - 1)) * w + "," + (h - (v / max) * h)).join(" ")
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  return { points: pts, avgY: h - (avg / max) * h }
}

/** Ported from playground's PerfTab.vue. */
export function PerfTab() {
  const stats = useDiagnosticReportStore((s) => s.stats) ?? EMPTY_STATS
  const lineStats = useDiagnosticReportStore((s) => s.lineStats)
  const statsHistory = useDiagnosticReportStore((s) => s.statsHistory)
  const arenaStats = useDiagnosticReportStore((s) => s.arenaStats)
  const pipelineTelemetry = useDiagnosticReportStore((s) => s.pipelineTelemetry)
  const flamegraphFilter = usePipelineStore((s) => s.flamegraphFilter)
  const setFlamegraphFilter = usePipelineStore((s) => s.setFlamegraphFilter)
  const clearFlamegraphFilter = usePipelineStore((s) => s.clearFlamegraphFilter)
  const [telemetryExpanded, setTelemetryExpanded] = useState(false)

  const overhead = computeOverhead(stats)

  const isDimmed = (label: string) => flamegraphFilter !== null && flamegraphFilter !== label && label !== "Other" && label !== "Overhead"
  const isHighlighted = (label: string) => flamegraphFilter !== null && flamegraphFilter === label

  function onFlameClick(label: string) {
    if (flamegraphFilter === label) clearFlamegraphFilter()
    else setFlamegraphFilter(label)
  }

  const flameSegments = useMemo(() => {
    const all = [
      { label: "Lexer", time: stats.lexerTime, color: STAGE_COLORS.Lexer },
      { label: "Parser", time: stats.parserTime, color: STAGE_COLORS.Parser },
      { label: "Compile", time: stats.bytecodeTime, color: STAGE_COLORS.Compile },
      { label: "VM", time: stats.executionTime, color: STAGE_COLORS.VM },
      { label: "Overhead", time: overhead, color: STAGE_COLORS.Overhead },
    ].filter((x) => x.time > 0)

    if (all.length === 0) return []
    const mergedTotal = all.reduce((a, x) => a + x.time, 0) || 1
    let cursor = 0
    return all.map((seg) => {
      const startNs = cursor
      cursor += seg.time
      const pct = (seg.time / mergedTotal) * 100
      return { ...seg, startNs, endNs: cursor, pctStr: pct.toFixed(1) + "%", timeStr: fmt(seg.time) }
    })
  }, [stats, overhead])

  const flameLegend = flameSegments.map((s) => ({ label: s.label, color: s.color }))

  const flameWaterfallSegments: WaterfallSegment[] = flameSegments.map((seg) => ({
    key: seg.label,
    startNs: seg.startNs,
    endNs: seg.endNs,
    label: seg.label,
    color: seg.color,
    status: "done",
    dimmed: isDimmed(seg.label),
    highlighted: isHighlighted(seg.label),
    tooltipTitle: seg.label,
    tooltipLines: [seg.timeStr, seg.pctStr],
  }))

  const lineFlameBars = useMemo(() => {
    if (!lineStats || lineStats.length === 0) return []
    const mergedTotal = lineStats.reduce((a, ls) => a + ls.stats.totalTime, 0) || 1
    const lineCount = lineStats.length

    return lineStats.map((ls) => {
      const s = ls.stats
      const pct = (s.totalTime / mergedTotal) * 100
      const width = pct < 1.5 ? Math.max(1.5, pct) : pct
      const dominant = getDominantStage(s)
      const showLabel = pct >= 8 && lineCount <= 15
      const dimmed = flamegraphFilter !== null && dominant !== flamegraphFilter
      const highlighted = flamegraphFilter !== null && dominant === flamegraphFilter

      const lineTotal = s.totalTime || 1
      const segments = [
        { label: "Lexer", time: s.lexerTime, color: STAGE_COLORS.Lexer },
        { label: "Parser", time: s.parserTime, color: STAGE_COLORS.Parser },
        { label: "Compile", time: s.bytecodeTime, color: STAGE_COLORS.Compile },
        { label: "VM", time: s.executionTime, color: STAGE_COLORS.VM },
        { label: "Overhead", time: computeOverhead(s), color: STAGE_COLORS.Overhead },
      ]
        .filter((seg) => seg.time > 0)
        .map((seg) => ({ ...seg, segPct: (seg.time / lineTotal) * 100 }))

      return {
        lineNumber: ls.lineNumber,
        dominant,
        segments,
        width,
        pctStr: pct.toFixed(1) + "%",
        timeStr: fmt(s.totalTime),
        showLabel,
        isDimmed: dimmed,
        isHighlighted: highlighted,
        color: segments.find((seg) => seg.label === dominant)?.color ?? STAGE_COLORS.Overhead,
        breakdown: {
          lexer: fmt(s.lexerTime),
          parser: fmt(s.parserTime),
          compile: fmt(s.bytecodeTime),
          execution: fmt(s.executionTime),
          overhead: fmt(computeOverhead(s)),
        },
      }
    })
  }, [lineStats, flamegraphFilter])

  const lineFlameLegend = useMemo(() => {
    const seen = new Set<string>()
    const items: { label: string; color: string }[] = []
    for (const bar of lineFlameBars) {
      if (!seen.has(bar.dominant)) {
        seen.add(bar.dominant)
        items.push({ label: bar.dominant, color: bar.color })
      }
    }
    return items
  }, [lineFlameBars])

  const heatmapStages = [
    { label: "Lexer", getValue: (s: typeof stats) => s.lexerTime, color: STAGE_COLORS.Lexer },
    { label: "Parser", getValue: (s: typeof stats) => s.parserTime, color: STAGE_COLORS.Parser },
    { label: "Compile", getValue: (s: typeof stats) => s.bytecodeTime, color: STAGE_COLORS.Compile },
    { label: "VM", getValue: (s: typeof stats) => s.executionTime, color: STAGE_COLORS.VM },
    { label: "Overhead", getValue: (s: typeof stats) => computeOverhead(s), color: STAGE_COLORS.Overhead },
  ]

  const heatmapRows = useMemo(() => {
    const history = statsHistory.slice(-50).reverse()
    if (history.length < 2) return []
    return history.map((s, i) => {
      const t = s.totalTime || 1
      const evalNum = statsHistory.length - i
      const cells = heatmapStages.map((stage) => {
        const val = stage.getValue(s)
        const pct = (val / t) * 100
        const pctNorm = Math.min(1, pct / 50)
        const opacity = 0.06 + pctNorm * 0.86
        const dimmed = flamegraphFilter !== null && stage.label !== flamegraphFilter
        return { color: stage.color, opacity: dimmed ? Math.min(0.08, opacity) : opacity, stage: stage.label, timeStr: fmt(val), pctStr: pct.toFixed(1) + "%" }
      })
      return { evalNum, cells }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })
  }, [statsHistory, flamegraphFilter])

  const statCards = useMemo(() => {
    const timed: Record<string, { label: string; value: number; color: string; key: keyof typeof stats }> = {
      Lexer: { label: "Lexer", value: stats.lexerTime, color: STAGE_COLORS.Lexer, key: "lexerTime" },
      Parser: { label: "Parser", value: stats.parserTime, color: STAGE_COLORS.Parser, key: "parserTime" },
      Compiler: { label: "Compiler", value: stats.bytecodeTime, color: STAGE_COLORS.Compile, key: "bytecodeTime" },
      "VM Execute": { label: "VM Execute", value: stats.executionTime, color: STAGE_COLORS.VM, key: "executionTime" },
    }

    const cards: Array<{ label: string; color: string; displayTime: string; displayAvg: string; sparkline: ReturnType<typeof sparklineData>; dimmed: boolean }> = []
    for (const card of Object.values(timed)) {
      const vals = statsHistory.map((h) => h[card.key] || 0)
      const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
      cards.push({
        label: card.label,
        color: card.color,
        displayTime: fmt(card.value),
        displayAvg: "avg " + fmt(avg),
        sparkline: sparklineData(vals),
        dimmed: flamegraphFilter !== null && card.label !== flamegraphFilter,
      })
    }

    const overheadVals = statsHistory.map(() => overhead)
    const totalVals = statsHistory.map((h) => h.totalTime || 0)
    cards.push({
      label: "Overhead",
      color: STAGE_COLORS.Overhead,
      displayTime: fmt(overhead),
      displayAvg: "avg " + fmt(overheadVals.reduce((a, b) => a + b, 0) / Math.max(1, overheadVals.length)),
      sparkline: sparklineData(overheadVals),
      dimmed: false,
    })
    cards.push({
      label: "Total",
      color: "#b5e48c",
      displayTime: fmt(stats.totalTime),
      displayAvg: "avg " + fmt(totalVals.reduce((a, b) => a + b, 0) / Math.max(1, totalVals.length)),
      sparkline: sparklineData(totalVals),
      dimmed: false,
    })

    return cards
  }, [stats, statsHistory, overhead, flamegraphFilter])

  const telemetryTotalTime = pipelineTelemetry?.stages?.reduce((sum, s) => sum + s.wallTimeNs, 0) ?? 0
  const telemetryTotalBytes = pipelineTelemetry?.stages?.reduce((sum, s) => sum + s.allocBytes, 0) ?? 0
  const stageColor = (stage: string) => TELEMETRY_STAGE_COLORS[stage] ?? "#6a6a6a"

  if (flameSegments.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <EmptyState icon={Gauge} text="No timing data" hint="Evaluate an expression to see performance stats." />
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      {arenaStats.enabled && (
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Arena Usage" value={`${arenaStats.usage} / ${arenaStats.capacity}`} sub={`${(arenaStats.capacity > 0 ? (arenaStats.usage / arenaStats.capacity) * 100 : 0).toFixed(1)}% utilized`} color="#c084fc" />
          <StatCard label="Arena Capacity" value={String(arenaStats.capacity)} sub="Bump-allocator active" color="#7bdff2" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {statCards.map((card) => (
          <StatCard key={card.label} label={card.label} value={card.displayTime} sub={card.displayAvg} color={card.color} sparkline={card.sparkline} dimmed={card.dimmed} />
        ))}
      </div>

      {/* Flamegraph */}
      <div>
        <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
          <Flame className="size-4" /> Pipeline Flamegraph
        </h4>
        <div className="text-muted-foreground mb-2 text-xs">
          Total evaluation time split by stage. Wider segment = more time spent there. Click a segment (or a legend swatch) to highlight that stage everywhere on this tab.
        </div>
        <TimingWaterfall segments={flameWaterfallSegments} clickable onSegmentClick={onFlameClick} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {flameLegend.map((item) => (
            <span
              key={item.label}
              onClick={() => onFlameClick(item.label)}
              className={cn("flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[10px]", flamegraphFilter === item.label && "bg-muted font-semibold")}
            >
              <span className="size-2 rounded-full" style={{ background: item.color }} /> {item.label}
            </span>
          ))}
          {flamegraphFilter && (
            <button type="button" onClick={clearFlamegraphFilter} className="text-muted-foreground hover:bg-muted flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]">
              <X className="size-3" /> Clear filter
            </button>
          )}
        </div>
      </div>

      {/* Per-Line Flamegraph */}
      {lineFlameBars.length > 0 && (
        <div>
          <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
            <Columns3 className="size-4" /> Per-Line Flamegraph
          </h4>
          <div className="text-muted-foreground mb-2 text-xs">Each bar is one line's own Lexer/Parser/Compile/VM/Overhead split. Bar width = share of total time across all lines.</div>
          <div className="flex flex-col gap-1">
            {lineFlameBars.map((bar) => (
              <div
                key={bar.lineNumber}
                title={`Line ${bar.lineNumber} · dominant: ${bar.dominant}\n${bar.timeStr} (${bar.pctStr} of total)\nLx ${bar.breakdown.lexer} · Pr ${bar.breakdown.parser} · Cp ${bar.breakdown.compile} · VM ${bar.breakdown.execution} · Ov ${bar.breakdown.overhead}`}
                style={{ width: `${bar.width}%` }}
                className={cn("relative flex h-5 overflow-hidden rounded-sm transition-opacity", bar.isDimmed && "opacity-30", bar.isHighlighted && "ring-primary ring-2")}
              >
                {bar.segments.map((seg) => (
                  <div key={seg.label} onClick={() => onFlameClick(seg.label)} style={{ width: `${seg.segPct}%`, background: seg.color }} className="h-full cursor-pointer" />
                ))}
                {bar.showLabel && <span className="absolute inset-0 flex items-center px-1.5 text-[9px] text-white/90">L{bar.lineNumber}</span>}
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-[9px] tracking-wide uppercase opacity-70">
              {lineFlameBars.length} line{lineFlameBars.length !== 1 ? "s" : ""}
            </span>
            {lineFlameLegend.map((item) => (
              <span
                key={item.label}
                onClick={() => onFlameClick(item.label)}
                className={cn("flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[10px]", flamegraphFilter === item.label && "bg-muted font-semibold")}
              >
                <span className="size-2 rounded-full" style={{ background: item.color }} /> {item.label}
              </span>
            ))}
            {flamegraphFilter && (
              <button type="button" onClick={clearFlamegraphFilter} className="text-muted-foreground hover:bg-muted flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]">
                <X className="size-3" /> Clear filter
              </button>
            )}
          </div>
        </div>
      )}

      {/* Heatmap */}
      {statsHistory.length >= 2 && (
        <div>
          <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
            <Grid3x3 className="size-4" /> Pipeline Heatmap
          </h4>
          <div className="text-muted-foreground mb-2 text-xs">One row per past evaluation (most recent first), one column per stage. Brighter cell = that stage took a bigger share of that run's total time.</div>
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              <div className="grid grid-cols-[3rem_repeat(5,1fr)] gap-0.5">
                <div />
                {heatmapStages.map((stage) => (
                  <div key={stage.label} className="px-1 text-center text-[9px] font-semibold" style={{ color: stage.color }}>
                    {stage.label}
                  </div>
                ))}
                {heatmapRows.map((row, ri) => (
                  <div key={ri} className="col-span-6 grid grid-cols-subgrid">
                    <div className="text-muted-foreground text-[9px]">#{row.evalNum}</div>
                    {row.cells.map((cell, ci) => (
                      <div key={ci} title={`${cell.stage}: ${cell.timeStr} (${cell.pctStr})`} className="h-4 rounded-[2px]" style={{ background: cell.color, opacity: cell.opacity }} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pipeline Telemetry */}
      {pipelineTelemetry && pipelineTelemetry.stages.length > 0 && (
        <div className="rounded-md border">
          <div onClick={() => setTelemetryExpanded((o) => !o)} className="bg-muted/50 hover:bg-muted flex cursor-pointer items-center gap-2 border-b px-3 py-1.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <BarChart3 className="size-3.5" /> Pipeline Telemetry
            </span>
            <span className="text-muted-foreground text-xs">{pipelineTelemetry.stages.length} stages</span>
            <ChevronRight className={cn("ml-auto size-4 transition-transform", telemetryExpanded && "rotate-90")} />
          </div>
          {telemetryExpanded && (
            <div className="p-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground text-[10px] tracking-wide uppercase">
                    <th className="px-2 py-1 text-left font-normal">Stage</th>
                    <th className="px-2 py-1 text-left font-normal">Wall Time</th>
                    <th className="px-2 py-1 text-left font-normal">Alloc Bytes</th>
                    <th className="px-2 py-1 text-left font-normal">Cache</th>
                    <th className="px-2 py-1 text-left font-normal">Sub-Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {pipelineTelemetry.stages.map((s) => (
                    <tr key={s.stage} className="border-t">
                      <td className="px-2 py-1">
                        <span className="rounded border px-1.5 py-0.5 font-mono" style={{ color: stageColor(s.stage), borderColor: stageColor(s.stage) + "44" }}>
                          {s.stage}
                        </span>
                      </td>
                      <td className="px-2 py-1 font-mono">{fmt(s.wallTimeNs)}</td>
                      <td className="text-muted-foreground px-2 py-1 font-mono">{s.allocBytes > 0 ? `${s.allocBytes} B` : "—"}</td>
                      <td className="px-2 py-1">
                        {s.cacheHit ? (
                          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">Hit</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="text-muted-foreground px-2 py-1">{s.subStage || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-muted-foreground mt-2 flex items-center gap-3 border-t pt-2 text-xs font-semibold">
                <span>Total</span>
                <span className="font-mono">{fmt(telemetryTotalTime)}</span>
                <span className="font-mono">{telemetryTotalBytes > 0 ? `${telemetryTotalBytes} B` : "—"}</span>
                {pipelineTelemetry.fastPath && (
                  <span className="ml-auto flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <Zap className="size-3" /> Fast path
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  color,
  sparkline,
  dimmed,
}: {
  label: string
  value: string
  sub?: string
  color: string
  sparkline?: { points: string; avgY: number } | null
  dimmed?: boolean
}) {
  return (
    <div className={cn("rounded-md border p-2.5 transition-opacity", dimmed && "opacity-40")}>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-[10px] font-medium uppercase">{label}</span>
        <span className="size-1.5 rounded-full" style={{ background: color }} />
      </div>
      <div className="mt-1 font-mono text-base font-bold" style={{ color }}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px]" style={{ color }}>
          {sub}
        </div>
      )}
      {sparkline && (
        <svg width="120" height="20" viewBox="0 0 120 20" className="mt-1 block">
          <polyline points={sparkline.points} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
          <line x1="0" y1={sparkline.avgY} x2="120" y2={sparkline.avgY} stroke={color} strokeWidth="0.5" strokeDasharray="2,2" opacity={0.4} />
        </svg>
      )}
    </div>
  )
}
