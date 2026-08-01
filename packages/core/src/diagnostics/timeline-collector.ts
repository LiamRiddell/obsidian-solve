import { DiagnosticCollector } from "./collector";
import { DiagnosticReport, DiagnosticReportJSON, DiagnosticEvent, CategorizedParselet } from "./events";

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

  // Incrementally-maintained summary state — see getReport()'s doc comment
  // for why these exist. Each mirrors exactly what getReport() used to
  // recompute by rescanning the full `events` array on every call.
  private totalTokens = 0;
  private cacheHitSeen = false;
  private vmStepSeen = false;
  private hasBytecodeBuilt = false;
  private firstBytecodeOpcodesLength = 0;
  private parseletMatches: CategorizedParselet[] = [];
  private lastExpression = "";
  private lastInputType = "";

  /**
   * Current cumulative count of `parselet_matched` events seen since
   * construction (or the last `reset()`) — a cheap peek that doesn't build
   * the full report (`getReport()` copies the whole `parseletMatches`
   * array). Used by `ExpressionEngine.evaluateExpressionWithDiagnostic()`
   * to capture a "before" baseline per line, since `parseletMatches` itself
   * is deliberately cumulative across an entire document pass (see
   * `onPipelineStart`'s doc comment) rather than reset per line.
   */
  get parseletMatchCount(): number {
    return this.parseletMatches.length;
  }

  reset(): void {
    this.events = [];
    this.parseletEntries.clear();
    this.startNs = 0;
    this.totalTokens = 0;
    this.cacheHitSeen = false;
    this.vmStepSeen = false;
    this.hasBytecodeBuilt = false;
    this.firstBytecodeOpcodesLength = 0;
    this.parseletMatches = [];
    this.lastExpression = "";
    this.lastInputType = "";
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
    // Tracked incrementally (most-recent wins) so getReport()'s `metadata`
    // describes the line THIS report is actually about — reading
    // `events[0]` instead (the old code) froze `expression`/`inputType` on
    // the very first line ever evaluated in the session, forever, which is
    // wrong regardless of whether a field is meant to be cumulative or
    // per-line: nothing downstream ever wanted "line 1's expression" once
    // the document had moved on to line 50.
    this.lastExpression = event.expression;
    this.lastInputType = event.inputType;
    this.events.push(this.stamp(event));
  }

  onTokenEmitted(event: DiagnosticEvent & { type: "token_emitted" }): void {
    this.events.push(this.stamp(event));
    this.totalTokens++;
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

    this.parseletMatches.push({
      tokenType: event.tokenType,
      tokenValue: event.tokenValue,
      parseletCategory: event.parseletCategory,
      parseletType: event.parseletType,
      isPrefix: event.isPrefix,
      bindingPower: event.bindingPower,
      tokenOffset: event.tokenOffset,
    });
  }

  onBytecodeBuilt(event: DiagnosticEvent & { type: "bytecode_built" }): void {
    this.events.push(this.stamp(event));
    // Matches getReport()'s original behavior: the FIRST bytecode_built
    // event ever seen (not the most recent) wins — preserved as-is here,
    // this rewrite only changes HOW that value is computed, not what it is.
    if (!this.hasBytecodeBuilt) {
      this.hasBytecodeBuilt = true;
      this.firstBytecodeOpcodesLength = event.opcodesLength;
    }
  }

  onVmStep(event: DiagnosticEvent & { type: "vm_step" }): void {
    this.events.push(this.stamp(event));
    this.vmStepSeen = true;
  }

  onVmHalt(event: DiagnosticEvent & { type: "vm_halt" }): void {
    this.events.push(this.stamp(event));
  }

  onCacheHit(event: DiagnosticEvent & { type: "cache_hit" }): void {
    this.events.push(this.stamp(event));
    this.cacheHitSeen = true;
  }

  onCacheMiss(event: DiagnosticEvent & { type: "cache_miss" }): void {
    this.events.push(this.stamp(event));
  }

  onPipelineEnd(event: DiagnosticEvent & { type: "pipeline_end" }): void {
    this.events.push(this.stamp(event));
  }

/**
 * Build the summary/metadata/parselets report from this collector's
 * running state.
 *
 * These fields used to be recomputed by rescanning the FULL `events`
 * array on every single call (`.some()`/`.filter()`/a manual scan) — since
 * `events` is never cleared except by an explicit `reset()` (which nothing
 * in `ExpressionEngine` currently calls — the cumulative-across-the-whole-
 * document design is deliberate, see `onPipelineStart`'s comment and the
 * playground's `buildLineStats()`, which slices per-line events out of
 * this ever-growing array via cumulative-length diffing), that meant
 * per-call cost grew linearly with total prior calls: O(n²) diagnostic-mode
 * evaluation over a document's lifetime. Fixed by maintaining each of these
 * incrementally as events arrive (see the `on*` handlers above), the same
 * pattern already used for `parseletEntries`. Every value produced here is
 * identical to what the old rescanning code produced — including its
 * existing "first bytecode_built event wins" quirk — this is a performance
 * fix, not a behavior change.
 */
getReport(): DiagnosticReport | undefined {
     if (this.events.length === 0) return undefined;

     const elapsedNs = performance.now() * 1e6 - this.startNs;

     const parseCategories = new Map<string, number>();
     for (const [, entry] of this.parseletEntries) {
       parseCategories.set(entry.category, entry.count);
     }

     const totalOpcodes = this.firstBytecodeOpcodesLength;
     const cacheHit = this.cacheHitSeen;
     const totalTokens = this.totalTokens;

     const report: DiagnosticReport = {
       events: this.events,
       parselets: this.parseletMatches.map((e) => ({ ...e })),
       summary: {
         totalTokens,
         totalParselets: parseCategories.size,
         totalOpcodes,
         cacheHit,
         elapsedNs,
         parseCategories,
       },
       metadata: {
         expression: this.lastExpression,
         inputType: this.lastInputType,
         timestamp: Date.now(),
         vmTraceEnabled: this.vmStepSeen,
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