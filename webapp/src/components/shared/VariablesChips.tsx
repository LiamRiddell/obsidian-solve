import { useState } from "react"
import { ChevronRight, ListTree } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

/**
 * The `:varname` chip list. Ported from playground's VariablesChips.vue
 * (originally extracted there from two identical implementations in
 * PipelineTab and BytecodeTab).
 */
export function VariablesChips({ variables }: { variables: string[] }) {
  const [expanded, setExpanded] = useState(true)
  if (variables.length === 0) return null

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded} className="border-t">
      <CollapsibleTrigger className="hover:bg-accent flex w-full items-center gap-2 px-4 py-2 text-left">
        <ListTree className="text-muted-foreground size-4" />
        <span className="text-sm font-medium">Variables</span>
        <Badge variant="secondary" className="ml-auto">
          {variables.length} variable{variables.length !== 1 ? "s" : ""}
        </Badge>
        <ChevronRight
          className={cn("text-muted-foreground size-4 transition-transform", expanded && "rotate-90")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-wrap gap-1.5 px-4 pb-3">
        {variables.map((v) => (
          <span
            key={v}
            title={`Variable: :${v}`}
            className="bg-muted rounded-md border px-2 py-0.5 font-mono text-xs"
          >
            :{v}
          </span>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}
