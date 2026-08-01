import type { DebugResult, DiagnosticEventInfo } from "@bridge/engine"
import { useStreamStore } from "./stream"
import { useWorkersStore } from "./workers"
import { useDiagnosticReportStore } from "./diagnosticReport"
import { usePipelineStore } from "./pipeline"
import { useTabsStore } from "./tabsStore"
import EngineWorker from "@bridge/engine.worker.ts?worker"

/**
 * The engine "store" is deliberately NOT a Zustand store with its own
 * state — unlike the Pinia version, nothing here needs to be a reactive
 * value a component subscribes to. It's a singleton service (one Worker,
 * shared by every open tab) with two imperative actions. Kept as a plain
 * module — matching how `useTabsStore`/`useDiagnosticReportStore` etc. are
 * already callable via `.getState()` from anywhere, including from inside
 * this module's own Worker `onmessage` handler, which runs OUTSIDE React's
 * render cycle entirely.
 */

// This module has no HMR self-acceptance, and its own dependents (e.g.
// EditorPane.tsx) are React components that React Fast Refresh DOES
// self-accept — so during dev, editing this file OR any store it imports
// (workers.ts, diagnosticReport.ts, pipeline.ts, tabsStore.ts, stream.ts)
// re-executes this module in place rather than triggering a full page
// reload. Without this, every such edit spawns a brand new `new
// EngineWorker()` while the PREVIOUS one is never terminated — each is a
// real OS-level thread that keeps running invisibly in the background, and
// over a long editing session this silently accumulates dozens of orphaned
// workers, which is exactly the kind of unbounded resource growth that
// eventually crashes the tab (confirmed empirically: repeated edits to this
// file produced repeated `engine.worker.ts?worker_file` network requests —
// i.e. repeated real Worker instantiations — with no matching cleanup).
//
// `import.meta.hot.dispose()` is the textbook fix for this, but it does NOT
// fire here — this module is swept up as a transitive dependency of
// EditorPane.tsx's self-accepting boundary rather than being its own
// accepted boundary, and Vite does not appear to invoke dispose for
// modules in that position (confirmed by monkey-patching
// `Worker.prototype.terminate` across an edit: zero calls). `hot.data`
// is the robust alternative recommended by Vite's own HMR docs for this
// exact situation — it's a plain object Vite guarantees to hand from the
// OLD module instance to the NEW one, independent of dispose/accept
// semantics, so the new instance can terminate its predecessor itself.
const previousEngineWorker: Worker | undefined = import.meta.hot?.data.engineWorker
if (previousEngineWorker) previousEngineWorker.terminate()

const engineWorker = new EngineWorker()

if (import.meta.hot) {
  import.meta.hot.data.engineWorker = engineWorker
}

/**
 * Latest request id issued PER TAB — distinct from
 * `useDiagnosticReportStore().runId`, which tracks "the latest response
 * worth showing in the diagnostic panels" (a concept that only makes sense
 * for whichever tab is currently focused). A background tab still needs
 * its own staleness gating (a superseded keystroke in that SAME background
 * tab shouldn't overwrite a newer one), independent of whether it's the
 * active tab at all.
 */
const latestRequestId = new Map<string, number>()
let nextId = 0

engineWorker.onmessage = (
  e: MessageEvent<{
    id?: number
    tabId: string
    result?: DebugResult
    error?: string
    streamEvent?: DiagnosticEventInfo
    stream?: boolean
    unsolicited?: boolean
  }>,
) => {
  const { id, tabId, result, error, streamEvent, stream, unsolicited } = e.data
  const dr = useDiagnosticReportStore.getState()
  const tabs = useTabsStore.getState()
  const isActiveTab = tabs.isActive(tabId)

  // ── Unsolicited background refresh (some OTHER tab wrote a global
  // variable this tab's last-evaluated text depends on) — always cache,
  // never subject to id-based staleness (there's no in-flight request it
  // could be stale relative to), only push into the visible diagnostic
  // report if this happens to be the focused tab.
  if (unsolicited) {
    if (error) {
      useWorkersStore.getState().logActivity("engine", `[${tabId}] ${error}`, true)
      return
    }
    if (streamEvent?.lineUpdate) {
      tabs.patchCachedLineResult(tabId, streamEvent.lineUpdate)
      if (isActiveTab) {
        dr.patchLineResult(streamEvent.lineUpdate)
        dr.patchLineStages(streamEvent.lineUpdate.lineNumber, streamEvent.lineUpdate.stages)
        if (streamEvent.cacheUpdate) {
          dr.patchCacheUpdate(streamEvent.cacheUpdate.cacheSnapshot, streamEvent.cacheUpdate.queryCache)
          useWorkersStore.getState().updateQueryCacheTelemetry(streamEvent.cacheUpdate.queryCache)
        }
      }
      return
    }
    if (!result) return
    tabs.cacheResult(tabId, result)
    if (isActiveTab) dr.setResult(result)
    return
  }

  // Streaming events. A `lineUpdate` is patched into the tab's CACHED result
  // unconditionally — active or backgrounded — so a line that resolves while
  // its tab isn't focused doesn't get silently dropped. Only the ACTIVE tab
  // additionally pushes into the live StreamStore/Perf telemetry.
  if (stream && streamEvent) {
    // Drop events for a superseded request in this tab (the worker aborts a
    // tab's previous streaming session before starting a new one for that
    // SAME tab, but an in-flight message can still race the abort).
    if (id !== latestRequestId.get(tabId)) return

    if (streamEvent.lineUpdate) {
      tabs.patchCachedLineResult(tabId, streamEvent.lineUpdate)
      if (isActiveTab) {
        dr.patchLineResult(streamEvent.lineUpdate)
        dr.patchLineStages(streamEvent.lineUpdate.lineNumber, streamEvent.lineUpdate.stages)
      }
    }

    // Refresh the Cache tab's async panels (Async Resolver Cache, Query
    // Cache) now that this resolution actually changed them — without this
    // they stay frozen at the pre-resolution snapshot from the initial
    // `result` message (see DiagnosticEventInfo.cacheUpdate).
    if (streamEvent.cacheUpdate && isActiveTab) {
      dr.patchCacheUpdate(streamEvent.cacheUpdate.cacheSnapshot, streamEvent.cacheUpdate.queryCache)
      useWorkersStore.getState().updateQueryCacheTelemetry(streamEvent.cacheUpdate.queryCache)
    }

    if (isActiveTab) {
      useStreamStore.getState().addEvent(streamEvent)
      if (streamEvent.type === "async_resolved" || streamEvent.type === "async_error") {
        dr.recordAsyncElapsed(streamEvent.elapsedNs)
      }
    }
    return
  }

  // Per-tab staleness: a response for a superseded request in THIS tab
  // (regardless of whether this tab is currently focused).
  if (id !== latestRequestId.get(tabId)) {
    const ws = useWorkersStore.getState()
    ws.engine.msgCount++
    ws.engine.queueDepth = Math.max(0, ws.engine.queueDepth - 1)
    return
  }

  const ws = useWorkersStore.getState()
  const rtt = window.performance.now() - ws.engine.lastRunTime
  ws.engine.roundTripTimes.push(rtt)
  if (ws.engine.roundTripTimes.length > 20) ws.engine.roundTripTimes.shift()
  ws.engine.msgCount++
  ws.engine.queueDepth = Math.max(0, ws.engine.queueDepth - 1)
  ws.updateEngineTelemetry()

  if (isActiveTab) dr.setStatus("ready")

  // Reset pipeline cursor tracking on new result (active tab only —
  // background tabs don't drive the Pipeline tab's selection state).
  if (isActiveTab) usePipelineStore.getState().resetDropdownOverride()

  if (error) {
    ws.logActivity("engine", error, true)
    return
  }
  if (!result) return

  // Cache for every tab so switching focus later shows fresh data
  // immediately without a re-run; only the ACTIVE tab also populates the
  // live diagnostic report right now.
  tabs.cacheResult(tabId, result)
  if (isActiveTab) {
    dr.setResult(result)
    useStreamStore.getState().finalize()
    ws.updateQueryCacheTelemetry(result.queryCache ?? [])
    ws.updateQueryClientConfig(result.queryClientConfig)
  }
}

const runTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

export function evaluate(expression: string, tabId: string): void {
  const existing = runTimeouts.get(tabId)
  if (existing) clearTimeout(existing)

  runTimeouts.set(
    tabId,
    setTimeout(() => {
      runTimeouts.delete(tabId)
      const isActiveTab = useTabsStore.getState().isActive(tabId)

      if (!expression) {
        engineWorker.postMessage({ id: latestRequestId.get(tabId) ?? 0, tabId, abort: true })
        return
      }

      if (isActiveTab) {
        useStreamStore.getState().reset()
        useDiagnosticReportStore.getState().setStatus("busy")
        useDiagnosticReportStore.getState().incrementRunId()
      }

      const id = nextId++
      latestRequestId.set(tabId, id)

      const ws = useWorkersStore.getState()
      ws.engine.queueDepth++
      ws.engine.lastRunTime = window.performance.now()
      ws.logActivity("engine", `Enqueued run #${id} [${tabId}]: ${expression.slice(0, 40)}${expression.length > 40 ? "…" : ""}`)
      ws.updateEngineTelemetry()

      // The active tab's request drives the live diagnostic stream; a
      // background tab's own edits still get evaluated (so IT stays current
      // for when the user switches to it) but don't need the streaming
      // event overhead.
      engineWorker.postMessage({ id, tabId, expression, stream: isActiveTab })
    }, 150),
  )
}

/**
 * Tell the worker a tab is gone so it can release that tab's state.
 * The worker otherwise keeps the tab's last text in `tabDocuments`
 * forever and keeps re-evaluating the closed document on every
 * cross-tab global-variable refresh.
 */
export function closeTab(tabId: string): void {
  const existing = runTimeouts.get(tabId)
  if (existing) {
    clearTimeout(existing)
    runTimeouts.delete(tabId)
  }
  latestRequestId.delete(tabId)
  engineWorker.postMessage({ tabId, close: true })
}

export function abort(tabId: string): void {
  engineWorker.postMessage({ id: latestRequestId.get(tabId) ?? 0, tabId, abort: true })
  const existing = runTimeouts.get(tabId)
  if (existing) {
    clearTimeout(existing)
    runTimeouts.delete(tabId)
  }
  if (useTabsStore.getState().isActive(tabId)) {
    useDiagnosticReportStore.getState().setStatus("ready")
  }
}
