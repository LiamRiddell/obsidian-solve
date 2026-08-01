import type { LucideIcon } from "lucide-react"

/**
 * Icon + text + hint "nothing to show yet" pattern, standardized across
 * every diagnostic tab. Ported from playground's EmptyState.vue.
 */
export function EmptyState({
  icon: Icon,
  text,
  hint,
}: {
  icon: LucideIcon
  text: string
  hint?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <Icon className="text-muted-foreground/50 size-8" strokeWidth={1.5} />
      <div className="text-muted-foreground text-sm">{text}</div>
      {hint && <div className="text-muted-foreground/70 text-xs">{hint}</div>}
    </div>
  )
}
