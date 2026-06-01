import { DiagnosticCollector } from "./collector";
import { DiagnosticEvent } from "./events";
import { DiagnosticReport } from "./events";

/**
 * Dispatches diagnostic events to all registered collectors.
 *
 * Performance guarantee: when no collectors are registered (production mode),
 * every dispatch method is a branch on `this.collectors.length === 0` which
 * modern JS engines will predict and eliminate. The overhead is a single
 * comparison per call — effectively zero.
 */
export class DiagnosticPipeline {
  private collectors: DiagnosticCollector[] = [];

  register(collector: DiagnosticCollector): void {
    this.collectors.push(collector);
  }

  unregister(collector: DiagnosticCollector): void {
    const idx = this.collectors.indexOf(collector);
    if (idx !== -1) this.collectors.splice(idx, 1);
  }

  clear(): void {
    this.collectors = [];
  }

  get hasCollectors(): boolean {
    return this.collectors.length > 0;
  }

  get collectorCount(): number {
    return this.collectors.length;
  }

  // Inline-optimized dispatchers — each checks length once then loops.
  // When collectors.length === 0, the JIT eliminates the entire method body.

  firePipelineStart(event: DiagnosticEvent & { type: "pipeline_start" }): void {
    if (this.collectors.length === 0) return;
    for (const c of this.collectors) c.onPipelineStart?.(event);
  }

  fireTokenEmitted(event: DiagnosticEvent & { type: "token_emitted" }): void {
    if (this.collectors.length === 0) return;
    for (const c of this.collectors) c.onTokenEmitted?.(event);
  }

  fireNormalizerStart(event: DiagnosticEvent & { type: "normalizer_start" }): void {
    if (this.collectors.length === 0) return;
    for (const c of this.collectors) c.onNormalizerStart?.(event);
  }

  fireTokenFused(event: DiagnosticEvent & { type: "token_fused" }): void {
    if (this.collectors.length === 0) return;
    for (const c of this.collectors) c.onTokenFused?.(event);
  }

  fireNormalizerEnd(event: DiagnosticEvent & { type: "normalizer_end" }): void {
    if (this.collectors.length === 0) return;
    for (const c of this.collectors) c.onNormalizerEnd?.(event);
  }

  fireParseletMatched(event: DiagnosticEvent & { type: "parselet_matched" }): void {
    if (this.collectors.length === 0) return;
    for (const c of this.collectors) c.onParseletMatched?.(event);
  }

  fireBytecodeBuilt(event: DiagnosticEvent & { type: "bytecode_built" }): void {
    if (this.collectors.length === 0) return;
    for (const c of this.collectors) c.onBytecodeBuilt?.(event);
  }

  fireVmStep(event: DiagnosticEvent & { type: "vm_step" }): void {
    if (this.collectors.length === 0) return;
    for (const c of this.collectors) c.onVmStep?.(event);
  }

  fireVmHalt(event: DiagnosticEvent & { type: "vm_halt" }): void {
    if (this.collectors.length === 0) return;
    for (const c of this.collectors) c.onVmHalt?.(event);
  }

  fireCacheHit(event: DiagnosticEvent & { type: "cache_hit" }): void {
    if (this.collectors.length === 0) return;
    for (const c of this.collectors) c.onCacheHit?.(event);
  }

  fireCacheMiss(event: DiagnosticEvent & { type: "cache_miss" }): void {
    if (this.collectors.length === 0) return;
    for (const c of this.collectors) c.onCacheMiss?.(event);
  }

  firePipelineEnd(event: DiagnosticEvent & { type: "pipeline_end" }): void {
    if (this.collectors.length === 0) return;
    for (const c of this.collectors) c.onPipelineEnd?.(event);
  }

  collectReports(): DiagnosticReport[] {
    const reports: DiagnosticReport[] = [];
    for (const c of this.collectors) {
      const report = c.getReport();
      if (report) reports.push(report);
    }
    return reports;
  }

  reset(): void {
    for (const c of this.collectors) c.reset();
  }
}