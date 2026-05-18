import { DiagnosticCollector } from "./collector";
import { DiagnosticReport, DiagnosticReportJSON, DiagnosticEvent } from "./events";
import { DiagnosticEventType } from "./events";

/**
 * Collects all pipeline events with high-resolution timestamps.
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

  onPipelineStart(event: DiagnosticEvent & { type: "pipeline_start" }): void {
    this.startNs = performance.now() * 1e6;
    this.events.push(event);
  }

  onTokenEmitted(event: DiagnosticEvent & { type: "token_emitted" }): void {
    this.events.push(event);
  }

  onParseletMatched(event: DiagnosticEvent & { type: "parselet_matched" }): void {
    this.events.push(event);

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
    this.events.push(event);
  }

  onVmStep(event: DiagnosticEvent & { type: "vm_step" }): void {
    this.events.push(event);
  }

  onVmHalt(event: DiagnosticEvent & { type: "vm_halt" }): void {
    this.events.push(event);
  }

  onCacheHit(event: DiagnosticEvent & { type: "cache_hit" }): void {
    this.events.push(event);
  }

  onCacheMiss(event: DiagnosticEvent & { type: "cache_miss" }): void {
    this.events.push(event);
  }

  onPipelineEnd(event: DiagnosticEvent & { type: "pipeline_end" }): void {
    this.events.push(event);
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