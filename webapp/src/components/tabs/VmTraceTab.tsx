import { useMemo, useState } from "react"
import { Zap } from "lucide-react"
import { useDiagnosticReportStore, expression as selectExpression } from "@/stores/diagnosticReport"
import { usePipelineStore } from "@/stores/pipeline"
import { formatStackValue, stackValueTypeClass, fmt } from "@bridge/utils"
import { ContextHeader } from "@/components/shared/ContextHeader"
import { EmptyState } from "@/components/shared/EmptyState"
import { Input } from "@/components/ui/input"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { cn } from "@/lib/utils"

const STACK_TYPE_COLOR: Record<string, string> = {
  "vm-stack-number": "border-blue-500/40 text-blue-600 dark:text-blue-400",
  "vm-stack-hex": "border-indigo-500/40 text-indigo-600 dark:text-indigo-400",
  "vm-stack-bigint": "border-violet-500/40 text-violet-600 dark:text-violet-400",
  "vm-stack-string": "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  "vm-stack-datetime": "border-amber-500/40 text-amber-600 dark:text-amber-400",
  "vm-stack-percentage": "border-pink-500/40 text-pink-600 dark:text-pink-400",
  "vm-stack-uom": "border-cyan-500/40 text-cyan-600 dark:text-cyan-400",
  "vm-stack-array": "border-orange-500/40 text-orange-600 dark:text-orange-400",
  "vm-stack-boolean": "border-teal-500/40 text-teal-600 dark:text-teal-400",
  "vm-stack-other": "border-muted-foreground/30 text-muted-foreground",
}

/** Ported from playground's VmTraceTab.vue. */
export function VmTraceTab() {
  const steps = useDiagnosticReportStore((s) => s.vmTrace)
  const checkpoints = useDiagnosticReportStore((s) => s.checkpoints)
  const lineResults = useDiagnosticReportStore((s) => s.lineResults)
  const expression = useDiagnosticReportStore(selectExpression)
  const selectedLine = usePipelineStore((s) => s.selectedLine)
  const [filterQuery, setFilterQuery] = useState("")

  const filteredSteps = useMemo(() => {
    const q = filterQuery.trim().toLowerCase()
    if (!q) return steps
    return steps.filter((s) => s.opcodeName.toLowerCase().includes(q))
  }, [steps, filterQuery])

  // The checkpoint at the highest line number recorded — NOT actually
  // "nearest to the current execution point" despite what the original
  // label implied (no correlation against ip/instructionNumber is computed).
  const latestCheckpoint = useMemo(() => {
    if (checkpoints.length === 0) return null
    return checkpoints.reduce((a, b) => (a.lineNumber > b.lineNumber ? a : b))
  }, [checkpoints])

  const lineBadge = selectedLine !== null ? `L${selectedLine}` : "All Lines"
  const activeExpression =
    selectedLine !== null
      ? (lineResults.find((r) => r.lineNumber === selectedLine)?.expression ?? "")
      : (lineResults[0]?.expression ?? expression ?? "")

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ContextHeader
        label="VM Trace"
        lineBadge={lineBadge}
        expression={activeExpression}
        extra={
          <Input
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter opcodes…"
            spellCheck={false}
            className="h-7 max-w-35 text-xs"
          />
        }
      />
      <div className="border-b px-4 py-1.5">
        <span className="text-muted-foreground text-xs">
          {filteredSteps.length} / {steps.length} steps
        </span>
      </div>

      {checkpoints.length > 0 && (
        <div className="bg-muted/30 flex flex-col gap-1.5 border-b px-4 py-2">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium">Checkpoints ({checkpoints.length})</span>
            <span
              title="The checkpoint at the highest line number recorded so far — not necessarily the one closest to the last-executed instruction pointer."
              className="text-muted-foreground text-xs"
            >
              ▼ Latest: L{latestCheckpoint?.lineNumber ?? "—"}{" "}
              <span className="text-muted-foreground/70">({latestCheckpoint?.variableCount ?? 0} vars)</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {checkpoints.map((cp) => (
              <span
                key={cp.lineNumber}
                title={`${cp.variables.length} variable(s): ${cp.variables.join(", ")}`}
                className={cn(
                  "flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs",
                  cp.lineNumber === latestCheckpoint?.lineNumber && "border-primary bg-primary/10",
                )}
              >
                L{cp.lineNumber} <span className="text-muted-foreground">({cp.variableCount} vars)</span>
                {cp.lineNumber === latestCheckpoint?.lineNumber && <span className="text-primary">◀ latest</span>}
              </span>
            ))}
          </div>
          <div className="text-muted-foreground/70 text-xs">
            Checkpoints record VM variable state at definition lines for fast restoration.
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {steps.length === 0 ? (
          <EmptyState icon={Zap} text="No trace data" hint="Evaluate an expression to see its step-by-step VM execution trace." />
        ) : filteredSteps.length === 0 ? (
          <div className="text-muted-foreground p-2.5 text-sm">No steps match &ldquo;{filterQuery}&rdquo;</div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <Table className="font-mono text-xs">
              <TableHeader className="bg-background sticky top-0">
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead className="w-12">IP</TableHead>
                  <TableHead className="w-16">Hex</TableHead>
                  <TableHead className="w-32">Opcode</TableHead>
                  <TableHead>Stack</TableHead>
                  <TableHead className="w-20">Elapsed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSteps.map((step, i) => (
                  <TableRow key={i} className={cn(step === steps[steps.length - 1] && "bg-destructive/5")}>
                    <TableCell>{step.instructionNumber}</TableCell>
                    <TableCell>{step.ip}</TableCell>
                    <TableCell className="text-blue-600 dark:text-blue-400">0x{step.opcode.toString(16).toUpperCase().padStart(2, "0")}</TableCell>
                    <TableCell className="font-semibold text-violet-600 dark:text-violet-400">{step.opcodeName}</TableCell>
                    <TableCell className="whitespace-normal">
                      <span className="flex flex-wrap items-center gap-1">
                        <span className="bg-muted rounded px-1 text-[10px]">{step.stackDepth}</span>
                        {(step.stack ?? []).length === 0 ? (
                          <span className="text-muted-foreground/50">∅</span>
                        ) : (
                          (step.stack ?? []).map((sv, si) => (
                            <span
                              key={si}
                              title={`Type ${sv.type}${sv.unit ? ` Unit: ${sv.unit}` : ""}`}
                              className={cn("rounded border px-1 py-0.5 text-[10px]", STACK_TYPE_COLOR[stackValueTypeClass(sv.type)])}
                            >
                              {formatStackValue(sv)}
                            </span>
                          ))
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{fmt(step.elapsedNs)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
