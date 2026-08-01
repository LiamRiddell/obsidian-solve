import { LayoutDashboard } from "lucide-react"
import type { LineResult } from "@bridge/engine"
import { useDiagnosticReportStore, tokenCount, opcodeCount } from "@/stores/diagnosticReport"
import { usePipelineStore } from "@/stores/pipeline"
import { useUiStore } from "@/stores/ui"
import { fmt, STAGE_COLORS } from "@bridge/utils"
import { EmptyState } from "@/components/shared/EmptyState"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const EMPTY_STATS = { lexerTime: 0, parserTime: 0, bytecodeTime: 0, executionTime: 0, totalTime: 0 }

/** Tier badge classes — tier-1 (fresh) and tier-2 (cached) share the same "success" styling. */
const TIER_CLASS: Record<string, string> = {
  "tier-1": "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  "tier-2": "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  "tier-3": "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  "tier-skip": "bg-destructive/10 text-destructive border-destructive/30",
}

function getTier(result: LineResult): "tier-1" | "tier-2" | "tier-3" | "tier-skip" {
  if (result.error) return "tier-skip"
  if (result.wasCached) return "tier-2"
  if (result.type === "Pending") return "tier-3"
  return "tier-1"
}

function getTierLabel(result: LineResult): string {
  if (result.error) return "Error"
  if (result.wasCached) return "Cached"
  if (result.type === "Pending") return "Pending"
  return "Fresh"
}

/**
 * Full-document overview: aggregated performance cards followed by an
 * Output-tab-style per-line result list. Ported from playground's
 * SummaryTab.vue. Click a line to jump to it in the Pipeline tab.
 */
export function SummaryTab() {
  const result = useDiagnosticReportStore((s) => s.result)
  const stats = useDiagnosticReportStore((s) => s.stats) ?? EMPTY_STATS
  const lineResults = useDiagnosticReportStore((s) => s.lineResults)
  const tokens = useDiagnosticReportStore(tokenCount)
  const opcodes = useDiagnosticReportStore(opcodeCount)
  const selectLine = usePipelineStore((s) => s.selectLine)
  const setActiveTab = useUiStore((s) => s.setActiveTab)

  if (!result) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <EmptyState icon={LayoutDashboard} text="No summary yet" hint="Evaluate an expression to see full-document stats." />
      </div>
    )
  }

  const timingCards = [
    { label: "Lexer", value: fmt(stats.lexerTime), color: STAGE_COLORS.Lexer },
    { label: "Parser", value: fmt(stats.parserTime), color: STAGE_COLORS.Parser },
    { label: "Compiler", value: fmt(stats.bytecodeTime), color: STAGE_COLORS.Compile },
    { label: "VM Execute", value: fmt(stats.executionTime), color: STAGE_COLORS.VM },
  ]

  const total = lineResults.length
  const hits = lineResults.filter((r) => r.wasCached).length
  const cacheHitRate = total === 0 ? "—" : `${Math.round((hits / total) * 100)}%`
  const errorCount = lineResults.filter((r) => r.error).length

  function jumpTo(lineNumber: number | undefined) {
    if (lineNumber == null) return
    selectLine(lineNumber, true)
    setActiveTab("flow")
  }

  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Total Time" value={fmt(stats.totalTime)} color="#b5e48c" />
        {timingCards.map((card) => (
          <StatCard key={card.label} label={card.label} value={card.value} color={card.color} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Lines" value={String(lineResults.length)} color={STAGE_COLORS.Lexer} />
        <StatCard label="Tokens" value={String(tokens)} color={STAGE_COLORS.Lexer} />
        <StatCard label="Opcodes" value={String(opcodes)} color={STAGE_COLORS.Compile} />
        <StatCard label="Cache Hit Rate" value={cacheHitRate} color="#ff6ec7" />
        <StatCard label="Errors" value={String(errorCount)} color={errorCount > 0 ? "#ff6b6b" : "#8a8a8a"} />
      </div>

      <div className="flex flex-col gap-1">
        {lineResults.map((lr) => (
          <div
            key={lr.lineNumber}
            title={`Jump to Line ${lr.lineNumber ?? 1} in the Pipeline tab`}
            onClick={() => jumpTo(lr.lineNumber)}
            className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs"
          >
            <span className="text-muted-foreground w-8 shrink-0 font-mono font-bold">L{lr.lineNumber ?? 1}</span>
            <span className="min-w-0 flex-1 truncate font-mono">{lr.expression}</span>
            <span className={cn("shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold", TIER_CLASS[getTier(lr)])}>
              {getTierLabel(lr)}
            </span>
            <span
              className={cn("max-w-55 shrink-0 truncate font-mono font-semibold", lr.error ? "text-destructive" : "text-primary")}
            >
              {lr.error || lr.result || (lr.type === "Pending" ? "pending…" : "")}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Card size="sm">
      <div className="flex items-center justify-between px-4">
        <span className="text-muted-foreground text-[10px] font-medium uppercase">{label}</span>
        <span className="size-1.5 rounded-full" style={{ background: color }} />
      </div>
      <div className="mt-1 px-4 font-mono text-lg font-bold" style={{ color }}>
        {value}
      </div>
    </Card>
  )
}
