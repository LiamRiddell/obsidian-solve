import type { ReactNode } from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

/** Maps a stage's `colorClass` to its accent color. Mirrors `.flow-stage.executed.{colorClass}` in playground/styles/main.css. */
export const STAGE_COLOR: Record<string, string> = {
  lexer: "#7bdff2",
  validate: "#ffa07a",
  cache: "#ff6ec7",
  parser: "#c7a9ff",
  compiler: "#90e0ef",
  async: "#ff9b54",
  vm: "#faff69",
  normalizer: "#c7a9ff",
  readwrite: "#ff6ec7",
  dag: "#ff9b54",
  result: "#b5e48c",
  classify: "#faff69",
}

/**
 * A single stage in the vertical pipeline flow diagram. Collapsed by
 * default: the header row alone shows step, icon, label, a compact preview,
 * time, and a chevron. Ported from playground's PipelineStage.vue.
 */
export function PipelineStage({
  stepNumber,
  icon,
  label,
  colorClass,
  timeLabel,
  activeLine,
  preview,
  isResult,
  isGate,
  executed,
  hasError,
  skipped,
  collapsed,
  onToggle,
  pulsing,
  output,
  detail,
}: {
  stepNumber: number
  icon: string
  label: string
  colorClass: string
  timeLabel: string
  activeLine: string
  preview?: string
  isResult?: boolean
  isGate?: boolean
  executed?: boolean
  hasError?: boolean
  skipped?: boolean
  collapsed: boolean
  onToggle: (value: boolean) => void
  pulsing?: boolean
  output?: ReactNode
  detail?: ReactNode
}) {
  const accent = executed ? STAGE_COLOR[colorClass] : undefined

  return (
    <div
      className={cn(
        "rounded-md border-l-2 border transition-colors",
        hasError && "border-destructive bg-destructive/5",
        skipped && "opacity-50",
        pulsing && "ring-primary/40 ring-2",
      )}
      style={!hasError ? { borderLeftColor: accent } : undefined}
    >
      <div
        role="button"
        aria-expanded={!collapsed}
        onClick={() => onToggle(!collapsed)}
        className={cn("hover:bg-muted/50 flex cursor-pointer items-center gap-2 px-3 py-1.5", pulsing && "bg-primary/5")}
      >
        <span
          className="flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
          style={executed ? { background: accent + "22", color: accent } : undefined}
        >
          {stepNumber}
        </span>
        <span className="shrink-0 text-sm">{icon}</span>
        <span className="shrink-0 text-xs font-semibold">{label}</span>
        {isGate && (
          <span
            title="Gate — this step can pass, fail, or branch the pipeline (e.g. skip later stages), unlike a straight-line processing step"
            className="text-muted-foreground bg-muted shrink-0 rounded px-1 text-[9px] font-bold uppercase"
          >
            Gate
          </span>
        )}
        {preview && <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-[10px]">{preview}</span>}
        <span className="text-muted-foreground ml-auto shrink-0 font-mono text-[10px]">{activeLine}</span>
        <span className="text-muted-foreground shrink-0 font-mono text-[10px]">{timeLabel}</span>
        <ChevronRight className={cn("text-muted-foreground size-3.5 shrink-0 transition-transform", !collapsed && "rotate-90")} />
      </div>
      {!collapsed && (
        <div className="border-t px-3 py-2">
          <div className={cn(isResult && "flex items-center justify-center py-2")}>{output ?? <span className="text-muted-foreground text-xs">—</span>}</div>
          {detail && <div className="mt-2 border-t pt-2">{detail}</div>}
        </div>
      )}
    </div>
  )
}
