import { ChevronRight, CornerDownLeft, FileText, Network } from "lucide-react"
import type {
  Example,
  ExampleCategory as ExampleCategoryType,
  FullDocumentExample,
  MultiDocumentExample,
} from "@bridge/examples"
import { categoryMeta } from "@/components/exampleCategoryMeta"
import { cn } from "@/lib/utils"

/**
 * Presentational rows for the Examples menu. Every row is a single flat, focusable item so the
 * menu can drive one keyboard cursor across categories, examples and documents alike — selection
 * state lives in ExamplesMenu, not here.
 */

/** Tinted glyph plate. Colour comes in as a raw CSS var so Tailwind never sees a built class. */
function IconPlate({ icon: Icon, tone, size = "md" }: { icon: typeof FileText; tone: string; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md",
        size === "md" ? "size-7" : "size-6",
      )}
      style={{ color: tone, backgroundColor: "color-mix(in oklab, currentColor 14%, transparent)" }}
    >
      <Icon className={size === "md" ? "size-4" : "size-3.5"} />
    </span>
  )
}

/** Bolds the matched run so scanning a filtered list is instant. Case-insensitive, first hit only. */
export function HighlightedText({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  if (!q) return <>{text}</>
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-transparent font-semibold text-primary">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  )
}

interface RowProps {
  id: string
  active: boolean
  onActivate: () => void
  onHover: () => void
  rowRef: (el: HTMLElement | null) => void
}

const ROW_BASE =
  "group flex w-full items-center gap-2.5 rounded-md px-2 text-left transition-colors outline-none data-[active=true]:bg-accent"

export function CategoryRow({
  category,
  expanded,
  query,
  id,
  active,
  onActivate,
  onHover,
  rowRef,
}: RowProps & { category: ExampleCategoryType; expanded: boolean; query: string }) {
  const { icon, tone } = categoryMeta(category.name)
  return (
    <button
      type="button"
      id={id}
      role="option"
      aria-selected={active}
      aria-expanded={expanded}
      data-active={active}
      ref={rowRef}
      onClick={onActivate}
      onMouseMove={onHover}
      tabIndex={-1}
      className={cn(ROW_BASE, "py-1.5")}
    >
      <IconPlate icon={icon} tone={tone} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        <HighlightedText text={category.name} query={query} />
      </span>
      <span className="text-faint shrink-0 text-[11px] tabular-nums">{category.examples.length}</span>
      <ChevronRight className={cn("text-faint size-3.5 shrink-0 transition-transform", expanded && "rotate-90")} />
    </button>
  )
}

export function ExampleRow({
  example,
  query,
  id,
  active,
  onActivate,
  onHover,
  rowRef,
}: RowProps & { example: Example; query: string }) {
  return (
    <button
      type="button"
      id={id}
      role="option"
      aria-selected={active}
      data-active={active}
      ref={rowRef}
      onClick={onActivate}
      onMouseMove={onHover}
      title={example.description}
      tabIndex={-1}
      className={cn(ROW_BASE, "items-start py-1")}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px]">
          <HighlightedText text={example.name} query={query} />
        </span>
        <span className="text-muted-foreground block truncate font-mono text-[11px]">
          <HighlightedText text={example.expression} query={query} />
        </span>
      </span>
      <CornerDownLeft className="text-faint mt-0.5 size-3 shrink-0 opacity-0 transition-opacity group-data-[active=true]:opacity-100" />
    </button>
  )
}

export function DocumentRow({
  doc,
  query,
  id,
  active,
  onActivate,
  onHover,
  rowRef,
}: RowProps & { doc: FullDocumentExample; query: string }) {
  const lines = doc.content.split("\n").length
  return (
    <button
      type="button"
      id={id}
      role="option"
      aria-selected={active}
      data-active={active}
      ref={rowRef}
      onClick={onActivate}
      onMouseMove={onHover}
      title={doc.description}
      tabIndex={-1}
      className={cn(ROW_BASE, "py-1.5")}
    >
      <IconPlate icon={FileText} tone="var(--chart-1)" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">
          <HighlightedText text={doc.name} query={query} />
        </span>
        <span className="text-muted-foreground block truncate text-[11px]">{doc.description}</span>
      </span>
      <span className="text-faint shrink-0 text-[10px] tabular-nums">{lines} lines</span>
      <CornerDownLeft className="text-faint size-3 shrink-0 opacity-0 transition-opacity group-data-[active=true]:opacity-100" />
    </button>
  )
}

/**
 * A set that opens as several tabs at once. The document titles are listed as
 * chips because the row's whole point is that it is not one document — the
 * user should know how many tabs are about to appear, and what they're called.
 */
export function MultiDocumentRow({
  example,
  query,
  id,
  active,
  onActivate,
  onHover,
  rowRef,
}: RowProps & { example: MultiDocumentExample; query: string }) {
  return (
    <button
      type="button"
      id={id}
      role="option"
      aria-selected={active}
      data-active={active}
      ref={rowRef}
      onClick={onActivate}
      onMouseMove={onHover}
      title={example.description}
      tabIndex={-1}
      className={cn(ROW_BASE, "items-start py-2")}
    >
      <IconPlate icon={Network} tone="var(--chart-3)" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
            <HighlightedText text={example.name} query={query} />
          </span>
          <span className="text-faint shrink-0 text-[10px] tabular-nums">{example.documents.length} docs</span>
          <CornerDownLeft className="text-faint size-3 shrink-0 opacity-0 transition-opacity group-data-[active=true]:opacity-100" />
        </span>
        <span className="text-muted-foreground mt-0.5 block text-[11px] leading-snug">{example.description}</span>
        <span className="mt-1.5 flex flex-wrap gap-1">
          {example.documents.map((doc) => (
            <span key={doc.title} className="border-border/80 text-faint rounded border px-1.5 py-px text-[10px]">
              <HighlightedText text={doc.title} query={query} />
            </span>
          ))}
        </span>
      </span>
    </button>
  )
}
