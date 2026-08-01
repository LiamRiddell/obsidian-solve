import { useEffect, useMemo, useRef, useState } from "react"
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react"
import { exampleData, fullDocumentExamples } from "@bridge/examples"
import { useEditorStore } from "@/stores/editor"
import { useClickOutside } from "@/hooks/useClickOutside"
import { Input } from "@/components/ui/input"
import { ExampleCategory } from "@/components/ExampleCategory"
import { cn } from "@/lib/utils"

/** Searchable example/template picker. Ported from playground's ExamplesMenu.vue + ExampleCategory.vue. */
export function ExamplesMenu() {
  const insertExample = useEditorStore((s) => s.insertExample)
  const [open, setOpen] = useState(false)
  const [filterQuery, setFilterQuery] = useState("")
  const rootRef = useRef<HTMLDivElement>(null)
  const filterInputRef = useRef<HTMLInputElement>(null)

  useClickOutside(rootRef, () => setOpen(false), open)

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => filterInputRef.current?.focus())
    } else {
      setFilterQuery("")
    }
  }, [open])

  const totalExampleCount = useMemo(() => exampleData.reduce((n, c) => n + c.examples.length, 0), [])

  const filteredCategories = useMemo(() => {
    const q = filterQuery.trim().toLowerCase()
    if (!q) return exampleData
    return exampleData
      .map((cat) => ({
        ...cat,
        examples: cat.examples.filter(
          (ex) =>
            ex.name.toLowerCase().includes(q) ||
            ex.expression.toLowerCase().includes(q) ||
            ex.description.toLowerCase().includes(q),
        ),
      }))
      .filter((cat) => cat.examples.length > 0)
  }, [filterQuery])

  function onSelect(expression: string) {
    insertExample(expression)
    setOpen(false)
  }

  function onFullDocSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value
    if (value) {
      insertExample(value)
      e.target.value = ""
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors",
          open ? "border-primary/30 bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        )}
      >
        <BookOpen className="size-3.5" />
        Examples
        <span className="bg-muted rounded px-1 text-[10px] tabular-nums">{totalExampleCount}</span>
        {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
      </button>

      {open && (
        <div className="bg-popover border-border/80 absolute top-full right-0 z-30 mt-1.5 flex max-h-[70vh] w-80 flex-col gap-2 overflow-hidden rounded-lg border p-2 shadow-2xl">
          <div className="flex gap-1.5">
            <Input
              ref={filterInputRef}
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter examples…"
              spellCheck={false}
              className="h-8"
            />
            <select
              onChange={onFullDocSelect}
              defaultValue=""
              className="border-input bg-background h-8 rounded-md border px-2 text-xs"
            >
              <option value="">Full Documents…</option>
              {fullDocumentExamples.map((doc) => (
                <option key={doc.name} value={doc.content}>
                  {doc.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 overflow-y-auto">
            {filterQuery && filteredCategories.length === 0 && (
              <div className="text-muted-foreground p-2 text-center text-sm">
                No examples match &ldquo;{filterQuery}&rdquo;
              </div>
            )}
            {filteredCategories.map((cat) => (
              <ExampleCategory key={cat.name} category={cat} forceExpanded={filterQuery.length > 0} onSelect={onSelect} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
