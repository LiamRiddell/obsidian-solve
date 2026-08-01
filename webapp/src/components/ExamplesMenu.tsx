import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Popover } from "radix-ui"
import { BookOpen, ChevronDown, FileStack, Layers, Network, Search, SearchX, X } from "lucide-react"
import { exampleData, fullDocumentExamples, multiDocumentExamples } from "@bridge/examples"
import type {
  Example,
  ExampleCategory as ExampleCategoryType,
  FullDocumentExample,
  MultiDocumentExample,
} from "@bridge/examples"
import { useEditorStore } from "@/stores/editor"
import { useTabsStore } from "@/stores/tabsStore"
import { CategoryRow, DocumentRow, ExampleRow, MultiDocumentRow } from "@/components/ExampleCategory"
import { cn } from "@/lib/utils"

/**
 * Searchable example/template picker.
 *
 * Everything the user can land on — a category header, a snippet, a full document — is one row in
 * a single flat list, so ↑/↓/↵ drive the whole menu from the search field without ever moving DOM
 * focus. Expansion state is owned here (not per-category) because the keyboard cursor has to know
 * which rows are currently visible.
 *
 * Positioning goes through Radix Popover rather than a plain absolute panel: the trigger lives in
 * the editor pane's header, which can be narrow enough that a right-aligned 26rem panel would run
 * off the left edge of the window. Radix shifts it back into view instead.
 */

type Row =
  | { kind: "category"; key: string; category: ExampleCategoryType; expanded: boolean }
  | { kind: "example"; key: string; example: Example }
  | { kind: "document"; key: string; doc: FullDocumentExample }
  | { kind: "multiDocument"; key: string; example: MultiDocumentExample }

type Tab = "snippets" | "documents" | "multiDocument"

const LISTBOX_ID = "examples-menu-listbox"
const rowDomId = (index: number) => `examples-menu-row-${index}`

/** Plural nouns, for the empty state's "no X match" / "N matching X" copy. */
const TAB_NOUN: Record<Tab, string> = {
  snippets: "examples",
  documents: "documents",
  multiDocument: "document sets",
}

function matches(haystacks: string[], q: string) {
  return haystacks.some((h) => h.toLowerCase().includes(q))
}

export function ExamplesMenu() {
  const insertExample = useEditorStore((s) => s.insertExample)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>("snippets")
  const [filterQuery, setFilterQuery] = useState("")
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set<string>())
  const [activeIndex, setActiveIndex] = useState(0)
  const filterInputRef = useRef<HTMLInputElement>(null)
  const rowRefs = useRef<(HTMLElement | null)[]>([])

  // Closing resets the menu so it always reopens on a clean, fully-collapsed list.
  useEffect(() => {
    if (open) return
    setFilterQuery("")
    setTab("snippets")
    setExpanded(new Set<string>())
  }, [open])

  const totalExampleCount = useMemo(() => exampleData.reduce((n, c) => n + c.examples.length, 0), [])

  const query = filterQuery.trim().toLowerCase()
  const searching = query.length > 0

  const filteredCategories = useMemo(() => {
    if (!searching) return exampleData
    return exampleData
      .map((cat) => ({
        ...cat,
        examples: cat.examples.filter((ex) => matches([ex.name, ex.expression, ex.description], query)),
      }))
      .filter((cat) => cat.examples.length > 0)
  }, [query, searching])

  const filteredDocuments = useMemo(() => {
    if (!searching) return fullDocumentExamples
    return fullDocumentExamples.filter((doc) => matches([doc.name, doc.description, doc.content], query))
  }, [query, searching])

  const filteredMultiDocuments = useMemo(() => {
    if (!searching) return multiDocumentExamples
    return multiDocumentExamples.filter((set) =>
      matches([set.name, set.description, ...set.documents.flatMap((d) => [d.title, d.content])], query),
    )
  }, [query, searching])

  const snippetHits = useMemo(
    () => filteredCategories.reduce((n, c) => n + c.examples.length, 0),
    [filteredCategories],
  )

  /** Hits sitting in the OTHER tabs — used to turn an empty result into a jump. */
  const elsewhereHits = useMemo(() => {
    const counts: Record<Tab, number> = {
      snippets: snippetHits,
      documents: filteredDocuments.length,
      multiDocument: filteredMultiDocuments.length,
    }
    return (Object.keys(counts) as Tab[])
      .filter((t) => t !== tab && counts[t] > 0)
      .map((t) => ({ tab: t, count: counts[t] }))
  }, [tab, snippetHits, filteredDocuments.length, filteredMultiDocuments.length])

  // Flat, keyboard-navigable view of whatever is currently on screen.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    if (tab === "snippets") {
      for (const category of filteredCategories) {
        // A search implies intent to see the matches — force every hit category open.
        const isExpanded = searching || expanded.has(category.name)
        out.push({ kind: "category", key: `c:${category.name}`, category, expanded: isExpanded })
        if (isExpanded) {
          for (const example of category.examples) {
            out.push({ kind: "example", key: `e:${category.name}:${example.name}`, example })
          }
        }
      }
    } else if (tab === "documents") {
      for (const doc of filteredDocuments) out.push({ kind: "document", key: `d:${doc.name}`, doc })
    } else {
      for (const example of filteredMultiDocuments) out.push({ kind: "multiDocument", key: `m:${example.name}`, example })
    }
    return out
  }, [tab, filteredCategories, filteredDocuments, filteredMultiDocuments, expanded, searching])

  rowRefs.current.length = rows.length

  // A new result set always restarts the cursor; toggling a category leaves it where it was.
  useEffect(() => setActiveIndex(0), [query, tab])
  useEffect(() => setActiveIndex((i) => Math.min(i, Math.max(0, rows.length - 1))), [rows.length])
  useEffect(() => {
    rowRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  const toggleCategory = useCallback((name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(name)) next.add(name)
      return next
    })
  }, [])

  const insert = useCallback(
    (text: string) => {
      insertExample(text)
      setOpen(false)
    },
    [insertExample],
  )

  const activate = useCallback(
    (row: Row) => {
      if (row.kind === "category") toggleCategory(row.category.name)
      else if (row.kind === "example") insert(row.example.expression)
      else if (row.kind === "document") insert(row.doc.content)
      else {
        // A set opens as its own tabs rather than replacing the current one —
        // the whole point is having several documents live at the same time.
        useTabsStore.getState().openDocumentSet(row.example.documents)
        setOpen(false)
      }
    },
    [insert, toggleCategory],
  )

  function onKeyDown(e: React.KeyboardEvent) {
    const row = rows[activeIndex]
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        if (rows.length) setActiveIndex((i) => (i + 1) % rows.length)
        break
      case "ArrowUp":
        e.preventDefault()
        if (rows.length) setActiveIndex((i) => (i - 1 + rows.length) % rows.length)
        break
      case "Home":
        e.preventDefault()
        setActiveIndex(0)
        break
      case "End":
        e.preventDefault()
        setActiveIndex(Math.max(0, rows.length - 1))
        break
      case "ArrowRight":
        if (row?.kind === "category" && !row.expanded) {
          e.preventDefault()
          toggleCategory(row.category.name)
        }
        break
      case "ArrowLeft":
        if (row?.kind === "category" && row.expanded) {
          e.preventDefault()
          toggleCategory(row.category.name)
        }
        break
      case "Enter":
        e.preventDefault()
        if (row) activate(row)
        break
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors",
            open
              ? "border-accent-border bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground border-transparent",
          )}
        >
          <BookOpen className="size-3.5" />
          Examples
          <span className="bg-muted rounded px-1 text-[10px] tabular-nums">{totalExampleCount}</span>
          <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={8}
          aria-label="Insert an example"
          // The search field owns focus for the whole session, so ↑/↓/↵ never have to leave it.
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            filterInputRef.current?.focus()
          }}
          // Esc peels one layer at a time: clear the query first, close only once it's empty.
          onEscapeKeyDown={(e) => {
            if (filterQuery) {
              e.preventDefault()
              setFilterQuery("")
            }
          }}
          onKeyDown={onKeyDown}
          className="bg-popover text-popover-foreground border-border z-30 flex max-h-[min(70vh,var(--radix-popover-content-available-height))] w-[min(26rem,var(--radix-popover-content-available-width))] flex-col overflow-hidden rounded-xl border shadow-2xl"
        >
          {/* Search */}
          <div className="border-border flex h-10 shrink-0 items-center gap-2 border-b px-3">
            <Search className="text-faint size-4 shrink-0" />
            <input
              ref={filterInputRef}
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder={`Search ${totalExampleCount} examples…`}
              spellCheck={false}
              aria-label="Search examples"
              role="combobox"
              aria-expanded
              aria-controls={LISTBOX_ID}
              aria-activedescendant={rows.length ? rowDomId(activeIndex) : undefined}
              className="placeholder:text-faint min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            {filterQuery ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setFilterQuery("")
                  filterInputRef.current?.focus()
                }}
                className="text-faint hover:text-foreground shrink-0 rounded p-0.5 transition-colors"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          {/* Snippets / Documents / Multi-doc */}
          <div role="tablist" aria-label="Example kind" className="border-border flex shrink-0 items-center gap-1.5 border-b p-2">
            <TabChip
              icon={Layers}
              label="Snippets"
              count={searching ? snippetHits : totalExampleCount}
              selected={tab === "snippets"}
              onSelect={() => setTab("snippets")}
            />
            <TabChip
              icon={FileStack}
              label="Documents"
              count={filteredDocuments.length}
              selected={tab === "documents"}
              onSelect={() => setTab("documents")}
            />
            <TabChip
              icon={Network}
              label="Multi-doc"
              count={filteredMultiDocuments.length}
              selected={tab === "multiDocument"}
              onSelect={() => setTab("multiDocument")}
            />
          </div>

          {/* Results */}
          <div id={LISTBOX_ID} role="listbox" aria-label="Examples" className="flex flex-col gap-0.5 overflow-y-auto p-1.5">
            {rows.length === 0 ? (
              <div className="text-muted-foreground flex flex-col items-center gap-2 px-3 py-10 text-center">
                <SearchX className="text-faint size-6" />
                <p className="text-sm">
                  No {TAB_NOUN[tab]} match &ldquo;{filterQuery}&rdquo;
                </p>
                {/* The hit is often just in a different tab — offer the jump rather than a dead end. */}
                {elsewhereHits.map(({ tab: other, count }) => (
                  <button
                    key={other}
                    type="button"
                    onClick={() => setTab(other)}
                    className="text-primary text-xs hover:underline"
                  >
                    {count} matching {TAB_NOUN[other]} →
                  </button>
                ))}
              </div>
            ) : (
              rows.map((row, index) => {
                const shared = {
                  id: rowDomId(index),
                  active: index === activeIndex,
                  onActivate: () => activate(row),
                  onHover: () => setActiveIndex(index),
                  rowRef: (el: HTMLElement | null) => {
                    rowRefs.current[index] = el
                  },
                }
                if (row.kind === "category") {
                  return <CategoryRow key={row.key} {...shared} category={row.category} expanded={row.expanded} query={filterQuery} />
                }
                if (row.kind === "example") {
                  return (
                    // Per-row rule; consecutive rows join into one continuous tree guide.
                    <div key={row.key} className="border-border/70 ml-[1.375rem] border-l pl-1.5">
                      <ExampleRow {...shared} example={row.example} query={filterQuery} />
                    </div>
                  )
                }
                if (row.kind === "document") {
                  return <DocumentRow key={row.key} {...shared} doc={row.doc} query={filterQuery} />
                }
                return <MultiDocumentRow key={row.key} {...shared} example={row.example} query={filterQuery} />
              })
            )}
          </div>

          {/* Keyboard legend */}
          <div className="border-border text-faint flex shrink-0 items-center gap-3 border-t px-3 py-1.5 text-[10px]">
            {rows.length > 0 ? (
              <>
                <Hint keys="↑↓" label="navigate" />
                <Hint keys="↵" label={enterLabel(rows[activeIndex])} />
              </>
            ) : null}
            <Hint keys="esc" label={filterQuery ? "clear" : "close"} />
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function enterLabel(row: Row | undefined) {
  if (row?.kind === "multiDocument") return "open tabs"
  if (row?.kind !== "category") return "insert"
  return row.expanded ? "collapse" : "expand"
}

function TabChip({
  icon: Icon,
  label,
  count,
  selected,
  onSelect,
}: {
  icon: typeof Layers
  label: string
  count: number
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        selected
          ? "border-accent-border bg-accent text-accent-foreground"
          : "border-border text-muted-foreground hover:bg-foreground/5",
      )}
    >
      <Icon className="size-3.5" />
      {label}
      <span className="tabular-nums opacity-60">{count}</span>
    </button>
  )
}

function Hint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <kbd className="border-border bg-muted text-muted-foreground rounded border px-1 py-px font-sans text-[10px] leading-none">
        {keys}
      </kbd>
      {label}
    </span>
  )
}
