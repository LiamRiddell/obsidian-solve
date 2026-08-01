import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight, Radio } from "lucide-react"
import { useDiagnosticReportStore } from "@/stores/diagnosticReport"
import { usePipelineStore } from "@/stores/pipeline"
import { cn } from "@/lib/utils"

interface VarEntry {
  variable: string
  consumers: number[]
  producerLine: number | null
}

interface DataSourceEntry {
  key: string
  consumers: number[]
}

interface PerLineDepsEntry {
  lineNumber: number
  sources: string[]
}

/**
 * Dependency graph visualization for variable tracking — a simple tree/list
 * layout rather than a full SVG graph. Ported from playground's DagTab.vue.
 */
export function DagTab() {
  const snap = useDiagnosticReportStore((s) => s.dagSnapshot)
  const selectLineAction = usePipelineStore((s) => s.selectLine)
  const [expandedVars, setExpandedVars] = useState<Set<string>>(new Set())
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set())

  function toggleVar(name: string) {
    setExpandedVars((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function toggleSource(key: string) {
    setExpandedSources((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function selectLine(ln: number) {
    selectLineAction(ln, true)
  }

  const hasData = !!snap && (Object.keys(snap.consumers).length > 0 || Object.keys(snap.reads).length > 0 || Object.keys(snap.dataSourceConsumers).length > 0)

  const nodeCount = snap ? Object.keys(snap.consumers).length : 0
  const edgeCount = snap ? Object.values(snap.consumers).reduce((sum, c) => sum + c.length, 0) : 0
  const sourceCount = Object.keys(snap?.dataSourceConsumers ?? {}).length

  const varEntries = useMemo<VarEntry[]>(() => {
    if (!snap) return []
    const allVars = new Set<string>()
    for (const v of Object.keys(snap.consumers)) allVars.add(v)
    for (const vars of Object.values(snap.writes)) vars.forEach((v) => allVars.add(v))
    for (const vars of Object.values(snap.reads)) vars.forEach((v) => allVars.add(v))

    const producers: Record<string, number> = {}
    for (const [lnStr, vars] of Object.entries(snap.writes)) {
      const ln = Number(lnStr)
      vars.forEach((v) => {
        producers[v] = ln
      })
    }

    return Array.from(allVars)
      .map((variable) => ({
        variable,
        consumers: snap.consumers[variable] ?? [],
        producerLine: producers[variable] ?? null,
      }))
      .sort((a, b) => {
        const la = a.producerLine ?? Infinity
        const lb = b.producerLine ?? Infinity
        if (la !== lb) return la - lb
        return a.variable.localeCompare(b.variable)
      })
  }, [snap])

  const perLineDeps = useMemo<PerLineDepsEntry[]>(() => {
    if (!snap?.dataSourceDeps) return []
    return Object.entries(snap.dataSourceDeps)
      .map(([lnStr, sources]) => ({ lineNumber: Number(lnStr), sources }))
      .filter((e) => e.sources.length > 0)
      .sort((a, b) => a.lineNumber - b.lineNumber)
  }, [snap])

  const dataSourceEntries = useMemo<DataSourceEntry[]>(() => {
    if (!snap) return []
    return Object.entries(snap.dataSourceConsumers)
      .map(([key, consumers]) => ({ key, consumers: [...consumers].sort((a, b) => a - b) }))
      .sort((a, b) => {
        const fa = a.consumers[0] ?? Infinity
        const fb = b.consumers[0] ?? Infinity
        if (fa !== fb) return fa - fb
        return a.key.localeCompare(b.key)
      })
  }, [snap])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-1.5">
        <span className="text-muted-foreground text-xs">
          {nodeCount} variable{nodeCount !== 1 ? "s" : ""} · {edgeCount} read{edgeCount !== 1 ? "s" : ""} · {sourceCount} data source
          {sourceCount !== 1 ? "s" : ""}
        </span>
        <span className="text-muted-foreground/70 ml-auto text-[10px]">Dependency Graph</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!hasData ? (
          <div className="text-muted-foreground p-3 text-sm">No DAG data available</div>
        ) : (
          <>
            {varEntries.map((entry) => {
              const isUnused = !!entry.producerLine && entry.consumers.length === 0
              return (
                <div key={entry.variable} className="border-b">
                  <div
                    onClick={() => toggleVar(entry.variable)}
                    className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 px-3 py-2 select-none"
                  >
                    {expandedVars.has(entry.variable) ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                    <span
                      title={entry.producerLine ? `Go to line ${entry.producerLine}` : "External variable (no producer)"}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (entry.producerLine) selectLine(entry.producerLine)
                      }}
                      className={cn(
                        "flex min-w-8.5 shrink-0 items-center justify-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                        entry.producerLine
                          ? "cursor-pointer border-cyan-500/20 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
                          : "text-muted-foreground border-muted-foreground/20 bg-muted text-[9px] font-normal tracking-wide uppercase",
                      )}
                    >
                      {entry.producerLine ? `L${entry.producerLine}` : "ext"}
                    </span>
                    <span className="text-primary min-w-0 flex-1 truncate font-mono text-sm">{entry.variable}</span>
                    <span className="flex shrink-0 gap-1.5">
                      {isUnused ? (
                        <span title="Defined but never read anywhere in this document" className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-medium text-cyan-600 dark:text-cyan-400">
                          unused
                        </span>
                      ) : (
                        <span title={`Read by ${entry.consumers.length} lines`} className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-medium text-sky-600 dark:text-sky-400">
                          {entry.consumers.length} read{entry.consumers.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </span>
                  </div>
                  {expandedVars.has(entry.variable) && (
                    <div className="px-3 pb-2 pl-9">
                      <div className="text-muted-foreground mb-1 text-[9px] tracking-wide uppercase">Consumers (lines that read this variable):</div>
                      {entry.consumers.length === 0 ? (
                        <div className="text-muted-foreground py-1 text-[10px] italic">No consumers</div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {entry.consumers.map((ln) => (
                            <span
                              key={ln}
                              onClick={() => selectLine(ln)}
                              className="bg-muted hover:bg-accent cursor-pointer rounded px-2 py-0.5 font-mono text-[10px]"
                            >
                              L{ln}
                            </span>
                          ))}
                        </div>
                      )}
                      {entry.producerLine && (
                        <>
                          <div className="text-muted-foreground mt-2 mb-1 text-[9px] tracking-wide uppercase">Producer (line that writes this variable):</div>
                          <span
                            onClick={() => selectLine(entry.producerLine!)}
                            className="bg-muted hover:bg-accent inline-block cursor-pointer rounded px-2 py-0.5 font-mono text-[10px]"
                          >
                            L{entry.producerLine}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {perLineDeps.length > 0 && (
              <div className="text-muted-foreground px-3 py-2 text-[10px] font-semibold tracking-wide uppercase">Per-Line Dependencies</div>
            )}
            {perLineDeps.map((entry) => (
              <div key={entry.lineNumber} className="border-b">
                <div className="flex items-center gap-2 px-3 py-2">
                  <span
                    title="Go to this line"
                    onClick={() => selectLine(entry.lineNumber)}
                    className="flex min-w-8.5 cursor-pointer items-center justify-center rounded border border-cyan-500/20 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-cyan-600 dark:text-cyan-400"
                  >
                    L{entry.lineNumber}
                  </span>
                  <span className="text-primary font-mono text-sm">depends on</span>
                  <span className="flex flex-wrap gap-1">
                    {entry.sources.map((src) => (
                      <span key={src} className="flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] text-amber-600 dark:text-amber-400">
                        <Radio className="size-3" /> {src}
                      </span>
                    ))}
                  </span>
                </div>
              </div>
            ))}

            {dataSourceEntries.length > 0 && (
              <div className="text-muted-foreground px-3 py-2 text-[10px] font-semibold tracking-wide uppercase">Data Source Dependencies</div>
            )}
            {dataSourceEntries.map((entry) => (
              <div key={entry.key} className="border-b">
                <div onClick={() => toggleSource(entry.key)} className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 px-3 py-2 select-none">
                  {expandedSources.has(entry.key) ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                  <span className="flex flex-1 items-center gap-1 font-mono text-sm text-amber-600 dark:text-amber-400">
                    <Radio className="size-3.5" /> {entry.key}
                  </span>
                  <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-400">
                    {entry.consumers.length} line{entry.consumers.length !== 1 ? "s" : ""}
                  </span>
                </div>
                {expandedSources.has(entry.key) && (
                  <div className="px-3 pb-2 pl-9">
                    <div className="flex flex-wrap gap-1">
                      {entry.consumers.map((ln) => (
                        <span key={ln} onClick={() => selectLine(ln)} className="bg-muted hover:bg-accent cursor-pointer rounded px-2 py-0.5 font-mono text-[10px]">
                          L{ln}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
