import { useState } from "react"
import { AlertTriangle, CheckCircle2, Copy, Check, Flag } from "lucide-react"
import type { LineResult } from "@bridge/engine"
import { useDiagnosticReportStore } from "@/stores/diagnosticReport"
import { usePipelineStore } from "@/stores/pipeline"
import { EmptyState } from "@/components/shared/EmptyState"
import { categoryMeta } from "@/lib/errorCategory"
import { cn } from "@/lib/utils"

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

function ErrorCard({ lr, selected, onSelect }: { lr: LineResult; selected: boolean; onSelect: () => void }) {
  const meta = categoryMeta(lr.errorCategory)
  const [copied, setCopied] = useState(false)

  function onCopy(e: React.MouseEvent) {
    e.stopPropagation()
    const parts = [`error[${lr.errorCode ?? "?"}]: ${lr.error}`]
    if (lr.errorExpected) parts.push(`  expected: ${lr.errorExpected}`)
    if (lr.errorFound) parts.push(`  found: ${lr.errorFound}`)
    if (lr.errorSuggestion) parts.push(`  suggestion: ${lr.errorSuggestion}`)
    copyText(parts.join("\n")).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1000)
    })
  }

  return (
    <div
      onClick={onSelect}
      className={cn(
        "flex cursor-pointer flex-col gap-2 rounded-lg border p-3 transition-colors",
        selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground shrink-0 font-mono text-[11px] font-bold">L{lr.lineNumber ?? 1}</span>
        <span
          className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", meta.badgeClass)}
        >
          <span className={cn("size-1.5 rounded-full", meta.dotClass)} />
          {meta.label}
        </span>
        {lr.errorCode && <span className="text-muted-foreground truncate font-mono text-[10px]">{lr.errorCode}</span>}
        {lr.errorRecoverable === false && (
          <span
            title="Engine-internal — likely worth reporting, not a syntax fix"
            className="text-muted-foreground/70 ml-auto flex shrink-0 items-center gap-1 text-[10px]"
          >
            <Flag className="size-3" /> internal
          </span>
        )}
        <button
          type="button"
          onClick={onCopy}
          title="Copy error detail"
          className={cn("hover:bg-muted shrink-0 rounded p-1", lr.errorRecoverable !== false && "ml-auto")}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </button>
      </div>

      <div className="text-muted-foreground truncate font-mono text-[11px]">{lr.expression}</div>
      <div className="text-foreground text-xs font-medium leading-snug">{lr.error}</div>

      {(lr.errorExpected || lr.errorFound || lr.errorSuggestion) && (
        <div className="border-border flex flex-col gap-1 border-t pt-2">
          {lr.errorExpected && (
            <div className="flex gap-1.5 text-[11px] leading-snug">
              <span className="text-muted-foreground/80 w-16 shrink-0 font-medium">Expected</span>
              <span className="text-foreground/90">{lr.errorExpected}</span>
            </div>
          )}
          {lr.errorFound && (
            <div className="flex gap-1.5 text-[11px] leading-snug">
              <span className="text-muted-foreground/80 w-16 shrink-0 font-medium">Found</span>
              <span className="text-foreground font-mono">{lr.errorFound}</span>
            </div>
          )}
          {lr.errorSuggestion && (
            <div className="flex gap-1.5 text-[11px] leading-snug">
              <span className="text-muted-foreground/80 w-16 shrink-0 font-medium">Suggestion</span>
              <span className="text-foreground/90">{lr.errorSuggestion}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Every current line-evaluation error in one place, full `EngineError`
 * detail per entry (category/code/message/expected/found/suggestion) —
 * the same data the inline editor's hover popover shows, but browsable as
 * a list instead of one at a time. Click a card to select that line
 * (syncs the Pipeline tab's line focus, same as the Summary/Output tabs).
 */
export function ErrorsTab() {
  const result = useDiagnosticReportStore((s) => s.result)
  const lineResults = useDiagnosticReportStore((s) => s.lineResults)
  const selectedLine = usePipelineStore((s) => s.selectedLine)
  const selectLine = usePipelineStore((s) => s.selectLine)

  if (!result) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <EmptyState icon={AlertTriangle} text="No errors yet" hint="Evaluate an expression to see errors here." />
      </div>
    )
  }

  const errored = lineResults.filter((lr) => lr.error)

  function copyAll() {
    const text = errored
      .map((lr) => `L${lr.lineNumber ?? 1} "${lr.expression}": error[${lr.errorCode ?? "?"}] ${lr.error}`)
      .join("\n")
    if (text) copyText(text)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-1.5">
        <span className="text-muted-foreground text-xs">
          {errored.length === 0 ? "No errors" : `${errored.length} error${errored.length !== 1 ? "s" : ""}`}
        </span>
        {errored.length > 0 && (
          <button
            type="button"
            onClick={copyAll}
            title="Copy all errors"
            className="text-muted-foreground hover:bg-accent ml-auto flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
          >
            <Copy className="size-3.5" /> Copy all
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {errored.length === 0 ? (
          <EmptyState icon={CheckCircle2} text="No errors" hint="Every line evaluated cleanly." />
        ) : (
          <div className="flex flex-col gap-2">
            {errored.map((lr) => (
              <ErrorCard
                key={lr.lineNumber}
                lr={lr}
                selected={selectedLine === (lr.lineNumber ?? 1)}
                onSelect={() => selectLine(lr.lineNumber ?? 1, true)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
