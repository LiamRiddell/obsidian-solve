import { useMemo } from "react"
import { Play, Library, Copy, FileEdit, ListChecks, CheckCircle2, XCircle, Hourglass, FlaskConical } from "lucide-react"
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine"
import { formatValue } from "@solve-js/format/FormatEngine"
import { ValueType } from "@solve-js/vm/Value"
import { exampleData } from "@bridge/examples"
import { useQaStore, detectExpectation, type QaResult } from "@/stores/qa"
import { EmptyState } from "@/components/shared/EmptyState"
import { cn } from "@/lib/utils"

function isSkippable(trimmed: string): boolean {
  return trimmed.length === 0 || trimmed.startsWith("#") || trimmed.startsWith("//")
}

/** Visual bucket for a result row — never raw status, so an expected error reads as a pass. */
function resultClass(r: QaResult): "passed" | "failed" | "pending" {
  if (r.status === "pending") return "pending"
  return r.passed ? "passed" : "failed"
}

const RESULT_ICON = { passed: CheckCircle2, failed: XCircle, pending: Hourglass } as const
const RESULT_ICON_COLOR = {
  passed: "text-emerald-500",
  failed: "text-destructive",
  pending: "text-amber-500",
} as const

/**
 * Batch test runner for manually QA-ing the engine. Unlike other diagnostic
 * tabs (which show detail for the one expression in the editor), this
 * evaluates a whole list of expressions sequentially through a single fresh
 * engine instance and reports pass/fail for all of them at once. Ported
 * from playground's QaTab.vue.
 */
export function QaTab() {
  const source = useQaStore((s) => s.source)
  const setSource = useQaStore((s) => s.setSource)
  const results = useQaStore((s) => s.results)
  const setResults = useQaStore((s) => s.setResults)
  const onlyFailures = useQaStore((s) => s.onlyFailures)
  const setOnlyFailures = useQaStore((s) => s.setOnlyFailures)

  const lineCount = useMemo(() => source.split("\n").filter((l) => l.trim().length > 0).length, [source])
  const hasResults = results.length > 0

  const counts = useMemo(() => {
    let passed = 0,
      failed = 0,
      pending = 0
    for (const r of results) {
      if (r.status === "pending") pending++
      else if (r.passed) passed++
      else failed++
    }
    return { passed, failed, pending }
  }, [results])

  const totalMs = useMemo(() => results.reduce((sum, r) => sum + r.elapsedMs, 0), [results])

  // "Failures" means actually broken — a line that correctly rejected invalid
  // input (status: 'error', expected: 'error') is a pass and stays hidden.
  const visibleResults = useMemo(
    () => (onlyFailures ? results.filter((r) => r.status !== "pending" && !r.passed) : results),
    [results, onlyFailures],
  )

  function runAll() {
    // Fresh engine per run — diagnostics disabled, same lightweight config
    // PlaygroundExamplesValidity.spec.ts uses, since this tool only needs
    // pass/fail + timing, not full pipeline tracing.
    const engine = new ExpressionEngine("en", false)
    const lines = source.split("\n")
    const out: QaResult[] = []

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim()
      if (isSkippable(trimmed)) continue

      const expected = detectExpectation(trimmed)
      const start = performance.now()
      try {
        const values = engine.evaluateLine(i + 1, trimmed)
        const elapsedMs = performance.now() - start
        const first = values[0]
        if (first.type === ValueType.Pending) {
          out.push({ lineNumber: i + 1, expression: trimmed, status: "pending", expected, passed: false, detail: String(first.value), elapsedMs })
        } else if (first.type === ValueType.Error) {
          out.push({
            lineNumber: i + 1,
            expression: trimmed,
            status: "error",
            expected,
            passed: expected === "error",
            detail: first.unit ?? String(first.value),
            elapsedMs,
          })
        } else {
          out.push({ lineNumber: i + 1, expression: trimmed, status: "ok", expected, passed: expected === "ok", detail: formatValue(first), elapsedMs })
        }
      } catch (e) {
        const elapsedMs = performance.now() - start
        const message = e instanceof Error ? e.message : String(e)
        out.push({ lineNumber: i + 1, expression: trimmed, status: "error", expected, passed: expected === "error", detail: message, elapsedMs })
      }
    }

    setResults(out)
    engine.clear()
  }

  function loadShippedExamples() {
    const lines: string[] = []
    for (const category of exampleData) {
      lines.push(`# ${category.name}`)
      for (const ex of category.examples) {
        lines.push(...ex.expression.split("\n"))
      }
      lines.push("")
    }
    setSource(lines.join("\n"))
    setResults([])
  }

  function copyFailures() {
    const failures = results.filter((r) => r.status !== "pending" && !r.passed)
    const text = failures.map((r) => `L${r.lineNumber}: "${r.expression}" -> ${r.detail}`).join("\n")
    navigator.clipboard.writeText(text || "(no failures)")
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-1.5">
        <button
          type="button"
          onClick={runAll}
          className="text-primary hover:bg-accent flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
        >
          <Play className="size-3.5" /> Run all
        </button>
        <button
          type="button"
          onClick={loadShippedExamples}
          title="Replace the batch with every shipped playground example"
          className="text-muted-foreground hover:bg-accent flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
        >
          <Library className="size-3.5" /> Load examples
        </button>
        <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={onlyFailures} onChange={(e) => setOnlyFailures(e.target.checked)} />
          Only failures
        </label>
        {hasResults && (
          <button
            type="button"
            onClick={copyFailures}
            title="Copy failing lines and their errors"
            className="text-muted-foreground hover:bg-accent ml-auto flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
          >
            <Copy className="size-3.5" /> Copy failures
          </button>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <div className="rounded-md border">
          <div className="bg-muted/50 flex items-center gap-2 border-b px-3 py-1.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <FileEdit className="size-3.5" /> Test batch
            </span>
            <span className="text-muted-foreground ml-auto text-xs">{lineCount} lines</span>
          </div>
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            spellCheck={false}
            placeholder="One expression per line. Lines run sequentially through one engine, so :var = 10 on one line is usable on later lines."
            className="min-h-40 w-full resize-y bg-transparent p-2 font-mono text-xs leading-relaxed outline-none"
          />
        </div>

        {hasResults && (
          <div className="grid grid-cols-4 gap-3">
            <QaStat label="Passed" value={String(counts.passed)} className="text-emerald-600 dark:text-emerald-400" />
            <QaStat label="Failed" value={String(counts.failed)} className={counts.failed > 0 ? "text-destructive" : undefined} />
            <QaStat label="Pending" value={String(counts.pending)} className="text-amber-600 dark:text-amber-400" />
            <QaStat label="Total time" value={`${totalMs.toFixed(1)} ms`} className="text-blue-600 dark:text-blue-400" />
          </div>
        )}

        {!hasResults ? (
          <EmptyState
            icon={FlaskConical}
            text="No results yet"
            hint='Click "Run all" to evaluate every line in the batch above against a fresh engine instance.'
          />
        ) : (
          <div className="rounded-md border">
            <div className="bg-muted/50 flex items-center gap-2 border-b px-3 py-1.5">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <ListChecks className="size-3.5" /> Results
              </span>
              <span className="text-muted-foreground ml-auto text-xs">{visibleResults.length}</span>
            </div>
            <div className="flex flex-col gap-0.5 p-1">
              {visibleResults.length === 0 ? (
                <div className="text-muted-foreground p-2 text-sm">No failures — every line did what it was expected to do.</div>
              ) : (
                visibleResults.map((r) => {
                  const cls = resultClass(r)
                  const Icon = RESULT_ICON[cls]
                  return (
                    <div
                      key={r.lineNumber}
                      className="hover:bg-muted/50 grid grid-cols-[2rem_1.25rem_minmax(0,1.3fr)_minmax(0,1.7fr)_3.5rem] items-center gap-2 rounded-sm px-1.5 py-1 font-mono text-xs"
                    >
                      <span className="text-muted-foreground text-[10px]">L{r.lineNumber}</span>
                      <Icon className={cn("size-4", RESULT_ICON_COLOR[cls])} />
                      <span className={cn("truncate", cls === "failed" && "text-muted-foreground")} title={r.expression}>
                        {r.expression}
                        {r.expected === "error" && <span className="text-muted-foreground ml-1 text-[9px] italic">expects error</span>}
                      </span>
                      <span
                        className={cn("truncate", cls === "failed" ? "text-destructive" : cls === "pending" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}
                        title={r.detail}
                      >
                        {r.detail}
                      </span>
                      <span className="text-muted-foreground text-right text-[10px]">{r.elapsedMs.toFixed(2)} ms</span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function QaStat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-md border p-2.5">
      <div className="text-muted-foreground text-[10px] font-medium uppercase">{label}</div>
      <div className={cn("mt-0.5 font-mono text-lg font-bold", className)}>{value}</div>
    </div>
  )
}
