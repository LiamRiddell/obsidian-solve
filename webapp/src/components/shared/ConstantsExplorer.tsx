import { useMemo, useState } from "react"
import { ChevronRight, Package } from "lucide-react"
import type { ConstantInfo } from "@bridge/engine"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const TYPE_ORDER: ConstantInfo["type"][] = ["number", "string", "bigint", "hex"]
const TYPE_LABEL: Record<ConstantInfo["type"], string> = {
  number: "Numbers",
  string: "Strings",
  bigint: "BigInts",
  hex: "Hex Values",
}
const TYPE_DOT: Record<ConstantInfo["type"], string> = {
  number: "bg-blue-500",
  string: "bg-emerald-500",
  bigint: "bg-violet-500",
  hex: "bg-amber-500",
}

interface ConstantGroup {
  type: ConstantInfo["type"]
  label: string
  items: ConstantInfo[]
  filteredItems?: ConstantInfo[]
  matchCount?: number
}

function displayValue(type: ConstantInfo["type"], value: string | number): string {
  switch (type) {
    case "string":
      return `"${String(value)}"`
    case "hex":
      return `0x${String(value)}`
    case "bigint":
      return `${String(value)}n`
    default:
      return String(value)
  }
}

function valueSegments(
  type: ConstantInfo["type"],
  value: string | number,
  query: string,
): Array<{ text: string; highlight: boolean }> {
  const display = displayValue(type, value)
  if (!query) return [{ text: display, highlight: false }]

  const lower = display.toLowerCase()
  const segments: Array<{ text: string; highlight: boolean }> = []
  let last = 0
  let idx = lower.indexOf(query)
  while (idx !== -1) {
    if (idx > last) segments.push({ text: display.slice(last, idx), highlight: false })
    segments.push({ text: display.slice(idx, idx + query.length), highlight: true })
    last = idx + query.length
    idx = lower.indexOf(query, last)
  }
  if (last < display.length) segments.push({ text: display.slice(last), highlight: false })
  return segments.length > 0 ? segments : [{ text: display, highlight: false }]
}

/**
 * Constants-by-type (Numbers/Strings/BigInts/Hex) filterable, collapsible
 * group table. Ported from playground's ConstantsExplorer.vue.
 */
export function ConstantsExplorer({ constants }: { constants: ConstantInfo[] }) {
  const [expanded, setExpanded] = useState(true)
  const [filter, setFilter] = useState("")
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({})

  const groups = useMemo<ConstantGroup[]>(() => {
    const byType = new Map<ConstantInfo["type"], ConstantInfo[]>()
    for (const c of constants) {
      if (!byType.has(c.type)) byType.set(c.type, [])
      byType.get(c.type)!.push(c)
    }
    return TYPE_ORDER.filter((t) => byType.has(t)).map((t) => ({
      type: t,
      label: TYPE_LABEL[t],
      items: byType.get(t)!,
    }))
  }, [constants])

  const query = filter.trim().toLowerCase()

  const filteredGroups = useMemo<ConstantGroup[]>(() => {
    if (!query) return groups
    return groups
      .map((g) => {
        const matches = g.items.filter(
          (item) => String(item.index) === query || String(item.value).toLowerCase().includes(query),
        )
        return { ...g, filteredItems: matches, matchCount: matches.length }
      })
      .filter((g) => (g.matchCount ?? 0) > 0)
  }, [groups, query])

  if (constants.length === 0) return null

  const filteredTotal = !query
    ? `${constants.length} total`
    : `${filteredGroups.reduce((sum, g) => sum + (g.matchCount ?? 0), 0)} / ${constants.length} total`

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded} className="border-t">
      <CollapsibleTrigger className="hover:bg-accent flex w-full items-center gap-2 px-4 py-2 text-left">
        <Package className="text-muted-foreground size-4" />
        <span className="text-sm font-medium">Constants</span>
        <Badge variant="secondary" className="ml-auto">
          {filteredTotal}
        </Badge>
        <ChevronRight
          className={cn("text-muted-foreground size-4 transition-transform", expanded && "rotate-90")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-2.5 px-4 pb-3">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          placeholder="Filter by index or value…"
          spellCheck={false}
          className="h-8"
        />
        {filteredGroups.map((group) => {
          const isOpen = groupOpen[group.type] || (query.length > 0 && (group.matchCount ?? 0) > 0)
          const rows = group.filteredItems ?? group.items
          return (
            <div key={group.type} className="rounded-md border">
              <button
                type="button"
                onClick={() => setGroupOpen((s) => ({ ...s, [group.type]: !s[group.type] }))}
                className="hover:bg-accent flex w-full items-center gap-2 px-3 py-1.5 text-left"
              >
                <span className={cn("size-2 rounded-full", TYPE_DOT[group.type])} />
                <span className="text-sm">{group.label}</span>
                <Badge variant="outline" className="ml-auto">
                  {group.matchCount ?? group.items.length}
                </Badge>
                <ChevronRight
                  className={cn("text-muted-foreground size-4 transition-transform", isOpen && "rotate-90")}
                />
              </button>
              {isOpen && (
                <table className="w-full border-t text-xs">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="w-12 px-3 py-1 text-left font-normal">#</th>
                      <th className="px-3 py-1 text-left font-normal">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((item) => (
                      <tr key={item.index} className="border-t">
                        <td className="text-muted-foreground px-3 py-1 font-mono">{item.index}</td>
                        <td className="px-3 py-1">
                          <code className="font-mono">
                            {valueSegments(group.type, item.value, query).map((seg, i) =>
                              seg.highlight ? (
                                <mark key={i} className="bg-yellow-300/60 dark:bg-yellow-500/40">
                                  {seg.text}
                                </mark>
                              ) : (
                                <span key={i}>{seg.text}</span>
                              ),
                            )}
                          </code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )
        })}
      </CollapsibleContent>
    </Collapsible>
  )
}
