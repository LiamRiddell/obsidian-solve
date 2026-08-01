import type { ComponentProps } from "react"
import { GripVertical } from "lucide-react"
import { Group, Panel, Separator } from "react-resizable-panels"

import { cn } from "@/lib/utils"

function ResizablePanelGroup({
  className,
  ...props
}: ComponentProps<typeof Group>) {
  // No orientation-conditional class needed here: the library sets its own
  // inline `flex-flow: row | column` on this element based on the
  // `orientation` prop, which always wins over anything set via className.
  return <Group className={cn("flex h-full w-full", className)} {...props} />
}

function ResizablePanel({ ...props }: ComponentProps<typeof Panel>) {
  return <Panel {...props} />
}

/**
 * `aria-orientation` on the rendered separator describes the SEPARATOR's
 * own visual axis, not the Group's `orientation` prop directly — a Group
 * with `orientation="horizontal"` (panels side by side) renders a VERTICAL
 * divider line between them, so its separator gets `aria-orientation="vertical"`.
 * That's our primary case here (editor | diagnostics), so the unconditioned
 * base classes below style a vertical bar; the `aria-[orientation=horizontal]`
 * variant covers the flipped case (a Group stacked top/bottom, divided by a
 * horizontal bar) — confirmed against the actual rendered attribute in the
 * browser, not assumed from the old (different-API) react-resizable-panels
 * version most "resizable" shadcn snippets online are still written against.
 */
function ResizableHandle({
  withHandle,
  className,
  ...props
}: ComponentProps<typeof Separator> & {
  withHandle?: boolean
}) {
  return (
    <Separator
      className={cn(
        "group bg-border hover:bg-primary/60 focus-visible:ring-ring data-[separator=active]:bg-primary relative flex w-px shrink-0 cursor-col-resize items-center justify-center self-stretch transition-colors after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:cursor-row-resize aria-[orientation=horizontal]:self-auto aria-[orientation=horizontal]:after:inset-x-0 aria-[orientation=horizontal]:after:inset-y-auto aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:top-1/2 aria-[orientation=horizontal]:after:h-1 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="bg-border group-data-[separator=active]:bg-primary group-data-[separator=active]:border-primary/30 z-10 flex h-4 w-3 items-center justify-center rounded-xs border transition-colors">
          <GripVertical className="size-2.5" />
        </div>
      )}
    </Separator>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
