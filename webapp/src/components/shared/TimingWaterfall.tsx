import { useMemo } from "react"
import { fmt } from "@bridge/utils"
import { cn } from "@/lib/utils"

export interface WaterfallSegment {
  /** Stable identifier — echoed back on `onSegmentClick`. */
  key: string
  /** Start time in nanoseconds, relative to the same origin as every other segment on this track. */
  startNs: number
  /** End time in nanoseconds, or `null` for an ongoing/indeterminate segment (renders as a short animated stripe). */
  endNs: number | null
  /** Label shown on the bar itself when it's wide enough, and as the tooltip title fallback. */
  label: string
  /** CSS color for the segment fill. */
  color: string
  status?: "done" | "pending" | "error"
  /** Overrides `label` as the tooltip's bold title line. */
  tooltipTitle?: string
  /** Additional plain lines shown in the tooltip below the title. */
  tooltipLines?: string[]
  dimmed?: boolean
  highlighted?: boolean
}

/**
 * A shared timeline visualization: a ruler with time ticks plus one track
 * of segments positioned by their actual start/end time, in the spirit of
 * Chrome DevTools' Performance panel.
 *
 * Ported from playground's TimingWaterfall.vue — used by both the Pipeline
 * tab's Async Preflight "Resolution Timeline" and the Perf tab's Pipeline
 * Flamegraph.
 */
export function TimingWaterfall({
  segments,
  totalNs,
  tickCount = 4,
  clickable = false,
  onSegmentClick,
}: {
  segments: WaterfallSegment[]
  /** Explicit ruler max, in ns. Defaults to the furthest segment end (or start, for ongoing segments), padded ~8%. */
  totalNs?: number
  /** Number of ruler tick marks (excluding the leading 0). */
  tickCount?: number
  /** Whether segments emit `onSegmentClick` (used for the Perf tab's stage filter). */
  clickable?: boolean
  onSegmentClick?: (key: string) => void
}) {
  const trackMaxNs = useMemo(() => {
    if (totalNs && totalNs > 0) return totalNs
    const ends = segments.map((s) => s.endNs ?? s.startNs)
    return Math.max(...ends, 1) * 1.08
  }, [segments, totalNs])

  const ticks = useMemo(
    () =>
      Array.from({ length: tickCount + 1 }, (_, i) => {
        const pct = (i / tickCount) * 100
        return { pct, label: fmt((pct / 100) * trackMaxNs) }
      }),
    [tickCount, trackMaxNs],
  )

  const positioned = useMemo(
    () =>
      segments.map((seg) => {
        const ongoing = seg.endNs === null
        const end = seg.endNs ?? trackMaxNs
        const startPct = (seg.startNs / trackMaxNs) * 100
        const widthPct = ongoing
          ? Math.max(100 - startPct, 4)
          : Math.max(((end - seg.startNs) / trackMaxNs) * 100, 1.5)
        return { ...seg, startPct, widthPct, showLabel: widthPct > 12 }
      }),
    [segments, trackMaxNs],
  )

  return (
    <div className="w-full">
      <div className="text-muted-foreground relative h-4 text-[10px]">
        {ticks.map((t) => (
          <span
            key={t.pct}
            className="absolute -translate-x-1/2"
            style={{ left: `${t.pct}%` }}
          >
            {t.label}
          </span>
        ))}
      </div>
      <div className="bg-muted relative h-6 w-full overflow-hidden rounded-sm">
        {positioned.map((seg) => (
          <div
            key={seg.key}
            onClick={() => clickable && onSegmentClick?.(seg.key)}
            className={cn(
              "group absolute top-0 h-full rounded-sm transition-opacity",
              seg.dimmed && "opacity-40",
              seg.highlighted && "ring-2 ring-offset-1",
              clickable && "cursor-pointer",
              seg.endNs === null && "animate-pulse",
            )}
            style={{ left: `${seg.startPct}%`, width: `${seg.widthPct}%`, background: seg.color }}
          >
            {seg.showLabel && (
              <span className="absolute inset-0 flex items-center truncate px-1.5 text-[10px] text-white/90">
                {seg.label}
              </span>
            )}
            <div className="bg-popover text-popover-foreground pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 rounded-md border px-2 py-1 text-xs whitespace-nowrap shadow-md group-hover:block">
              <div className="font-semibold" style={{ color: seg.color }}>
                {seg.tooltipTitle ?? seg.label}
              </div>
              {(seg.tooltipLines ?? []).map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
