import { X, Plus } from "lucide-react"
import { useTabsStore } from "@/stores/tabsStore"
import { cn } from "@/lib/utils"

/** Document tab strip. Ported from playground's TabBar.vue. */
export function TabBar() {
  const tabs = useTabsStore((s) => s.tabs)
  const activeTabId = useTabsStore((s) => s.activeTabId)
  const setActiveTab = useTabsStore((s) => s.setActiveTab)
  const closeTab = useTabsStore((s) => s.closeTab)
  const createTab = useTabsStore((s) => s.createTab)

  function onNewTab() {
    const id = createTab()
    setActiveTab(id)
  }

  return (
    <div className="bg-card/40 flex items-center gap-1 overflow-x-auto border-b px-2 pt-1.5">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => setActiveTab(tab.id)}
          className={cn(
            "group text-muted-foreground hover:bg-foreground/5 hover:text-foreground relative flex max-w-[180px] items-center gap-1.5 rounded-t-md border border-transparent px-3 py-1.5 pr-2 text-xs whitespace-nowrap transition-colors",
            tab.id === activeTabId && "bg-background border-border border-b-background text-foreground -mb-px",
          )}
        >
          {tab.id === activeTabId && <span className="bg-primary absolute inset-x-2 top-0 h-0.5 rounded-full" aria-hidden="true" />}
          <span className="truncate">{tab.title}</span>
          {tabs.length > 1 && (
            <span
              role="button"
              title="Close tab"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
              className="hover:bg-foreground/10 rounded-sm opacity-0 group-hover:opacity-60 hover:opacity-100!"
            >
              <X className="size-3.5" />
            </span>
          )}
        </button>
      ))}
      <button
        type="button"
        title="New tab"
        onClick={onNewTab}
        className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex size-6.5 shrink-0 items-center justify-center rounded-md transition-colors"
      >
        <Plus className="size-4" />
      </button>
    </div>
  )
}
