import type { ReactNode } from "react"
import {
  ChevronRight,
  Shield,
  Play,
  Type,
  ListChecks,
  RefreshCw,
  Save,
  Network,
  Settings,
  Clock,
  Zap,
  Link,
  Package,
  Check,
  Square,
  type LucideIcon,
} from "lucide-react"
import { stageIcon } from "@bridge/utils"
import { cn } from "@/lib/utils"

/**
 * Maps a stage's `colorClass` to its accent color, drawn from the app's
 * `--chart-1..8` categorical palette (index.css, ported from the shared
 * design-token source) instead of bespoke hex — so pipeline-stage colors
 * stay part of the same CVD-validated system every other chart/dataviz
 * surface uses. Only 8 chart colors exist for 12 stage categories, so a
 * few reuse a color; pairings were chosen so reused colors never land on
 * two stages that appear adjacent in the pipeline flow.
 */
export const STAGE_COLOR: Record<string, string> = {
  classify: "var(--chart-1)",
  validate: "var(--chart-2)",
  lexer: "var(--chart-3)",
  normalizer: "var(--chart-4)",
  readwrite: "var(--chart-5)",
  cache: "var(--chart-6)",
  parser: "var(--chart-7)",
  compiler: "var(--chart-8)",
  async: "var(--chart-2)",
  vm: "var(--chart-1)",
  dag: "var(--chart-6)",
  result: "var(--chart-1)",
}

/** lucide-react icon components, keyed by the names `stageIcon()` (packages/playground-bridge) maps the engine's emoji stage icons to. */
const STAGE_ICONS: Record<string, LucideIcon> = {
  Shield,
  Play,
  Type,
  ListChecks,
  RefreshCw,
  Save,
  Network,
  Settings,
  Clock,
  Zap,
  Link,
  Package,
  Check,
  Square,
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
  const Icon = STAGE_ICONS[stageIcon(icon)]

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
        {Icon ? <Icon className="text-muted-foreground size-3.5 shrink-0" /> : <span className="shrink-0 text-sm">{icon}</span>}
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
