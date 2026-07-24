import { DiagnosticCollector } from "./collector";
import { DiagnosticReport, DiagnosticReportJSON, DiagnosticEvent } from "./events";

/**
 * Collects all pipeline events with high-resolution timestamps.
 *
 * Overrides the zero-filled `elapsedNs` on every incoming event with a
 * real `performance.now()` delta from `onPipelineStart`. This enables
 * per-stage timing extraction from the event timeline (lexer/parser/
 * compiler/VM breakdown) rather than relying on a single total elapsed.
 *
 * Produces a complete DiagnosticReport at the end of evaluation.
 */
export class TimelineDiagnosticCollector extends DiagnosticCollector {
  private events: DiagnosticEvent[] = [];
  private startNs: number = 0;
  private parseletEntries: Map<string, { category: string; count: number }> = new Map();

  reset(): void {
    this.events = [];
    this.parseletEntries.clear();
    this.startNs = 0;
  }

  /** Stamp the real wall-clock `elapsedNs` onto an event before storing it. */
  private stamp<T extends DiagnosticEvent>(event: T): T {
    const elapsedNs = this.startNs !== 0
      ? performance.now() * 1e6 - this.startNs
      : 0;
    return { ...event, elapsedNs } as T;
  }

  onPipelineStart(event: DiagnosticEvent & { type: "pipeline_start" }): void {
    // Set once per collector lifetime (until an explicit reset()), not on
    // every pipeline — a multi-line evaluation pass fires pipeline_start
    // once per line, all appending to the SAME `events` array (see
    // buildLineStats() in the playground, which relies on that shared,
    // ever-growing array to slice out each line's own events via
    // cumulative-length diffing). Resetting the origin on every line meant
    // every individual line's own timestamps were self-consistent, but
    // nothing tied one line's clock to another's — any code trying to
    // compare or span timestamps ACROSS lines (e.g. "how far into this
    // pass are we") had no stable reference point to do it with.
    if (this.startNs === 0) {
      this.startNs = performance.now() * 1e6;
    }
    this.events.push(this.stamp(event));
  }

  onTokenEmitted(event: DiagnosticEvent & { type: "token_emitted" }): void {
    this.events.push(this.stamp(event));
  }

  onNormalizerStart(event: DiagnosticEvent & { type: "normalizer_start" }): void {
    this.events.push(this.stamp(event));
  }

  onTokenFused(event: DiagnosticEvent & { type: "token_fused" }): void {
    this.events.push(this.stamp(event));
  }

  onNormalizerEnd(event: DiagnosticEvent & { type: "normalizer_end" }): void {
    this.events.push(this.stamp(event));
  }

  onParseletMatched(event: DiagnosticEvent & { type: "parselet_matched" }): void {
    this.events.push(this.stamp(event));

    const entry = this.parseletEntries.get(event.parseletCategory);
    if (entry) {
      entry.count++;
    } else {
      this.parseletEntries.set(event.parseletCategory, {
        category: event.parseletCategory,
        count: 1,
      });
    }
  }

  onBytecodeBuilt(event: DiagnosticEvent & { type: "bytecode_built" }): void {
    this.events.push(this.stamp(event));
  }

  onVmStep(event: DiagnosticEvent & { type: "vm_step" }): void {
    this.events.push(this.stamp(event));
  }

  onVmHalt(event: DiagnosticEvent & { type: "vm_halt" }): void {
    this.events.push(this.stamp(event));
  }

  onCacheHit(event: DiagnosticEvent & { type: "cache_hit" }): void {
    this.events.push(this.stamp(event));
  }

  onCacheMiss(event: DiagnosticEvent & { type: "cache_miss" }): void {
    this.events.push(this.stamp(event));
  }

  onPipelineEnd(event: DiagnosticEvent & { type: "pipeline_end" }): void {
    this.events.push(this.stamp(event));
  }

getReport(): DiagnosticReport | undefined {
     if (this.events.length === 0) return undefined;

     const elapsedNs = performance.now() * 1e6 - this.startNs;

     const parseCategories = new Map<string, number>();
     for (const [, entry] of this.parseletEntries) {
       parseCategories.set(entry.category, entry.count);
     }

     let totalOpcodes = 0;
     for (const event of this.events) {
       if (event.type === "bytecode_built") {
         totalOpcodes = event.opcodesLength;
         break;
       }
     }

     const cacheHit = this.events.some((e) => e.type === "cache_hit");
     const totalTokens = this.events.filter((e) => e.type === "token_emitted").length;

     const report: DiagnosticReport = {
       events: this.events,
       parselets: this.events
         .filter((e): e is DiagnosticEvent & { type: "parselet_matched" } => e.type === "parselet_matched")
         .map((e) => ({
           tokenType: e.tokenType,
           tokenValue: e.tokenValue,
           parseletCategory: e.parseletCategory,
           parseletType: e.parseletType,
           isPrefix: e.isPrefix,
           bindingPower: e.bindingPower,
           tokenOffset: e.tokenOffset,
         })),
       summary: {
         totalTokens,
         totalParselets: parseCategories.size,
         totalOpcodes,
         cacheHit,
         elapsedNs,
         parseCategories,
       },
       metadata: {
         expression:
           this.events[0]?.type === "pipeline_start" ? this.events[0].expression : "",
         inputType:
           this.events[0]?.type === "pipeline_start" ? this.events[0].inputType : "",
         timestamp: Date.now(),
         vmTraceEnabled: this.events.some((e) => e.type === "vm_step"),
       },
       toJSON(): DiagnosticReportJSON {
         return {
           events: report.events,
           parselets: report.parselets,
           summary: {
             totalTokens: report.summary.totalTokens,
             totalParselets: report.summary.totalParselets,
             totalOpcodes: report.summary.totalOpcodes,
             cacheHit: report.summary.cacheHit,
             elapsedNs: report.summary.elapsedNs,
             parseCategories: Object.fromEntries(report.summary.parseCategories),
           },
           metadata: { ...report.metadata },
         };
       },
     };

     return report;
   }
}