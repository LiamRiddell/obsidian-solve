import { useEffect, useMemo, useState } from "react"
import { Settings, CloudCog, Package } from "lucide-react"
import {
  useWorkersStore,
  engineStatus,
  engineAvgLatency,
  engineLatencyBarClass,
  engineLatencyBarPct,
  engineLastRunAgo,
  qcStatus,
  qcHasData,
  qcLastActivityAgo,
} from "@/stores/workers"
import { useDiagnosticReportStore } from "@/stores/diagnosticReport"
import { formatDuration } from "@bridge/utils"
import { Card, CardFooter, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"

function formatTime(ts: number): string {
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

/** Ported from playground's WorkersTab.vue. */
export function WorkersTab() {
  const engine = useWorkersStore((s) => s.engine)
  const queryCache = useWorkersStore((s) => s.queryCache)
  const queryClientConfig = useWorkersStore((s) => s.queryClientConfig)
  const activityLog = useWorkersStore((s) => s.activityLog)
  const cacheSnapshot = useDiagnosticReportStore((s) => s.cacheSnapshot)

  // "Last run"/"Last activity" are relative-time strings computed fresh on
  // every render — without a ticking re-render trigger they'd only update
  // when some OTHER piece of state happened to change, going stale the
  // moment the engine and query cache go idle.
  const [, forceTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const recentLog = useMemo(() => activityLog.slice(-30), [activityLog])
  const bytecodeEntries = cacheSnapshot?.bytecode ?? []
  const bytecodeTotals = useMemo(
    () => ({
      opcodes: bytecodeEntries.reduce((sum, e) => sum + e.opcodesLength, 0),
      constants: bytecodeEntries.reduce((sum, e) => sum + e.numbersLength + e.stringsLength, 0),
      asyncCount: bytecodeEntries.filter((e) => e.hasAsync).length,
    }),
    [bytecodeEntries],
  )

  const latencyBarClass = engineLatencyBarClass(engine).trim()

  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-4">
      {/* Engine Worker Card */}
      <Card size="sm" className="gap-0 py-0">
        <CardHeader className="bg-muted/50 flex-row items-center gap-2 border-b py-2">
          <Settings className="text-muted-foreground size-4" />
          <span className="text-sm font-medium">Engine Worker</span>
          <span
            className={cn(
              "ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
              engineStatus(engine) === "busy" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground",
            )}
          >
            {engineStatus(engine)}
          </span>
        </CardHeader>
        <div className="grid grid-cols-3 gap-3 px-4 py-2 text-xs">
          <Metric label="Latency" value={engineAvgLatency(engine) > 0 ? `${engineAvgLatency(engine).toFixed(2)} ms` : "—"} />
          <Metric label="Queue depth" value={String(engine.queueDepth)} />
          <Metric label="Last run" value={engineLastRunAgo(engine)} />
        </div>
        <div className="px-4 pb-1">
          <div className="bg-muted h-1.5 overflow-hidden rounded-full">
            <div
              className={cn(
                "h-full rounded-full",
                latencyBarClass === "slow" ? "bg-destructive" : latencyBarClass === "warn" ? "bg-amber-500" : "bg-emerald-500",
              )}
              style={{ width: `${engineLatencyBarPct(engine)}%` }}
            />
          </div>
          <div className="text-muted-foreground/70 mt-0.5 flex justify-between text-[10px]">
            <span>0</span>
            <span>10ms</span>
            <span>50ms</span>
            <span>100ms+</span>
          </div>
        </div>
        <CardFooter className="text-muted-foreground flex items-center justify-between py-1.5 text-xs">
          <span>Messages received</span>
          <span className="font-mono">{engine.msgCount}</span>
        </CardFooter>
      </Card>

      {/* Query Cache Card */}
      <Card size="sm" className="gap-0 py-0">
        <CardHeader className="bg-muted/50 flex-row items-center gap-2 border-b py-2">
          <CloudCog className="text-muted-foreground size-4" />
          <span className="text-sm font-medium">Query Cache</span>
          <span
            className={cn(
              "ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
              qcHasData(queryCache) ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground",
            )}
          >
            {qcStatus(queryCache)}
          </span>
        </CardHeader>
        <div className="grid grid-cols-3 gap-3 px-4 py-2 text-xs">
          <Metric label="Total queries" value={String(queryCache.totalQueries)} />
          <Metric label="Fresh" value={String(queryCache.freshQueries)} className="text-emerald-600 dark:text-emerald-400" />
          <Metric label="Stale" value={String(queryCache.staleQueries)} className="text-amber-600 dark:text-amber-400" />
          <Metric label="Fetching" value={String(queryCache.fetchingQueries)} className="text-blue-600 dark:text-blue-400" />
          <Metric label="Errors" value={String(queryCache.errorQueries)} className="text-destructive" />
          <Metric label="Last activity" value={qcLastActivityAgo(queryCache)} />
        </div>
        <div className="px-4 pb-2 text-xs">
          <Metric
            label="Default staleTime / gcTime"
            value={`${formatDuration(queryClientConfig.staleTime)} / ${formatDuration(queryClientConfig.gcTime)}`}
          />
        </div>
        <CardFooter className="text-muted-foreground flex items-center justify-between py-1.5 text-xs">
          <span>Provider</span>
          <span className="font-mono">@tanstack/query-core</span>
        </CardFooter>
      </Card>

      {/* Compiled Bytecode Card */}
      <Card size="sm" className="gap-0 py-0">
        <CardHeader className="bg-muted/50 flex-row items-center gap-2 border-b py-2">
          <Package className="text-muted-foreground size-4" />
          <span className="text-sm font-medium">Compiled Bytecode</span>
          <span
            className={cn(
              "ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
              bytecodeEntries.length > 0 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground",
            )}
          >
            {bytecodeEntries.length > 0 ? "populated" : "empty"}
          </span>
        </CardHeader>
        <div className="grid grid-cols-2 gap-3 px-4 py-2 text-xs">
          <Metric label="Cached programs" value={String(bytecodeEntries.length)} />
          <Metric label="Total opcodes" value={String(bytecodeTotals.opcodes)} />
          <Metric label="Total constants" value={String(bytecodeTotals.constants)} />
          <Metric label="Async-aware programs" value={String(bytecodeTotals.asyncCount)} />
        </div>
        <CardFooter className="text-muted-foreground flex items-center justify-between py-1.5 text-xs">
          <span>Source</span>
          <span className="font-mono">ExpressionEngine bytecode cache</span>
        </CardFooter>
      </Card>

      {/* Activity Log */}
      <Card size="sm" className="gap-0 py-0">
        <CardHeader className="border-b py-2">
          <h4 className="text-sm font-medium">Activity Log</h4>
        </CardHeader>
        <div className="max-h-70 overflow-y-auto">
          {activityLog.length === 0 ? (
            <div className="text-muted-foreground p-3 text-sm">No worker activity yet</div>
          ) : (
            recentLog.map((entry, i) => (
              <div key={i} className="grid grid-cols-[6rem_4.5rem_1fr] items-center gap-2 border-t px-4 py-1 font-mono text-xs">
                <span className="text-muted-foreground/70">{formatTime(entry.ts)}</span>
                <span className={cn("rounded px-1 text-[10px]", entry.source === "engine" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-violet-500/10 text-violet-600 dark:text-violet-400")}>
                  {entry.source === "query-cache" ? "query" : entry.source}
                </span>
                <span className={cn("truncate", entry.error && "text-destructive")}>{entry.msg}</span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  )
}

function Metric({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground/70">{label}</span>
      <span className={cn("font-mono font-semibold", className)}>{value}</span>
    </div>
  )
}
