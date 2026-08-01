import {
  Terminal,
  LayoutDashboard,
  RefreshCw,
  Waypoints,
  Database,
  Wrench,
  Braces,
  Zap,
  Share2,
  Settings,
  Gauge,
  Radio,
  FlaskConical,
  AlertTriangle,
} from "lucide-react"
import { useDiagnosticReportStore } from "@/stores/diagnosticReport"
import { useUiStore, type ActiveTab } from "@/stores/ui"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { OutputTab } from "@/components/tabs/OutputTab"
import { SummaryTab } from "@/components/tabs/SummaryTab"
import { ErrorsTab } from "@/components/tabs/ErrorsTab"
import { QaTab } from "@/components/tabs/QaTab"
import { PipelineTab } from "@/components/tabs/PipelineTab"
import { BytecodeTab } from "@/components/tabs/BytecodeTab"
import { VmTraceTab } from "@/components/tabs/VmTraceTab"
import { PerfTab } from "@/components/tabs/PerfTab"
import { WorkersTab } from "@/components/tabs/WorkersTab"
import { CacheTab } from "@/components/tabs/CacheTab"
import { StreamTab } from "@/components/tabs/StreamTab"
import { DagTab } from "@/components/tabs/DagTab"
import { ParseletRegistryTab } from "@/components/tabs/ParseletRegistryTab"
import { NormalizerTab } from "@/components/tabs/NormalizerTab"
import { cn } from "@/lib/utils"

const TABS: { id: ActiveTab; label: string; icon: typeof Terminal }[] = [
  { id: "tokens", label: "Output", icon: Terminal },
  { id: "summary", label: "Summary", icon: LayoutDashboard },
  { id: "errors", label: "Errors", icon: AlertTriangle },
  { id: "normalizer", label: "Normalizer", icon: RefreshCw },
  { id: "flow", label: "Pipeline", icon: Waypoints },
  { id: "cache", label: "Cache", icon: Database },
  { id: "parselets", label: "Parselets", icon: Wrench },
  { id: "bytecode", label: "Bytecode", icon: Braces },
  { id: "vmtrace", label: "VM Trace", icon: Zap },
  { id: "dag", label: "DAG", icon: Share2 },
  { id: "workers", label: "Workers", icon: Settings },
  { id: "perf", label: "Perf", icon: Gauge },
  { id: "stream", label: "Stream", icon: Radio },
  { id: "qa", label: "QA", icon: FlaskConical },
]

/**
 * Hosts the 13 diagnostic/introspection tabs behind a shadcn Tabs nav.
 * Ported from playground's DiagnosticsPane.vue.
 */
export function DiagnosticsPane() {
  const activeTab = useUiStore((s) => s.activeTab)
  const setActiveTab = useUiStore((s) => s.setActiveTab)
  const diagnosticsCollapsed = useUiStore((s) => s.diagnosticsCollapsed)
  // Each tab remounts on every new evaluation (mirrors the Vue original's
  // `:key="dr.runId"` on the dynamically-rendered tab component), so a
  // tab's local UI state (expanded sections, collapsed groups, etc.)
  // doesn't carry over stale assumptions about the previous result's shape.
  const runId = useDiagnosticReportStore((s) => s.runId)
  const errorCount = useDiagnosticReportStore((s) => s.lineResults.filter((lr) => lr.error).length)

  return (
    <section className={cn("flex min-h-0 flex-1 flex-col", diagnosticsCollapsed && "w-0 min-w-0 overflow-hidden")}>
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ActiveTab)} className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList variant="line" className="bg-card/40 h-9 w-full justify-start overflow-x-auto border-b px-2">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="gap-1.5 text-xs">
              <tab.icon className="size-3.5" /> {tab.label}
              {tab.id === "errors" && errorCount > 0 && (
                <span className="bg-destructive text-destructive-foreground ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none">
                  {errorCount}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="tokens" className="mt-0 flex min-h-0 flex-col">
          <OutputTab key={runId} />
        </TabsContent>
        <TabsContent value="summary" className="mt-0 flex min-h-0 flex-col">
          <SummaryTab key={runId} />
        </TabsContent>
        <TabsContent value="errors" className="mt-0 flex min-h-0 flex-col">
          <ErrorsTab key={runId} />
        </TabsContent>
        <TabsContent value="normalizer" className="mt-0 flex min-h-0 flex-col">
          <NormalizerTab key={runId} />
        </TabsContent>
        <TabsContent value="flow" className="mt-0 flex min-h-0 flex-col">
          <PipelineTab key={runId} />
        </TabsContent>
        <TabsContent value="cache" className="mt-0 flex min-h-0 flex-col">
          <CacheTab key={runId} />
        </TabsContent>
        <TabsContent value="parselets" className="mt-0 flex min-h-0 flex-col">
          <ParseletRegistryTab key={runId} />
        </TabsContent>
        <TabsContent value="bytecode" className="mt-0 flex min-h-0 flex-col">
          <BytecodeTab key={runId} />
        </TabsContent>
        <TabsContent value="vmtrace" className="mt-0 flex min-h-0 flex-col">
          <VmTraceTab key={runId} />
        </TabsContent>
        <TabsContent value="dag" className="mt-0 flex min-h-0 flex-col">
          <DagTab key={runId} />
        </TabsContent>
        <TabsContent value="workers" className="mt-0 flex min-h-0 flex-col">
          <WorkersTab key={runId} />
        </TabsContent>
        <TabsContent value="perf" className="mt-0 flex min-h-0 flex-col">
          <PerfTab key={runId} />
        </TabsContent>
        <TabsContent value="stream" className="mt-0 flex min-h-0 flex-col">
          <StreamTab key={runId} />
        </TabsContent>
        <TabsContent value="qa" className="mt-0 flex min-h-0 flex-col">
          <QaTab />
        </TabsContent>
      </Tabs>
    </section>
  )
}
