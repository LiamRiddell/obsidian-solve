import { useMemo } from "react"
import { Copy, Check, AlertTriangle, LoaderCircle } from "lucide-react"
import { useState } from "react"
import type { Token, LineResult } from "@bridge/engine"
import { useDiagnosticReportStore } from "@/stores/diagnosticReport"
import { useTokensStore, matchToken } from "@/stores/tokens"
import { usePipelineStore } from "@/stores/pipeline"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface GroupEntry {
  line: number
  tokens: Token[]
  result: LineResult | null
}

/** Three-tier badge helpers. */
function getTier(result: LineResult): "tier-1" | "tier-2" | "tier-3" | "tier-skip" {
  if (result.error) return "tier-skip"
  if (result.wasCached) return "tier-2"
  if (result.type === "Pending") return "tier-3"
  return "tier-1"
}

const TIER_CLASS: Record<string, string> = {
  "tier-1": "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  "tier-2": "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  "tier-3": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "tier-skip": "bg-destructive/10 text-destructive",
}

function getTierStatusLabel(result: LineResult): string {
  if (result.error) return "Error"
  if (result.wasCached) return "T2 Cached"
  if (result.type === "Pending") return "T3 Pending"
  return "T1 Fresh"
}

function getTierReason(result: LineResult): string {
  if (result.error) return `Error: ${result.error}`
  if (result.wasCached) return "Tier 2 (Cache hit) — bytecode reused from earlier evaluation"
  if (result.type === "Pending") return "Tier 3 (Async pending) — awaiting external data resolution"
  return "Tier 1 (Fresh) — full eval: lexer → parser → compiler → VM"
}

/**
 * `parseletCategories` is the category -> count breakdown of EVERY parselet
 * this line's own parse matched (e.g. `{ conditionals: 2, arithmetic: 1 }`),
 * not just the single `parselet` name shown on the badge (which is only the
 * FIRST one matched). Rendered as a tooltip addendum so a line that composes
 * several grammars (e.g. `if 10 > 5 then 1 else 0` — conditionals AND
 * arithmetic) shows its full parse story, not just "IfThenElseParselet."
 */
function formatParseletCategories(categories: Record<string, number> | undefined): string {
  if (!categories) return ""
  const entries = Object.entries(categories)
  if (entries.length === 0) return ""
  const total = entries.reduce((sum, [, count]) => sum + count, 0)
  const breakdown = entries.map(([category, count]) => `${category}: ${count}`).join(", ")
  return `\n\n${total} parselet${total !== 1 ? "s" : ""} matched — ${breakdown}`
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement("textarea")
    ta.value = text
    ta.style.position = "fixed"
    ta.style.left = "-9999px"
    document.body.appendChild(ta)
    ta.select()
    document.execCommand("copy")
    document.body.removeChild(ta)
  }
}

/**
 * Raw lexer output — either a flat token stream or grouped by line, each
 * group annotated with its evaluated tier/status. Ported from playground's
 * OutputTab.vue.
 */
export function OutputTab() {
  const result = useDiagnosticReportStore((s) => s.result)
  const lineResults = useDiagnosticReportStore((s) => s.lineResults)
  const opcodes = useDiagnosticReportStore((s) => s.opcodes)
  const groupByLine = useTokensStore((s) => s.groupByLine)
  const setGroupByLine = useTokensStore((s) => s.setGroupByLine)
  const filterQuery = useTokensStore((s) => s.filterQuery)
  const setFilterQuery = useTokensStore((s) => s.setFilterQuery)
  const selectedLine = usePipelineStore((s) => s.selectedLine)
  const [copiedResult, setCopiedResult] = useState<string | null>(null)

  const display = useMemo(() => {
    if (!result) {
      return { groupEntries: [] as GroupEntry[], flatTokensList: [] as Token[], countLabel: "0 tokens", visibleCount: 0, filterActive: false }
    }

    const rawTokens = result.rawTokens ?? []
    const hasFilter = filterQuery.length > 0

    const resultByLine = new Map<number, LineResult>()
    for (const lr of result.lineResults ?? []) resultByLine.set(lr.lineNumber ?? 1, lr)

    const filtered: Token[] = []
    for (const t of rawTokens) {
      if (t.type === "WS" || t.type === "NEWLINE") continue
      if (hasFilter && !matchToken(t, filterQuery)) continue
      filtered.push(t)
    }
    const totalCount = filtered.length

    let groupEntries: GroupEntry[] = []
    let flatTokensList: Token[] = []
    let visibleCount = 0

    if (groupByLine) {
      const lineMap = new Map<number, Token[]>()
      const lineOrder: number[] = []
      for (const t of filtered) {
        const ln = t.line ?? 1
        if (!lineMap.has(ln)) {
          lineMap.set(ln, [])
          lineOrder.push(ln)
        }
        lineMap.get(ln)!.push(t)
      }
      lineOrder.sort((a, b) => a - b)
      groupEntries = lineOrder.map((ln) => ({ line: ln, tokens: lineMap.get(ln)!, result: resultByLine.get(ln) ?? null }))
      visibleCount = groupEntries.reduce((sum, e) => sum + e.tokens.length, 0)
    } else {
      flatTokensList = filtered
      visibleCount = filtered.length
    }

    const countLabel = rawTokens.length === 0 ? "0 tokens" : hasFilter ? `${visibleCount} / ${totalCount} tokens` : `${totalCount} tokens`

    return { groupEntries, flatTokensList, countLabel, visibleCount, filterActive: hasFilter }
  }, [result, filterQuery, groupByLine])

  const tierSummary = useMemo(() => {
    const s = { t1: 0, t2: 0, t3: 0, skip: 0, total: lineResults.length }
    for (const r of lineResults) {
      if (r.error) s.skip++
      else if (r.wasCached) s.t2++
      else if (r.type === "Pending") s.t3++
      else s.t1++
    }
    return s
  }, [lineResults])

  const tierTooltips = useMemo(() => {
    const b = { t1: [] as number[], t2: [] as number[], t3: [] as number[], skip: [] as { line: number; error: string; expr: string }[] }
    for (const r of lineResults) {
      const ln = r.lineNumber ?? 1
      if (r.error) b.skip.push({ line: ln, error: r.error, expr: r.expression })
      else if (r.wasCached) b.t2.push(ln)
      else if (r.type === "Pending") b.t3.push(ln)
      else b.t1.push(ln)
    }
    const fmtLines = (nums: number[]) => (nums.length > 0 ? "\nLines: " + nums.join(", ") : "")
    const fmtSkip = b.skip.length > 0 ? "\n" + b.skip.map((s) => `L${s.line} "${s.expr}": ${s.error}`).join("\n") : ""
    return {
      t1: "Fresh — full evaluation (lexer → parser → compiler → VM), nothing reused." + fmtLines(b.t1),
      t2: "Cached — bytecode reused from an earlier evaluation of the same expression." + fmtLines(b.t2),
      t3: "Pending — async data (e.g. a currency/price lookup) hasn't resolved yet." + fmtLines(b.t3),
      skip: "A parse or evaluation error." + fmtSkip,
    }
  }, [lineResults])

  const hasAnyResults = lineResults.some((r) => r.result || r.error)

  function copyAllResults() {
    const text = lineResults.map((r) => `L${r.lineNumber ?? 1}: ${r.expression} = ${r.error ?? r.result ?? ""}`).join("\n")
    if (text) copyText(text)
  }

  function copyResult(text: string) {
    if (!text) return
    copyText(text).then(() => {
      setCopiedResult(text)
      setTimeout(() => setCopiedResult((c) => (c === text ? null : c)), 1000)
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-1.5">
        <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={groupByLine} onChange={(e) => setGroupByLine(e.target.checked)} />
          Group by line
        </label>
        <Input
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          placeholder="Filter tokens…"
          spellCheck={false}
          className="h-7 max-w-45 text-xs"
        />
        {hasAnyResults && (
          <button
            type="button"
            onClick={copyAllResults}
            title="Copy all line results"
            className="text-muted-foreground hover:bg-accent flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
          >
            <Copy className="size-3.5" /> Copy all
          </button>
        )}
        <span className="text-muted-foreground ml-auto text-xs">{display.countLabel}</span>
      </div>

      {result && tierSummary.total > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b px-4 py-1.5">
          <span className="text-muted-foreground text-[10px] font-medium uppercase">Evaluation Tiers</span>
          <span title={tierTooltips.t1} className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            T1: {tierSummary.t1} fresh
          </span>
          <span title={tierTooltips.t2} className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            T2: {tierSummary.t2} cached
          </span>
          <span
            title={tierTooltips.t3}
            className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400"
          >
            {tierSummary.t3 > 0 && <LoaderCircle className="size-2.5 animate-spin" />}
            T3: {tierSummary.t3} pending
          </span>
          {tierSummary.skip > 0 && (
            <span title={tierTooltips.skip} className="bg-destructive/10 text-destructive rounded-full px-2 py-0.5 text-[10px] font-semibold">
              SKIP: {tierSummary.skip} errors
            </span>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {!result ? (
          <div className="text-muted-foreground text-sm">No tokens</div>
        ) : display.visibleCount === 0 ? (
          <div className="text-muted-foreground text-sm">{display.filterActive ? `No tokens match "${filterQuery}"` : "No tokens"}</div>
        ) : groupByLine ? (
          <div className="flex flex-col gap-2">
            {display.groupEntries.map((entry) => (
              <div
                key={entry.line}
                className={cn(
                  "rounded-md border p-2",
                  selectedLine === entry.line && "border-primary",
                  entry.result && getTier(entry.result) === "tier-skip" && "border-destructive/40",
                )}
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">Line {entry.line}</span>
                  {entry.result && (
                    <span
                      title={getTierReason(entry.result) + (entry.result.wasCached ? " · cache HIT" : " · cache MISS")}
                      className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", TIER_CLASS[getTier(entry.result)])}
                    >
                      {entry.result.type === "Pending" && !entry.result.error && <LoaderCircle className="size-2.5 animate-spin" />}
                      {getTierStatusLabel(entry.result)}
                    </span>
                  )}
                  {entry.result?.parselet && (
                    <span
                      title={`First parselet matched: ${entry.result.parselet}${formatParseletCategories(entry.result.parseletCategories)}`}
                      className="bg-muted rounded px-1.5 py-0.5 font-mono text-[10px]"
                    >
                      {entry.result.parselet}
                      {(() => {
                        const total = Object.values(entry.result.parseletCategories ?? {}).reduce((sum, n) => sum + n, 0)
                        return total > 1 ? ` +${total - 1}` : ""
                      })()}
                    </span>
                  )}
                  <span className="text-muted-foreground ml-auto flex gap-2 font-mono text-[10px]">
                    <span>
                      {entry.tokens.length} token{entry.tokens.length !== 1 ? "s" : ""}
                    </span>
                    <span>
                      {entry.result?.opcodeCount ?? opcodes.length ?? 0} opcode{(entry.result?.opcodeCount ?? 1) !== 1 ? "s" : ""}
                    </span>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-muted-foreground text-[10px] font-medium uppercase">Tokens</span>
                  {entry.tokens.map((t, i) => (
                    <span
                      key={i}
                      title={`Type: ${t.type}\nValue: ${t.value}\nPos: ${t.offset}`}
                      className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs"
                    >
                      {t.value}
                    </span>
                  ))}
                </div>

                {entry.result && (
                  <div className="mt-1.5 flex items-center gap-2 border-t pt-1.5 font-mono text-xs">
                    <span className={cn(entry.result.error ? "text-destructive" : "text-violet-600 dark:text-violet-400")}>{entry.result.type}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className={cn("flex items-center gap-1", entry.result.error ? "text-destructive" : "text-primary")}>
                      {entry.result.type === "Pending" && !entry.result.error && <LoaderCircle className="size-2.5 animate-spin" />}
                      {entry.result.error || entry.result.result || (entry.result.type === "Pending" ? "awaiting resolution…" : "")}
                    </span>
                    {entry.result.timedOut && (
                      <span title="API fetch timed out — result is a 0 gp fallback, not real data" className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="size-3" /> timed out
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => copyResult(entry.result!.error || entry.result!.result)}
                      title="Copy result"
                      className="hover:bg-muted ml-auto rounded p-1"
                    >
                      {copiedResult === (entry.result.error || entry.result.result) ? <Check className="size-3" /> : <Copy className="size-3" />}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {display.flatTokensList.map((t, i) => (
              <span key={i} title={`Type: ${t.type}\nValue: ${t.value}\nPos: ${t.offset}`} className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
                {t.value}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
