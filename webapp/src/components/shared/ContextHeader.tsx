import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"

/**
 * Sticky "what am I looking at" header shown at the top of a diagnostic
 * tab: an eyebrow label, the active line badge (`L{n}` or "All Lines"),
 * and the expression text being diagnosed.
 *
 * Ported from playground's ContextHeader.vue — used by Pipeline, Normalizer,
 * ParseletRegistry, Bytecode, and VmTrace tabs.
 */
export function ContextHeader({
  label,
  lineBadge,
  expression,
  extra,
}: {
  /** Eyebrow label, e.g. "Normalizing", "Pipeline", "Parselets". */
  label: string
  /** Compact line indicator, e.g. "L3" or "All Lines". */
  lineBadge: string
  /** The active expression text being diagnosed. */
  expression: string
  extra?: ReactNode
}) {
  return (
    <div className="bg-card sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-2">
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </span>
        <Badge variant="secondary">{lineBadge}</Badge>
      </div>
      <span
        className="min-w-0 flex-1 truncate font-mono text-sm"
        title={expression}
      >
        {expression || "(empty expression)"}
      </span>
      {extra && <div className="shrink-0">{extra}</div>}
    </div>
  )
}
