import { test, expect, describe } from "@jest/globals";
import { sumLineStats, buildDocumentStats, extractStageTimings, extractLineTimings } from "@bridge/engineShared";

/**
 * Regression coverage for the Perf tab's "Total" figure.
 *
 * Root cause: within one evaluation pass, every line's diagnostic events
 * are appended to ONE growing array (see engine.ts's per-line loop) —
 * intentional, since buildLineStats() relies on that cumulative growth to
 * isolate each line's own slice via snapshot-length diffing. But
 * extractStageTimings() finds `pipeline_start`/`pipeline_end` via `.find()`
 * — the FIRST match — so handing it that combined multi-line array doesn't
 * compute a document-wide total at all: it silently returns line 1's own
 * (typically tiny) span, mislabeled as "Total". A five-line document where
 * line 1 is a cached, trivial expression reported a "Total" of a few
 * hundred nanoseconds regardless of how long the rest of the document (or
 * an async settle) actually took — exactly the bug reported live.
 */
describe("sumLineStats", () => {
  test("sums each stat field across all lines", () => {
    const lineStats = [
      { lineNumber: 1, stats: { lexerTime: 10, parserTime: 20, bytecodeTime: 5, executionTime: 15, totalTime: 50 } },
      { lineNumber: 2, stats: { lexerTime: 100, parserTime: 200, bytecodeTime: 50, executionTime: 150, totalTime: 500 } },
      { lineNumber: 3, stats: { lexerTime: 1000, parserTime: 2000, bytecodeTime: 500, executionTime: 1500, totalTime: 5000 } },
    ];
    const sum = sumLineStats(lineStats);
    expect(sum).toEqual({
      lexerTime: 1110,
      parserTime: 2220,
      bytecodeTime: 555,
      executionTime: 1665,
      totalTime: 5550,
    });
  });

  test("returns zeros for an empty line list", () => {
    expect(sumLineStats([])).toEqual({
      lexerTime: 0, parserTime: 0, bytecodeTime: 0, executionTime: 0, totalTime: 0,
    });
  });
});

describe("buildDocumentStats", () => {
  test("sums across lines where extractStageTimings on the raw combined array only finds line 1's span", () => {
    const combinedEvents = [
      { type: "pipeline_start", elapsedNs: 0 },
      { type: "token_emitted", elapsedNs: 10 },
      { type: "pipeline_end", elapsedNs: 50 }, // line 1 ends here — tiny
      { type: "pipeline_start", elapsedNs: 1000 }, // line 2 starts much later
      { type: "token_emitted", elapsedNs: 1010 },
      { type: "pipeline_end", elapsedNs: 5000 }, // line 2's real span is huge
    ];

    // Confirms the bug in isolation: fed the combined stream directly,
    // extractStageTimings only ever sees the FIRST pipeline_start/end pair.
    expect(extractStageTimings(combinedEvents).totalTime).toBe(50);

    const lineStats = [
      { lineNumber: 1, stats: extractLineTimings(combinedEvents.slice(0, 3)) },
      { lineNumber: 2, stats: extractLineTimings(combinedEvents.slice(3, 6)) },
    ];
    const fixed = buildDocumentStats(combinedEvents, lineStats);
    expect(fixed.totalTime).toBe(4050); // 50 (line 1) + 4000 (line 2) — the real cross-line total
  });

  test("falls back to extractStageTimings when there's no per-line breakdown", () => {
    const events = [
      { type: "pipeline_start", elapsedNs: 0 },
      { type: "pipeline_end", elapsedNs: 123 },
    ];
    expect(buildDocumentStats(events, []).totalTime).toBe(123);
  });

  test("single-line documents are unaffected — sum of one line equals that line's own total", () => {
    const events = [
      { type: "pipeline_start", elapsedNs: 0 },
      { type: "token_emitted", elapsedNs: 5 },
      { type: "pipeline_end", elapsedNs: 42 },
    ];
    const lineStats = [{ lineNumber: 1, stats: extractLineTimings(events) }];
    expect(buildDocumentStats(events, lineStats).totalTime).toBe(extractStageTimings(events).totalTime);
  });
});
