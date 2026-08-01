import { useState } from "react"
import { ChevronRight, ChevronDown } from "lucide-react"
import type { ExampleCategory as ExampleCategoryType } from "@bridge/examples"
import { cn } from "@/lib/utils"

export function ExampleCategory({
  category,
  forceExpanded = false,
  onSelect,
}: {
  category: ExampleCategoryType
  forceExpanded?: boolean
  onSelect: (expression: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isExpanded = forceExpanded || expanded

  return (
    <div>
      <div
        role="button"
        onClick={() => setExpanded((e) => !e)}
        className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
      >
        <span className="flex-1">{category.name}</span>
        <span className="text-muted-foreground text-xs">{category.examples.length}</span>
        {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      </div>
      <div className={cn("flex flex-col gap-0.5 pl-2", !isExpanded && "hidden")}>
        {category.examples.map((ex) => (
          <div
            key={ex.name}
            role="button"
            title={ex.description}
            onClick={() => onSelect(ex.expression)}
            className="hover:bg-accent cursor-pointer rounded-sm px-2 py-1"
          >
            <div className="text-sm">{ex.name}</div>
            <div className="text-muted-foreground truncate font-mono text-xs">{ex.expression}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
