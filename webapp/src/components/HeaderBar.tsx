import { Activity } from "lucide-react"
import { useDiagnosticReportStore } from "@/stores/diagnosticReport"
import { fmt } from "@bridge/utils"
import { BrandWordmark } from "@/components/shared/BrandWordmark"
import { cn } from "@/lib/utils"

/** Top app header — brand mark, live pipeline timing readout. */
export function HeaderBar() {
  const status = useDiagnosticReportStore((s) => s.status)
  const result = useDiagnosticReportStore((s) => s.result)
  const stats = useDiagnosticReportStore((s) => s.stats)

  return (
    <header className="bg-background flex h-13 shrink-0 items-center gap-4 border-b px-4 select-none">
      <div className="flex flex-none items-center gap-2.5">
        <BrandWordmark className="text-foreground text-xl" />
        <span className="text-muted-foreground border-border rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
          Playground
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <div
          className={cn(
            "border-border bg-card text-muted-foreground flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] font-medium tabular-nums opacity-70",
            status === "busy" && "border-primary/30 text-primary opacity-100",
          )}
        >
          <Activity className={cn("size-3", status === "busy" && "animate-pulse")} />
          {result ? fmt(stats?.totalTime ?? 0) : "0 µs"}
        </div>
      </div>

      {/* Balances the fixed-width left group so the timing pill stays visually centered. */}
      <div className="flex-none basis-[13rem]" aria-hidden="true" />
    </header>
  )
}
