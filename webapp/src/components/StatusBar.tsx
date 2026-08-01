import { useEffect, useState } from "react"
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react"
import { useDiagnosticReportStore } from "@/stores/diagnosticReport"
import { cn } from "@/lib/utils"

const STATUS_DOT_CLASS: Record<string, string> = {
  ready: "bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]",
  busy: "bg-amber-500 animate-pulse",
  error: "bg-destructive",
}

const STATUS_LABEL: Record<string, string> = {
  ready: "Ready",
  busy: "Evaluating…",
  error: "Error",
}

/** Bottom status strip. Ported from playground's StatusBar.vue. */
export function StatusBar() {
  const status = useDiagnosticReportStore((s) => s.status)
  const errors = useDiagnosticReportStore((s) => s.errors)
  const [errorsOpen, setErrorsOpen] = useState(false)

  // Auto-open the drawer when a new error arrives; auto-close once cleared.
  useEffect(() => {
    setErrorsOpen(errors.length > 0)
  }, [errors])

  return (
    <div className="relative shrink-0">
      <div className="bg-card/40 flex h-7.5 items-center gap-2.5 border-t px-3.5 text-[10px] text-muted-foreground select-none">
        <span className={cn("size-1.5 shrink-0 rounded-full bg-muted-foreground", STATUS_DOT_CLASS[status])} />
        <span className="shrink-0 font-semibold text-foreground/80">{STATUS_LABEL[status]}</span>
        <span className="flex-1" />
        <button
          type="button"
          disabled={errors.length === 0}
          onClick={() => setErrorsOpen((o) => !o)}
          className={cn(
            "flex h-6.5 items-center gap-1 rounded-md border border-transparent px-2 font-mono text-[10px] font-bold text-muted-foreground transition-colors disabled:cursor-default disabled:opacity-50",
            errors.length > 0 && "bg-destructive/10 text-destructive hover:bg-destructive/15",
            errors.length > 0 && errorsOpen && "border-destructive/40",
          )}
        >
          <AlertTriangle className="size-3" />
          {errors.length} error{errors.length !== 1 ? "s" : ""}
          {errors.length > 0 && (errorsOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
        </button>
      </div>

      {errorsOpen && errors.length > 0 && (
        <div className="bg-popover absolute inset-x-0 bottom-full flex max-h-55 flex-col gap-1 overflow-y-auto border-t px-3 py-1.5 shadow-md">
          {errors.map((err, i) => (
            <div key={i} className="bg-destructive/10 border-destructive rounded-sm border-l-2 px-2.5 py-1 text-[10px]">
              {err}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
