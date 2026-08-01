import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, ChevronRight, Clock, GitMerge, Zap, Ear, LoaderCircle } from "lucide-react"
import { useStreamStore, groupEvents } from "@/stores/stream"
import { useDiagnosticReportStore } from "@/stores/diagnosticReport"
import { fmt } from "@bridge/utils"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/** Acronyms that should stay fully uppercase instead of naive per-word title-casing. */
const ACRONYMS = new Set(["vm", "dag", "ip"])

/** Humanize an event type string (e.g. "vm_halt" -> "VM Halt"). */
function fmtType(type: string): string {
  return type
    .split("_")
    .map((word) => (ACRONYMS.has(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ")
}

function fmtClock(ts: number): string {
  const d = new Date(ts)
  return (
    d.getHours().toString().padStart(2, "0") +
    ":" +
    d.getMinutes().toString().padStart(2, "0") +
    ":" +
    d.getSeconds().toString().padStart(2, "0") +
    "." +
    d.getMilliseconds().toString().padStart(3, "0")
  )
}

/** Ported from playground's StreamTab.vue. */
export function StreamTab() {
  const events = useStreamStore((s) => s.events)
  const streamingActive = useStreamStore((s) => s.streamingActive)
  const batcherData = useDiagnosticReportStore((s) => s.batcherMetrics)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const stickToBottom = useRef(true)

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [typeFilter, setTypeFilter] = useState("")

  const grouped = useMemo(() => Array.from(groupEvents(events).entries()), [events])

  const filteredGroups = useMemo(() => {
    const q = typeFilter.trim().toLowerCase()
    if (!q) return grouped
    return grouped
      .map(([key, evts]) => [key, evts.filter((e) => e.type.toLowerCase().includes(q))] as const)
      .filter(([, evts]) => evts.length > 0)
  }, [grouped, typeFilter])

  const allCollapsed = filteredGroups.length > 0 && filteredGroups.every(([key]) => collapsedGroups.has(key))

  function collapseAll() {
    if (allCollapsed) {
      setCollapsedGroups(new Set())
    } else {
      setCollapsedGroups(new Set(filteredGroups.map(([key]) => key)))
    }
  }

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Auto-scroll to bottom when events are added — but only if the user
  // hasn't manually scrolled away from the bottom.
  useEffect(() => {
    if (!stickToBottom.current) return
    const el = containerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [events.length])

  function onScroll() {
    const el = containerRef.current
    if (!el) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-1.5">
        <span
          className={cn("flex items-center gap-1 text-xs", streamingActive && "text-primary")}
        >
          {events.length} events
          {streamingActive && (
            <span className="flex items-center gap-1">
              · <LoaderCircle className="size-3 animate-spin" /> live
            </span>
          )}
        </span>
        <Input
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          placeholder="Filter by event type…"
          spellCheck={false}
          className="h-7 max-w-50 text-xs"
        />
        <button
          type="button"
          onClick={collapseAll}
          className="text-muted-foreground hover:bg-accent ml-auto flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
        >
          {allCollapsed ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          {allCollapsed ? "Expand all" : "Collapse all"}
        </button>
      </div>

      {batcherData && (
        <div className="bg-muted/30 border-b px-4 py-2">
          <div className="flex flex-wrap items-center gap-3">
            <span
              title="The batcher collapses multiple async resolutions into a single DAG walk + re-execution pass. When >50 lines are affected, execution is offloaded to a worker pool to prevent UI freezes."
              className="text-xs font-medium"
            >
              Async Resolution Batcher
            </span>
            <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
              <span title="Pending — awaiting async resolution" className="flex items-center gap-1">
                <Clock className="size-3" /> {batcherData.pendingCount} pending
              </span>
              <span title="Deduped — identical in-flight resolutions merged into one" className="flex items-center gap-1">
                <GitMerge className="size-3" /> {batcherData.dedupCount} deduped
              </span>
              <span title="Offloaded — re-execution handed to a worker pool (>50 lines affected)" className="flex items-center gap-1">
                <Zap className="size-3" /> {batcherData.workerOffloadCount} offloaded
              </span>
              <span title="Listeners — components waiting on a resolution" className="flex items-center gap-1">
                <Ear className="size-3" /> {batcherData.listenerCount} listeners
              </span>
            </div>
          </div>
        </div>
      )}

      <div ref={containerRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <div className="text-muted-foreground p-3 text-center text-sm">No diagnostic events</div>
        ) : filteredGroups.length === 0 ? (
          <div className="text-muted-foreground p-3 text-center text-sm">No events match &ldquo;{typeFilter}&rdquo;</div>
        ) : (
          filteredGroups.map(([groupKey, evts]) => {
            const collapsed = collapsedGroups.has(groupKey)
            const isAsync = evts.some((e) => e.type.startsWith("async_"))
            return (
              <div key={groupKey} className="border-b">
                <div
                  onClick={() => toggleGroup(groupKey)}
                  className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 px-4 py-1.5"
                >
                  {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                  <span
                    className={cn(
                      "flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-xs",
                      isAsync ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {isAsync ? <Clock className="size-3" /> : "#"} {groupKey}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {evts.length} event{evts.length !== 1 ? "s" : ""}
                  </span>
                </div>
                {!collapsed && (
                  <div className="flex flex-col">
                    {evts.map((evt, i) => (
                      <div key={i} className="grid grid-cols-[4rem_5rem_9rem_1fr] items-center gap-2 px-4 py-1 font-mono text-xs">
                        <span className="text-muted-foreground">{evt.elapsedNs > 0 ? fmt(evt.elapsedNs) : "—"}</span>
                        <span className="text-muted-foreground/70">{fmtClock(evt.timestamp)}</span>
                        <span className="text-violet-600 dark:text-violet-400">{fmtType(evt.type)}</span>
                        <span className="truncate">
                          {evt.expression}
                          {evt.details && <span className="text-muted-foreground ml-2">{evt.details}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
