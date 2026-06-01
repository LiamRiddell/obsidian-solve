import { DiagnosticEvent } from "./events";
import { DiagnosticReport } from "./events";

/**
 * Interface for collecting diagnostic data during pipeline execution.
 *
 * All methods are implemented as concrete no-ops so subclasses only
 * need to override the ones they care about. This avoids optional
 * method issues with TypeScript's strict mode.
 */
export abstract class DiagnosticCollector {
  onPipelineStart(event: DiagnosticEvent & { type: "pipeline_start" }): void {}
  onTokenEmitted(event: DiagnosticEvent & { type: "token_emitted" }): void {}
  onNormalizerStart(event: DiagnosticEvent & { type: "normalizer_start" }): void {}
  onTokenFused(event: DiagnosticEvent & { type: "token_fused" }): void {}
  onNormalizerEnd(event: DiagnosticEvent & { type: "normalizer_end" }): void {}
  onParseletMatched(event: DiagnosticEvent & { type: "parselet_matched" }): void {}
  onBytecodeBuilt(event: DiagnosticEvent & { type: "bytecode_built" }): void {}
  onVmStep(event: DiagnosticEvent & { type: "vm_step" }): void {}
  onVmHalt(event: DiagnosticEvent & { type: "vm_halt" }): void {}
  onCacheHit(event: DiagnosticEvent & { type: "cache_hit" }): void {}
  onCacheMiss(event: DiagnosticEvent & { type: "cache_miss" }): void {}
  onPipelineEnd(event: DiagnosticEvent & { type: "pipeline_end" }): void {}

  abstract getReport(): DiagnosticReport | undefined;
  abstract reset(): void;
}