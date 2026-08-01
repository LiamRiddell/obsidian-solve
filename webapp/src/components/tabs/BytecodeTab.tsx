import { useState } from "react"
import { Braces, ChevronLeft, ChevronRight } from "lucide-react"
import { useDiagnosticReportStore, expression as selectExpression } from "@/stores/diagnosticReport"
import { usePipelineStore } from "@/stores/pipeline"
import { describeOpcode } from "@bridge/utils"
import { ContextHeader } from "@/components/shared/ContextHeader"
import { EmptyState } from "@/components/shared/EmptyState"
import { ConstantsExplorer } from "@/components/shared/ConstantsExplorer"
import { VariablesChips } from "@/components/shared/VariablesChips"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Button } from "@/components/ui/button"

/** Ported from playground's BytecodeTab.vue. */
export function BytecodeTab() {
  const opcodes = useDiagnosticReportStore((s) => s.opcodes)
  const constants = useDiagnosticReportStore((s) => s.constants)
  const variables = useDiagnosticReportStore((s) => s.variables)
  const lineResults = useDiagnosticReportStore((s) => s.lineResults)
  const expression = useDiagnosticReportStore(selectExpression)
  const selectedLine = usePipelineStore((s) => s.selectedLine)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const hasSidebarContent = constants.length > 0 || variables.length > 0
  const lineBadge = selectedLine !== null ? `L${selectedLine}` : "All Lines"
  const activeExpression =
    selectedLine !== null
      ? (lineResults.find((r) => r.lineNumber === selectedLine)?.expression ?? "")
      : (lineResults[0]?.expression ?? expression ?? "")

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ContextHeader
        label="Bytecode"
        lineBadge={lineBadge}
        expression={activeExpression}
        extra={
          hasSidebarContent && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSidebarOpen((o) => !o)}
              title={sidebarOpen ? "Hide constants sidebar" : "Show constants sidebar"}
            >
              {sidebarOpen ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />} Constants
            </Button>
          )
        }
      />
      <div className="flex items-center gap-3 border-b px-4 py-1.5">
        <span className="text-muted-foreground text-xs">
          {opcodes.length} opcode{opcodes.length !== 1 ? "s" : ""}
        </span>
        <span className="text-muted-foreground/70 ml-auto text-xs">
          Accumulated across all evaluated lines in this document — not scoped to one line.
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {opcodes.length > 0 ? (
            <div className="flex-1 overflow-y-auto">
              <Table className="font-mono text-xs">
                <TableHeader className="bg-background sticky top-0">
                  <TableRow>
                    <TableHead className="w-12 text-right">IP</TableHead>
                    <TableHead className="w-16">Hex</TableHead>
                    <TableHead className="w-32">Mnemonic</TableHead>
                    <TableHead className="w-32">Operand</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {opcodes.map((op, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground text-right">{i}</TableCell>
                      <TableCell className="text-blue-500 dark:text-blue-400">0x{op.value.toString(16).toUpperCase().padStart(2, "0")}</TableCell>
                      <TableCell className="font-semibold text-violet-600 dark:text-violet-400">{op.name}</TableCell>
                      <TableCell className="text-emerald-600 dark:text-emerald-400">{op.args.length > 0 ? op.args.join(", ") : "—"}</TableCell>
                      <TableCell className="text-muted-foreground whitespace-normal">{describeOpcode(op.name, op.args)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState icon={Braces} text="No opcodes" hint="Evaluate an expression to see its compiled bytecode disassembly." />
          )}
        </div>

        {hasSidebarContent && sidebarOpen && (
          <div className="w-64 shrink-0 overflow-y-auto border-l">
            <ConstantsExplorer constants={constants} />
            <VariablesChips variables={variables} />
          </div>
        )}
      </div>
    </div>
  )
}
