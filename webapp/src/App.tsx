import { useEffect, useRef } from "react"
import { EditorPane } from "@/components/EditorPane"
import { HeaderBar } from "@/components/HeaderBar"
import { StatusBar } from "@/components/StatusBar"
import { DiagnosticsPane } from "@/components/DiagnosticsPane"
import { usePipelineStore } from "@/stores/pipeline"

/** Ported from playground's App.vue: header/status chrome, the editor/diagnostics split with a manual resize handle, and the Escape-clears-flamegraph-filter shortcut. */
function App() {
  const editorRef = useRef<HTMLDivElement>(null)
  const diagnosticsRef = useRef<HTMLDivElement>(null)

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

  function startResize(e: React.MouseEvent) {
    const nextEl = diagnosticsRef.current
    const prevEl = editorRef.current
    if (!nextEl || !prevEl) return
    const startX = e.clientX
    const startNextW = nextEl.getBoundingClientRect().width

    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"

    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX
      const newNext = Math.max(80, startNextW - dx)
      nextEl!.style.flex = `0 0 ${newNext}px`
      prevEl!.style.flex = "1"
    }
    function onUp() {
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
  }

  return (
    <div className="flex h-screen flex-col">
      <HeaderBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div ref={editorRef} className="flex min-h-0 flex-1 flex-col">
          <EditorPane />
        </div>
        <div
          onMouseDown={startResize}
          className="border-border hover:border-primary group relative w-px shrink-0 cursor-col-resize border-l transition-colors"
        >
          {/* Wider invisible hit-area so the 1px border is still easy to grab. */}
          <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
        </div>
        <div ref={diagnosticsRef} className="flex min-h-0 flex-1 flex-col" style={{ flex: "0 0 40%" }}>
          <DiagnosticsPane />
        </div>
      </div>
      <StatusBar />
    </div>
  )
}

export default App
