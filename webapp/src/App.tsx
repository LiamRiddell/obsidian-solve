import { useEffect } from "react"
import { EditorPane } from "@/components/EditorPane"
import { HeaderBar } from "@/components/HeaderBar"
import { StatusBar } from "@/components/StatusBar"
import { DiagnosticsPane } from "@/components/DiagnosticsPane"
import { usePipelineStore } from "@/stores/pipeline"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"

/**
 * Header/status chrome, the editor/diagnostics split, and the
 * Escape-clears-flamegraph-filter shortcut. The split is built on
 * react-resizable-panels (via the shadcn-style ResizablePanelGroup/Panel/
 * Handle wrappers in components/ui/resizable.tsx) rather than a hand-rolled
 * mousedown/mousemove drag handler — same drag-to-resize behavior, but also
 * gets keyboard-accessible resizing (focus the handle, arrow keys) for
 * free. Panel `id`s are set explicitly (not left to the library's
 * auto-generated ones) since they're a stable anchor if layout persistence
 * (`useDefaultLayout`) is ever added later.
 */
function App() {
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape" && usePipelineStore.getState().flamegraphFilter !== null) {
        e.preventDefault()
        usePipelineStore.getState().clearFlamegraphFilter()
      }
    }
    document.addEventListener("keydown", onKeydown)
    return () => document.removeEventListener("keydown", onKeydown)
  }, [])

  return (
    <div className="flex h-screen flex-col">
      <HeaderBar />
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1 overflow-hidden">
        <ResizablePanel id="editor" defaultSize="50" minSize="30" className="flex min-h-0 flex-col">
          <EditorPane />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel id="diagnostics" defaultSize="50" minSize="20" className="flex min-h-0 flex-col">
          <DiagnosticsPane />
        </ResizablePanel>
      </ResizablePanelGroup>
      <StatusBar />
    </div>
  )
}

export default App
