import { test, expect, describe, beforeEach } from "@jest/globals";
import { createPinia, setActivePinia } from "pinia";
import { useDiagnosticReportStore } from "../stores/diagnosticReport";

beforeEach(() => {
  setActivePinia(createPinia());
});

/**
 * Regression coverage for the Perf tab's "Total" not reflecting async
 * settle time. `stats` used to be populated once from the synchronous
 * portion of evaluation and never otherwise updated, so "Total" never
 * included how long the user actually waited for a currency/OSRS-price
 * fetch to resolve. recordAsyncElapsed() folds each async_resolved/
 * async_error event's own elapsedNs in as it arrives — see its doc
 * comment for why there's no single "stream settled" moment to wait for
 * instead.
 */
describe("useDiagnosticReportStore.recordAsyncElapsed", () => {
  test("grows stats.totalTime when a larger async elapsedNs lands", () => {
    const dr = useDiagnosticReportStore();
    dr.setResult({
      stats: { lexerTime: 0, parserTime: 0, bytecodeTime: 0, executionTime: 0, totalTime: 100 },
    } as any);
    expect(dr.stats!.totalTime).toBe(100);

    dr.recordAsyncElapsed(5000); // e.g. a currency fetch that took 5000ns to settle
    expect(dr.stats!.totalTime).toBe(5000);
  });

  test("never shrinks totalTime — a smaller elapsedNs is a no-op", () => {
    const dr = useDiagnosticReportStore();
    dr.setResult({
      stats: { lexerTime: 0, parserTime: 0, bytecodeTime: 0, executionTime: 0, totalTime: 1000 },
    } as any);

    dr.recordAsyncElapsed(500);
    expect(dr.stats!.totalTime).toBe(1000);
  });

  test("multiple async events converge to the largest observed elapsedNs (last one to settle)", () => {
    const dr = useDiagnosticReportStore();
    dr.setResult({
      stats: { lexerTime: 0, parserTime: 0, bytecodeTime: 0, executionTime: 0, totalTime: 0 },
    } as any);

    dr.recordAsyncElapsed(2000); // first async op settles
    dr.recordAsyncElapsed(6000); // second, slower op settles later
    dr.recordAsyncElapsed(4000); // a third that happened to settle earlier, in between
    expect(dr.stats!.totalTime).toBe(6000);
  });

  test("does nothing when there's no result yet (stats is null)", () => {
    const dr = useDiagnosticReportStore();
    expect(dr.stats).toBeNull();
    dr.recordAsyncElapsed(5000);
    expect(dr.stats).toBeNull();
  });
});
