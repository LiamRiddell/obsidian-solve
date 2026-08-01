import { useEffect, useMemo, useState } from "react"
import { Database, Grid3x3, Braces, BarChart3, Table, Radio, CloudCog, TrendingUp, TrendingDown, ArrowRight, ChevronDown, ChevronRight } from "lucide-react"
import type { QueryCacheEntry } from "@bridge/engine"
import type { CacheHistoryEntry } from "@/stores/diagnosticReport"
import { useDiagnosticReportStore } from "@/stores/diagnosticReport"
import { formatDuration } from "@bridge/utils"
import { EmptyState } from "@/components/shared/EmptyState"
import { cn } from "@/lib/utils"

function hitRatePct(entry: CacheHistoryEntry): number {
  const total = entry.cacheHits + entry.cacheMisses
  return total > 0 ? Math.round((entry.cacheHits / total) * 100) : 0
}

function formatAge(createdAt: number, nowMs: number): string {
  const diffMs = nowMs - createdAt
  if (diffMs < 0) return "just now"
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  return `${Math.floor(min / 60)}h`
}

function freshnessPct(entry: QueryCacheEntry, nowMs: number): number {
  if (!entry.staleTime || entry.staleTime <= 0) return 0
  const elapsed = nowMs - entry.updatedAt
  return Math.min(100, Math.max(0, (elapsed / entry.staleTime) * 100))
}

function freshnessBarClass(entry: QueryCacheEntry, nowMs: number): "bg-emerald-500" | "bg-amber-500" | "bg-destructive" {
  if (!entry.staleTime || entry.staleTime <= 0) return "bg-emerald-500"
  const pct = freshnessPct(entry, nowMs)
  if (pct < 50) return "bg-emerald-500"
  if (pct < 90) return "bg-amber-500"
  return "bg-destructive"
}

function freshnessBarTitle(entry: QueryCacheEntry, nowMs: number): string {
  if (!entry.staleTime || entry.staleTime <= 0) return "Never stale"
  const elapsed = nowMs - entry.updatedAt
  const remaining = Math.max(0, entry.staleTime - elapsed)
  if (remaining <= 0) return "Stale — data may be refetched on next access"
  const sec = Math.floor(remaining / 1000)
  if (sec < 60) return `${sec}s until stale`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m until stale`
  return `${Math.floor(min / 60)}h until stale`
}

/** Ported from playground's CacheTab.vue. */
export function CacheTab() {
  const cache = useDiagnosticReportStore((s) => s.cacheSnapshot)
  const heatmapEntries = useDiagnosticReportStore((s) => s.pageHeatmap)
  const queryCacheEntries = useDiagnosticReportStore((s) => s.queryCache)
  const cacheHistoryEntries = useDiagnosticReportStore((s) => s.cacheHistory)

  const [nowMs, setNowMs] = useState(() => Date.now())
  const [trendView, setTrendView] = useState<"hitmiss" | "size">("hitmiss")
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  function toggleExpand(key: string) {
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const resolvedLineCount = (cache?.lineCache ?? []).filter((e) => e.resultType !== "Pending").length
  const asyncCacheEntries = cache?.asyncCache ?? []
  const queryCacheFreshCount = queryCacheEntries.filter((e) => e.status === "fresh").length
  const queryCacheStaleCount = queryCacheEntries.filter((e) => e.status === "stale").length

  const overallHitRate = useMemo(() => {
    if (cacheHistoryEntries.length === 0) return 0
    let totalHits = 0,
      totalLines = 0
    for (const e of cacheHistoryEntries) {
      totalHits += e.cacheHits
      totalLines += e.cacheHits + e.cacheMisses
    }
    return totalLines > 0 ? Math.round((totalHits / totalLines) * 100) : 0
  }, [cacheHistoryEntries])

  const maxHitMissTotal = useMemo(() => Math.max(0, ...cacheHistoryEntries.map((e) => e.cacheHits + e.cacheMisses)), [cacheHistoryEntries])
  const maxBytecodeSize = useMemo(() => Math.max(0, ...cacheHistoryEntries.map((e) => e.bytecodeCacheSize)), [cacheHistoryEntries])

  function hitBarPct(entry: CacheHistoryEntry) {
    return maxHitMissTotal === 0 ? 0 : Math.round((entry.cacheHits / maxHitMissTotal) * 100)
  }
  function missBarPct(entry: CacheHistoryEntry) {
    return maxHitMissTotal === 0 ? 0 : Math.round((entry.cacheMisses / maxHitMissTotal) * 100)
  }
  function bytecodeBarPct(entry: CacheHistoryEntry) {
    return maxBytecodeSize === 0 ? 0 : Math.round((entry.bytecodeCacheSize / maxBytecodeSize) * 100)
  }

  const preloadDirection = useMemo<"forward" | "backward" | "stable" | null>(() => {
    if (heatmapEntries.length < 2) return null
    const trend = heatmapEntries.reduce((acc, entry, i) => {
      if (i === 0) return 0
      const diff = entry.accessSeq - heatmapEntries[i - 1].accessSeq
      return acc + (diff > 0 ? 1 : diff < 0 ? -1 : 0)
    }, 0)
    if (trend > 0) return "forward"
    if (trend < 0) return "backward"
    return "stable"
  }, [heatmapEntries])

  const preloadDirectionTitle =
    preloadDirection === "forward"
      ? "Heuristic: recently-accessed pages trend toward higher page numbers"
      : preloadDirection === "backward"
        ? "Heuristic: recently-accessed pages trend toward lower page numbers"
        : preloadDirection === "stable"
          ? "Heuristic: no clear directional trend in recent page access"
          : ""

  if (!cache) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <EmptyState icon={Database} text="No cache data" hint="Evaluate an expression to see cache diagnostics." />
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      {/* Page Cache */}
      {heatmapEntries.length > 0 && (
        <div>
          <div className="text-muted-foreground mb-1.5 text-[10px] font-semibold tracking-wide uppercase">Page Cache</div>
          <div className="rounded-md border">
            <div className="bg-muted/50 flex flex-wrap items-center gap-2 border-b px-3 py-1.5">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Grid3x3 className="size-3.5" /> Page Heatmap
              </span>
              <span className="text-muted-foreground text-xs">{heatmapEntries.length} pages · 128 lines/page</span>
              {preloadDirection && (
                <span title={preloadDirectionTitle} className="text-primary ml-auto flex items-center gap-1 text-xs">
                  {preloadDirection === "forward" ? <TrendingUp className="size-3" /> : preloadDirection === "backward" ? <TrendingDown className="size-3" /> : <ArrowRight className="size-3" />}
                  {preloadDirection} (recent trend)
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 p-3">
              {heatmapEntries.map((page) => (
                <div
                  key={page.pageNum}
                  title={`Page ${page.pageNum} (L${page.startLine}-${page.endLine})\nTemp: ${page.temperature}\nAccess: #${page.accessSeq}`}
                  className={cn(
                    "flex w-16 flex-col items-center rounded-md border px-1.5 py-1 text-center",
                    page.temperature === "hot" && "border-destructive/30 bg-destructive/10",
                    page.temperature === "warm" && "border-amber-500/30 bg-amber-500/10",
                    page.temperature === "cold" && "bg-muted",
                  )}
                >
                  <span className="text-xs font-bold">{page.pageNum}</span>
                  <span className="text-muted-foreground text-[9px]">
                    {page.startLine}–{page.endLine}
                  </span>
                </div>
              ))}
            </div>
            <div className="text-muted-foreground flex flex-wrap items-center gap-3 border-t px-3 py-1.5 text-[10px]">
              <span className="text-destructive">● Hot</span>
              <span className="text-amber-600 dark:text-amber-400">● Warm</span>
              <span>● Cold</span>
              <span>Hot = viewport ±3 pages · Warm = viewport ±6 pages · Cold = beyond</span>
            </div>
          </div>
        </div>
      )}

      {/* Bytecode & Line Cache */}
      <div className="space-y-3">
        <div className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">Bytecode &amp; Line Cache</div>

        <div className="rounded-md border">
          <div className="bg-muted/50 flex items-center gap-2 border-b px-3 py-1.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Braces className="size-3.5" /> Bytecode Cache
            </span>
            <span className="text-muted-foreground ml-auto text-xs">{cache.bytecode.length} entries</span>
          </div>
          {cache.bytecode.length === 0 ? (
            <div className="text-muted-foreground p-3 text-center text-sm">No bytecode cache entries</div>
          ) : (
            <div className="p-1">
              <div className="text-muted-foreground px-2 py-1 text-[10px]">
                op = opcodes, num = numeric constants, str = string constants; async = contains an async-resolved data source.
              </div>
              {cache.bytecode.map((entry) => (
                <div key={entry.expression} className="hover:bg-muted/50 flex items-center gap-2 rounded-sm px-2 py-1 font-mono text-xs">
                  <span className="min-w-0 flex-1 truncate">{entry.expression}</span>
                  <span className="text-muted-foreground shrink-0 text-[10px]">
                    {entry.opcodesLength} op · {entry.numbersLength} num · {entry.stringsLength} str
                    {entry.hasAsync ? " · async" : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {cacheHistoryEntries.length > 1 && (
          <div className="rounded-md border">
            <div className="bg-muted/50 flex flex-wrap items-center gap-2 border-b px-3 py-1.5">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <BarChart3 className="size-3.5" /> Cache Trends
              </span>
              <span className="text-muted-foreground text-xs">Last {cacheHistoryEntries.length} runs</span>
              <div className="ml-auto flex gap-1">
                <button
                  type="button"
                  onClick={() => setTrendView("hitmiss")}
                  className={cn("rounded px-2 py-0.5 text-[10px]", trendView === "hitmiss" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}
                >
                  Hit/Miss
                </button>
                <button
                  type="button"
                  onClick={() => setTrendView("size")}
                  className={cn("rounded px-2 py-0.5 text-[10px]", trendView === "size" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}
                >
                  Size
                </button>
              </div>
            </div>
            <div className="space-y-1 p-3">
              {trendView === "hitmiss" ? (
                <>
                  {cacheHistoryEntries.map((entry) => (
                    <div
                      key={entry.runId}
                      title={`Run #${entry.runId}: ${entry.cacheHits} hits / ${entry.cacheMisses} misses = ${hitRatePct(entry)}% hit rate`}
                      className="grid grid-cols-[3rem_1fr_2.5rem] items-center gap-2 text-[10px]"
                    >
                      <span className="text-muted-foreground font-mono">#{entry.runId}</span>
                      <div className="bg-muted flex h-3 overflow-hidden rounded-sm">
                        <div className="flex items-center justify-center bg-emerald-500/60 text-[8px] text-white" style={{ width: `${hitBarPct(entry)}%` }}>
                          {entry.cacheHits || ""}
                        </div>
                        <div className="bg-destructive/60 flex items-center justify-center text-[8px] text-white" style={{ width: `${missBarPct(entry)}%` }}>
                          {entry.cacheMisses || ""}
                        </div>
                      </div>
                      <span className="text-muted-foreground text-right">{hitRatePct(entry)}%</span>
                    </div>
                  ))}
                  <div className="text-muted-foreground flex items-center gap-3 pt-1 text-[9px]">
                    <span className="text-emerald-600 dark:text-emerald-400">■ Hit</span>
                    <span className="text-destructive">■ Miss</span>
                    <span className="ml-auto">Overall: {overallHitRate}%</span>
                  </div>
                </>
              ) : (
                <>
                  {cacheHistoryEntries.map((entry) => (
                    <div key={entry.runId} title={`Run #${entry.runId}: ${entry.bytecodeCacheSize} bytecode entries`} className="grid grid-cols-[3rem_1fr_2.5rem] items-center gap-2 text-[10px]">
                      <span className="text-muted-foreground font-mono">#{entry.runId}</span>
                      <div className="bg-muted h-3 overflow-hidden rounded-sm">
                        <div className="bg-primary/60 h-full" style={{ width: `${bytecodeBarPct(entry)}%` }} />
                      </div>
                      <span className="text-muted-foreground text-right">{entry.bytecodeCacheSize}</span>
                    </div>
                  ))}
                  <div className="text-muted-foreground pt-1 text-[9px]">
                    Max: {maxBytecodeSize} · Now: {cache.bytecode.length}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div className="rounded-md border">
          <div className="bg-muted/50 flex items-center gap-2 border-b px-3 py-1.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Table className="size-3.5" /> Line Cache
            </span>
            <span className="text-muted-foreground ml-auto text-xs">
              {cache.lineCache.length} entries · {resolvedLineCount} resolved
            </span>
          </div>
          {cache.lineCache.length === 0 ? (
            <div className="text-muted-foreground p-3 text-center text-sm">No line cache entries</div>
          ) : (
            <div className="p-1">
              {cache.lineCache.map((entry) => (
                <div key={entry.key} className="hover:bg-muted/50 flex flex-wrap items-center gap-2 rounded-sm px-2 py-1 font-mono text-xs">
                  <span className="text-muted-foreground w-8 shrink-0">L{entry.lineNumber}</span>
                  <span className="min-w-0 flex-1 truncate">{entry.resultValue}</span>
                  <span className="text-muted-foreground shrink-0 text-[10px]">{entry.resultType}</span>
                  {entry.reads.length > 0 && (
                    <span className="flex flex-wrap gap-1">
                      {entry.reads.map((r) => (
                        <span key={r} className="bg-muted rounded px-1 text-[10px]">
                          {r}
                        </span>
                      ))}
                    </span>
                  )}
                  {entry.writeVar && <span className="bg-muted rounded px-1 text-[10px]">→ {entry.writeVar}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Async Data */}
      {(queryCacheEntries.length > 0 || asyncCacheEntries.length > 0) && (
        <div className="space-y-3">
          <div className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">Async Data</div>

          {asyncCacheEntries.length > 0 && (
            <div className="rounded-md border">
              <div className="bg-muted/50 flex items-center gap-2 border-b px-3 py-1.5">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Radio className="size-3.5" /> Async Resolver Cache
                </span>
                <span className="text-muted-foreground ml-auto text-xs">
                  {asyncCacheEntries.length} package{asyncCacheEntries.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="divide-y">
                {asyncCacheEntries.map((pkg) => (
                  <div key={pkg.packageId} className="flex flex-col gap-1 p-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-semibold">{pkg.packageId}</span>
                      <span className="text-emerald-600 dark:text-emerald-400">{pkg.resolvedCount} resolved</span>
                      <span className="text-amber-600 dark:text-amber-400">{pkg.inFlightCount} in-flight</span>
                      <span className={pkg.errorCount > 0 ? "text-destructive" : "text-muted-foreground"}>
                        {pkg.errorCount} error{pkg.errorCount !== 1 ? "s" : ""}
                      </span>
                      {pkg.ttlMs && <span className="text-muted-foreground ml-auto">TTL {formatDuration(pkg.ttlMs)}</span>}
                    </div>
                    {pkg.entries.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {pkg.entries.slice(0, 12).map((e) => (
                          <span
                            key={e.key}
                            title={e.status + (e.errorMessage ? `: ${e.errorMessage}` : "")}
                            className={cn(
                              "rounded px-1.5 py-0.5 font-mono text-[10px]",
                              e.status === "error" ? "bg-destructive/10 text-destructive" : e.status === "in_flight" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-muted",
                            )}
                          >
                            {e.key}
                          </span>
                        ))}
                        {pkg.entries.length > 12 && <span className="text-muted-foreground text-[10px]">+{pkg.entries.length - 12} more</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {queryCacheEntries.length > 0 && (
            <div className="rounded-md border">
              <div className="bg-muted/50 flex items-center gap-2 border-b px-3 py-1.5">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <CloudCog className="size-3.5" /> Query Cache (TanStack)
                </span>
                <span className="text-muted-foreground ml-auto text-xs">
                  {queryCacheEntries.length} entries · {queryCacheFreshCount} fresh · {queryCacheStaleCount} stale
                </span>
              </div>
              <div className="divide-y">
                {queryCacheEntries.map((entry) => {
                  const expanded = !!expandedKeys[entry.queryKey]
                  return (
                    <div key={entry.queryKey}>
                      <div onClick={() => toggleExpand(entry.queryKey)} className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 px-3 py-1.5">
                        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                        <span title={entry.queryKeyArray.join(" / ")} className="min-w-0 flex-1 truncate font-mono text-xs">
                          {entry.queryKey}
                        </span>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                            entry.status === "fresh" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                            entry.status === "stale" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                            entry.status === "fetching" && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                            entry.status === "error" && "bg-destructive/10 text-destructive",
                          )}
                        >
                          {entry.status}
                        </span>
                        <span className="text-muted-foreground text-[10px]">{entry.dataType}</span>
                        <span title={new Date(entry.updatedAt).toLocaleTimeString()} className="text-muted-foreground text-[10px]">
                          {formatAge(entry.updatedAt, nowMs)}
                        </span>
                        <div className="bg-muted h-1.5 w-16 overflow-hidden rounded-full" title={freshnessBarTitle(entry, nowMs)}>
                          <div className={cn("h-full", freshnessBarClass(entry, nowMs))} style={{ width: `${freshnessPct(entry, nowMs)}%` }} />
                        </div>
                      </div>
                      {expanded && (
                        <div className="bg-muted/20 space-y-1.5 px-3 py-2 text-xs">
                          <DetailRow label="Query Key">
                            <span className="flex flex-wrap gap-1">
                              {entry.queryKeyArray.map((seg, i) => (
                                <span key={i} className="bg-muted rounded px-1.5 py-0.5 font-mono text-[10px]">
                                  {seg}
                                </span>
                              ))}
                            </span>
                          </DetailRow>
                          <DetailRow label="Cached Data">
                            <span className="truncate font-mono">{entry.dataPreview}</span>
                          </DetailRow>
                          <DetailRow label="Data Type">{entry.dataType}</DetailRow>
                          <DetailRow label="Status">{entry.status}</DetailRow>
                          <DetailRow label="Freshness">
                            <div className="w-full">
                              <div className="bg-muted h-2 overflow-hidden rounded-full">
                                <div className={cn("h-full", freshnessBarClass(entry, nowMs))} style={{ width: `${freshnessPct(entry, nowMs)}%` }} />
                              </div>
                              <div className="text-muted-foreground mt-0.5 text-[10px]">{freshnessBarTitle(entry, nowMs)}</div>
                            </div>
                          </DetailRow>
                          <DetailRow label="Age">{formatAge(entry.updatedAt, nowMs)}</DetailRow>
                          <DetailRow label="Last Updated">{new Date(entry.updatedAt).toLocaleString()}</DetailRow>
                          <DetailRow label="Stale Time">{formatDuration(entry.staleTime)}</DetailRow>
                          <DetailRow label="Cache Time">
                            {formatDuration(entry.cacheTime)}
                            {entry.cacheTime === Infinity ? " (never evicted)" : ""}
                          </DetailRow>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-start gap-2">
      <span className="text-muted-foreground text-[10px] font-medium uppercase">{label}</span>
      <span>{children}</span>
    </div>
  )
}
