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
