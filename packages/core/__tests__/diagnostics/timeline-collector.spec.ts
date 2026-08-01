import { describe, test, expect, jest, afterEach } from "@jest/globals";
import { TimelineDiagnosticCollector } from "@solve-js/diagnostics/timeline-collector";

/**
 * Regression coverage for the clock-origin-reset bug: `onPipelineStart()`
 * used to reassign `startNs` on EVERY pipeline, not just the first one.
 * Within one multi-line evaluation pass, every line fires its own
 * pipeline_start into the SAME collector (see engine.ts's per-line loop,
 * which relies on one growing `events` array to slice out each line via
 * cumulative-length diffing) — so resetting the origin per line meant each
 * line's own timestamps were internally consistent, but nothing tied one
 * line's clock to the next: elapsedNs could actually go BACKWARDS at a
 * line boundary, since a later line's origin reset made its own early
 * events start back near zero again.
 */
describe("TimelineDiagnosticCollector — clock origin", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function pipelineStart(expression: string) {
    return { type: "pipeline_start" as const, elapsedNs: 0, expression, inputType: "expression" };
  }
  function pipelineEnd(expression: string) {
    return { type: "pipeline_end" as const, elapsedNs: 0, expression, success: true, totalTokens: 1, totalOpcodes: 1 };
  }

  test("a 3-line pass has monotonically increasing elapsedNs across line boundaries", () => {
    let nowMs = 1000;
    jest.spyOn(performance, "now").mockImplementation(() => nowMs);

    const collector = new TimelineDiagnosticCollector();

    // Line 1
    collector.onPipelineStart(pipelineStart("1 + 1"));
    nowMs += 1;
    collector.onPipelineEnd(pipelineEnd("1 + 1"));

    // Line 2 — starts well after line 1 ended
    nowMs += 100;
    collector.onPipelineStart(pipelineStart("2 + 2"));
    nowMs += 1;
    collector.onPipelineEnd(pipelineEnd("2 + 2"));

    // Line 3 — starts well after line 2 ended
    nowMs += 50;
    collector.onPipelineStart(pipelineStart("3 + 3"));
    nowMs += 1;
    collector.onPipelineEnd(pipelineEnd("3 + 3"));

    const report = collector.getReport();
    expect(report).toBeDefined();
    const events = report!.events;
    expect(events.length).toBe(6);

    for (let i = 1; i < events.length; i++) {
      expect(events[i].elapsedNs).toBeGreaterThanOrEqual(events[i - 1].elapsedNs);
    }

    // Line 3's pipeline_end must be MEANINGFULLY later than line 1's —
    // not reset back near zero, which the old per-pipeline reset produced.
    expect(events[5].elapsedNs).toBeGreaterThan(events[1].elapsedNs);
  });

  test("reset() re-establishes a fresh origin for the next pipeline_start", () => {
    let nowMs = 1000;
    jest.spyOn(performance, "now").mockImplementation(() => nowMs);

    const collector = new TimelineDiagnosticCollector();
    collector.onPipelineStart(pipelineStart("1 + 1"));
    nowMs += 1;
    collector.onPipelineEnd(pipelineEnd("1 + 1"));
    const firstReport = collector.getReport();
    expect(firstReport!.events[0].elapsedNs).toBe(0);

    collector.reset();
    nowMs += 500; // large jump — should NOT leak into the new origin
    collector.onPipelineStart(pipelineStart("2 + 2"));
    nowMs += 1;
    collector.onPipelineEnd(pipelineEnd("2 + 2"));
    const secondReport = collector.getReport();
    expect(secondReport!.events[0].elapsedNs).toBe(0); // fresh origin, not relative to the pre-reset clock
  });
});

/**
 * Regression coverage for the O(n²)-evaluation bug: getReport()'s
 * totalTokens/cacheHit/totalOpcodes/parselets/vmTraceEnabled used to be
 * recomputed by rescanning the ENTIRE `events` array (which is never
 * cleared except by reset() — deliberately cumulative across a whole
 * document's evaluation, see the class's own doc comments) on every single
 * call. Fixed by maintaining each incrementally as events arrive. These
 * tests pin the CORRECTNESS of that incremental bookkeeping (a bug in it
 * would silently produce wrong summary numbers, not a visible crash) by
 * calling getReport() multiple times across a growing event history and
 * checking every value each time, not just once at the end.
 */
describe("TimelineDiagnosticCollector — incremental summary bookkeeping", () => {
  function tokenEmitted() {
    return {
      type: "token_emitted" as const, elapsedNs: 0,
      token: { type: "NUMBER", value: "1", offset: 0, line: 1, col: 1 },
    };
  }
  function parseletMatched(category: string) {
    return {
      type: "parselet_matched" as const, elapsedNs: 0,
      tokenType: "NUMBER", tokenValue: "1", parseletCategory: category,
      parseletType: "prefix", isPrefix: true, bindingPower: 0, tokenOffset: 0,
    };
  }
  function bytecodeBuilt(opcodesLength: number) {
    return {
      type: "bytecode_built" as const, elapsedNs: 0,
      opcodesLength, numbersLength: 0, stringsLength: 0, isCached: false,
    };
  }
  function cacheHit() {
    return { type: "cache_hit" as const, elapsedNs: 0, cache: "bytecode" as const, key: "k" };
  }
  function vmStep() {
    return {
      type: "vm_step" as const, elapsedNs: 0,
      opcode: 0, opcodeName: "NOP", stackDepth: 0, ip: 0,
    };
  }

  test("totalTokens accumulates correctly and matches across repeated getReport() calls", () => {
    const collector = new TimelineDiagnosticCollector();
    collector.onPipelineStart({ type: "pipeline_start", elapsedNs: 0, expression: "x", inputType: "expression" });
    collector.onTokenEmitted(tokenEmitted());
    expect(collector.getReport()!.summary.totalTokens).toBe(1);

    collector.onTokenEmitted(tokenEmitted());
    collector.onTokenEmitted(tokenEmitted());
    expect(collector.getReport()!.summary.totalTokens).toBe(3);
    // Calling getReport() again without new events must return the same value.
    expect(collector.getReport()!.summary.totalTokens).toBe(3);
  });

  test("cacheHit stays true once seen, even after later getReport() calls with no new cache_hit", () => {
    const collector = new TimelineDiagnosticCollector();
    collector.onPipelineStart({ type: "pipeline_start", elapsedNs: 0, expression: "x", inputType: "expression" });
    expect(collector.getReport()!.summary.cacheHit).toBe(false);

    collector.onCacheHit(cacheHit());
    expect(collector.getReport()!.summary.cacheHit).toBe(true);

    collector.onTokenEmitted(tokenEmitted());
    expect(collector.getReport()!.summary.cacheHit).toBe(true);
  });

  test("totalOpcodes reflects the FIRST bytecode_built event, not the most recent (preserves original behavior)", () => {
    const collector = new TimelineDiagnosticCollector();
    collector.onPipelineStart({ type: "pipeline_start", elapsedNs: 0, expression: "x", inputType: "expression" });
    collector.onBytecodeBuilt(bytecodeBuilt(10));
    expect(collector.getReport()!.summary.totalOpcodes).toBe(10);

    collector.onBytecodeBuilt(bytecodeBuilt(999));
    expect(collector.getReport()!.summary.totalOpcodes).toBe(10);
  });

  test("parselets array accumulates every parselet_matched event with correct fields, across repeated calls", () => {
    const collector = new TimelineDiagnosticCollector();
    collector.onPipelineStart({ type: "pipeline_start", elapsedNs: 0, expression: "x", inputType: "expression" });
    collector.onParseletMatched(parseletMatched("Arithmetic"));
    expect(collector.getReport()!.parselets).toEqual([
      { tokenType: "NUMBER", tokenValue: "1", parseletCategory: "Arithmetic", parseletType: "prefix", isPrefix: true, bindingPower: 0, tokenOffset: 0 },
    ]);

    collector.onParseletMatched(parseletMatched("UoM"));
    const report = collector.getReport()!;
    expect(report.parselets.length).toBe(2);
    expect(report.summary.parseCategories.get("Arithmetic")).toBe(1);
    expect(report.summary.parseCategories.get("UoM")).toBe(1);
    expect(report.summary.totalParselets).toBe(2);
  });

  test("vmTraceEnabled reflects whether any vm_step event has occurred", () => {
    const collector = new TimelineDiagnosticCollector();
    collector.onPipelineStart({ type: "pipeline_start", elapsedNs: 0, expression: "x", inputType: "expression" });
    expect(collector.getReport()!.metadata.vmTraceEnabled).toBe(false);

    collector.onVmStep(vmStep());
    expect(collector.getReport()!.metadata.vmTraceEnabled).toBe(true);
  });

  test("reset() clears all incremental summary state back to its initial values", () => {
    const collector = new TimelineDiagnosticCollector();
    collector.onPipelineStart({ type: "pipeline_start", elapsedNs: 0, expression: "x", inputType: "expression" });
    collector.onTokenEmitted(tokenEmitted());
    collector.onCacheHit(cacheHit());
    collector.onBytecodeBuilt(bytecodeBuilt(5));
    collector.onParseletMatched(parseletMatched("Arithmetic"));
    collector.onVmStep(vmStep());

    collector.reset();
    expect(collector.getReport()).toBeUndefined(); // no events since reset — empty collector

    collector.onPipelineStart({ type: "pipeline_start", elapsedNs: 0, expression: "y", inputType: "expression" });
    const report = collector.getReport()!;
    expect(report.summary.totalTokens).toBe(0);
    expect(report.summary.cacheHit).toBe(false);
    expect(report.summary.totalOpcodes).toBe(0);
    expect(report.parselets).toEqual([]);
    expect(report.metadata.vmTraceEnabled).toBe(false);
  });
});
