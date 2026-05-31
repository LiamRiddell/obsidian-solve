/**
 * AllocationTracker Unit Tests
 *
 * Tests the AllocationTracker class in isolation and integrated into
 * ExpressionEngine.evaluateExpressionWithDiagnostic().
 *
 * Requirements:
 *   - AllocationTracker.enable() / disable() toggle correctly
 *   - track() returns result + alloc when enabled, result + null when disabled
 *   - ExpressionEngine populates lastTelemetry after evaluation
 *   - Stages are lexer, parser, vm (in order)
 *   - Cache hits produce cacheHit: true on vm stage
 *   - PipelineTelemetry has correct totals
 */

import { afterEach, describe, expect, test } from "@jest/globals";
import { AllocationTracker } from "@solve-js/telemetry";
import type { PipelineTelemetry, StageAllocation } from "@solve-js/telemetry";
import {
    createTrackedEngine,
    evalWithTelemetry,
    expectStages,
    expectValidTelemetry,
    expectCacheHit,
    expectWallTimeInRange,
} from "@tools/allocationTestUtils";

// ── Setup / Teardown ──────────────────────────────────────────────────────

afterEach(() => {
    // Ensure tracking is disabled between tests to avoid cross-test contamination
    AllocationTracker.disable();
});

// ── AllocationTracker (Isolated) ───────────────────────────────────────────

describe("AllocationTracker (isolated)", () => {
    test("isEnabled() returns false by default", () => {
        expect(AllocationTracker.isEnabled()).toBe(false);
    });

    test("enable() sets isEnabled() to true", () => {
        AllocationTracker.enable();
        expect(AllocationTracker.isEnabled()).toBe(true);
    });

    test("disable() sets isEnabled() to false", () => {
        AllocationTracker.enable();
        AllocationTracker.disable();
        expect(AllocationTracker.isEnabled()).toBe(false);
    });

    test("enable() is idempotent", () => {
        AllocationTracker.enable();
        AllocationTracker.enable();
        expect(AllocationTracker.isEnabled()).toBe(true);
    });

    test("disable() is idempotent", () => {
        AllocationTracker.disable();
        AllocationTracker.disable();
        expect(AllocationTracker.isEnabled()).toBe(false);
    });

    test("track() returns result when disabled (zero overhead)", () => {
        // Tracking is disabled by default
        const { result, alloc } = AllocationTracker.track("lexer", () => 42);
        expect(result).toBe(42);
        expect(alloc).toBeNull();
    });

    test("track() returns result + alloc when enabled", () => {
        AllocationTracker.enable();
        const { result, alloc } = AllocationTracker.track("lexer", () => 99);
        expect(result).toBe(99);
        expect(alloc).not.toBeNull();
        expect(alloc!.stage).toBe("lexer");
        expect(alloc!.wallTimeNs).toBeGreaterThanOrEqual(0);
        expect(alloc!.allocCount).toBe(0); // Reserved for Phase 2+
    });

    test("track() captures wall time > 0 for non-trivial work", () => {
        AllocationTracker.enable();
        const { alloc } = AllocationTracker.track("vm", () => {
            // Simulate some work
            let sum = 0;
            for (let i = 0; i < 10000; i++) sum += i;
            return sum;
        });
        expect(alloc!.wallTimeNs).toBeGreaterThan(0);
    });

    test("track() propagates errors without swallowing them", () => {
        AllocationTracker.enable();
        expect(() => {
            AllocationTracker.track("parser", () => {
                throw new Error("parse failure");
            });
        }).toThrow("parse failure");
    });

    test("track() accepts subStage and cacheHit options", () => {
        AllocationTracker.enable();
        const { alloc } = AllocationTracker.track("vm", () => 1, {
            subStage: "executeCached",
            cacheHit: true,
        });
        expect(alloc!.subStage).toBe("executeCached");
        expect(alloc!.cacheHit).toBe(true);
    });
});

// ── Report Generation ─────────────────────────────────────────────────────

describe("AllocationTracker report generation", () => {
    test("createTelemetry() builds PipelineTelemetry with correct totals", () => {
        const stages: StageAllocation[] = [
            { stage: "lexer", allocCount: 0, allocBytes: 1000, objectCounts: {}, wallTimeNs: 5000 },
            { stage: "parser", allocCount: 0, allocBytes: 2000, objectCounts: {}, wallTimeNs: 15000 },
            { stage: "vm", allocCount: 0, allocBytes: 500, objectCounts: {}, wallTimeNs: 3000 },
        ];
        const telemetry = AllocationTracker.createTelemetry("1 + 2", stages, false);
        expect(telemetry.expression).toBe("1 + 2");
        expect(telemetry.fastPath).toBe(false);
        expect(telemetry.totalAllocBytes).toBe(3500);
        expect(telemetry.totalWallTimeNs).toBe(23000);
        expect(telemetry.stages).toHaveLength(3);
    });

    test("aggregate() groups by stage and computes statistics", () => {
        const telemetry: PipelineTelemetry[] = [
            AllocationTracker.createTelemetry("1+2", [
                { stage: "lexer", allocCount: 0, allocBytes: 100, objectCounts: {}, wallTimeNs: 1000 },
                { stage: "vm", allocCount: 0, allocBytes: 50, objectCounts: {}, wallTimeNs: 2000 },
            ]),
            AllocationTracker.createTelemetry("3+4", [
                { stage: "lexer", allocCount: 0, allocBytes: 120, objectCounts: {}, wallTimeNs: 1500 },
                { stage: "vm", allocCount: 0, allocBytes: 60, objectCounts: {}, wallTimeNs: 2500 },
            ]),
        ];

        const agg = AllocationTracker.aggregate(telemetry);
        expect(agg).toHaveLength(2);

        const lexer = agg.find((a) => a.stage === "lexer")!;
        expect(lexer.count).toBe(2);
        expect(lexer.meanAllocBytes).toBe(110);
        expect(lexer.meanWallTimeNs).toBe(1250);
        expect(lexer.minWallTimeNs).toBe(1000);
        expect(lexer.maxWallTimeNs).toBe(1500);

        const vm = agg.find((a) => a.stage === "vm")!;
        expect(vm.count).toBe(2);
        expect(vm.meanAllocBytes).toBe(55);
    });

    test("generateReport() produces markdown with expected sections", () => {
        const telemetry: PipelineTelemetry[] = [
            AllocationTracker.createTelemetry("1+2", [
                { stage: "lexer", allocCount: 0, allocBytes: 100, objectCounts: {}, wallTimeNs: 1000 },
                { stage: "vm", allocCount: 0, allocBytes: 50, objectCounts: {}, wallTimeNs: 2000 },
            ]),
        ];

        const report = AllocationTracker.generateReport(telemetry, "Benchmark Report");
        expect(report).toContain("## Benchmark Report");
        expect(report).toContain("Per-Stage Breakdown");
        expect(report).toContain("Totals");
        expect(report).toContain("lexer");
        expect(report).toContain("vm");
        expect(report).toContain("**Runs:** 1");
    });

    test("generateReport() handles empty telemetry", () => {
        const report = AllocationTracker.generateReport([], "Empty");
        expect(report).toContain("## Empty");
        expect(report).toContain("No telemetry data");
    });
});

// ── ExpressionEngine Integration ──────────────────────────────────────────

describe("ExpressionEngine integration", () => {
    test("getLastTelemetry() returns null when tracking is disabled", () => {
        const { engine, cleanup } = createTrackedEngine();
        AllocationTracker.disable(); // Disable after creation
        evalWithTelemetry(engine, "1 + 2");
        expect(engine.getLastTelemetry()).toBeNull();
        cleanup();
    });

    test("getLastTelemetry() returns PipelineTelemetry after evaluation", () => {
        const { engine, cleanup } = createTrackedEngine();
        const { telemetry } = evalWithTelemetry(engine, "1 + 2");
        expect(telemetry).not.toBeNull();
        expect(telemetry!.expression).toBe("1 + 2");
        expect(telemetry!.fastPath).toBe(false);
        cleanup();
    });

    test("pipeline telemetry contains lexer, parser, and vm stages", () => {
        const { engine, cleanup } = createTrackedEngine();
        const { telemetry } = evalWithTelemetry(engine, "3 * (4 + 5)");
        expectStages(telemetry, ["lexer", "parser", "vm"]);
        cleanup();
    });

    test("all stages have valid wall times and non-negative alloc bytes", () => {
        const { engine, cleanup } = createTrackedEngine();
        const { telemetry } = evalWithTelemetry(engine, "10 + 20 * 3");
        expectValidTelemetry(telemetry);
        cleanup();
    });

    test("lexer stage wall time is reasonable (< 5ms for simple expression)", () => {
        const { engine, cleanup } = createTrackedEngine();
        const { telemetry } = evalWithTelemetry(engine, "42");
        const lexerStage = telemetry!.stages.find((s) => s.stage === "lexer")!;
        expectWallTimeInRange(lexerStage, 0, 5_000_000, "lexer"); // < 5ms in ns
        cleanup();
    });

    test("parser stage wall time is reasonable (< 10ms for simple expression)", () => {
        const { engine, cleanup } = createTrackedEngine();
        const { telemetry } = evalWithTelemetry(engine, "1 + 2 + 3 + 4 + 5");
        const parserStage = telemetry!.stages.find((s) => s.stage === "parser")!;
        expectWallTimeInRange(parserStage, 0, 10_000_000, "parser"); // < 10ms
        cleanup();
    });

    test("vm stage wall time is reasonable (< 5ms for simple expression)", () => {
        const { engine, cleanup } = createTrackedEngine();
        const { telemetry } = evalWithTelemetry(engine, "100 + 200");
        const vmStage = telemetry!.stages.find((s) => s.stage === "vm")!;
        expectWallTimeInRange(vmStage, 0, 5_000_000, "vm"); // < 5ms
        cleanup();
    });

    test("bytecode cache hit sets cacheHit on vm stage", () => {
        const { engine, cleanup } = createTrackedEngine();

        // First evaluation: cache miss → lexer + parser + vm
        evalWithTelemetry(engine, "1 + 2");

        // Second evaluation: cache hit → vm only (lexer + parser skipped)
        const { telemetry } = evalWithTelemetry(engine, "1 + 2");

        expectCacheHit(telemetry, "vm", true);
        // On cache hit, lexer still runs (tokenization always happens),
        // but parser stage is skipped (bytecode reused from cache).
        expect(telemetry!.stages.find((s) => s.stage === "parser")).toBeUndefined();
        cleanup();
    });

    test("totalWallTimeNs equals sum of stage wall times", () => {
        const { engine, cleanup } = createTrackedEngine();
        const { telemetry } = evalWithTelemetry(engine, "(1 + 2) * (3 + 4) / 5");
        const sum = telemetry!.stages.reduce((s, a) => s + a.wallTimeNs, 0);
        // Allow small floating-point difference
        expect(Math.abs(telemetry!.totalWallTimeNs - sum)).toBeLessThan(10);
        cleanup();
    });

    test("totalAllocBytes equals sum of stage allocBytes", () => {
        const { engine, cleanup } = createTrackedEngine();
        const { telemetry } = evalWithTelemetry(engine, "6 * 7 + 8 / 2");
        const sum = telemetry!.stages.reduce((s, a) => s + a.allocBytes, 0);
        expect(telemetry!.totalAllocBytes).toBe(sum);
        cleanup();
    });

    test("evaluation result is correct even when tracking is enabled", () => {
        const { engine, cleanup } = createTrackedEngine();
        const { value } = evalWithTelemetry(engine, "2 + 3 * 4");
        expect(value).toBeCloseTo(14, 5);
        cleanup();
    });

    test("complex expression produces all three stages", () => {
        const { engine, cleanup } = createTrackedEngine();
        const { telemetry, value } = evalWithTelemetry(engine, "sin(0.5) + cos(0.3) * 2");
        expect(value).toBeCloseTo(Math.sin(0.5) + Math.cos(0.3) * 2, 5);
        expectStages(telemetry, ["lexer", "parser", "vm"]);
        expectValidTelemetry(telemetry);
        cleanup();
    });
});

// ── Performance/Benchmark Integration ──────────────────────────────────────

describe("Performance baseline capture", () => {
    test("captures per-stage timing for baseline comparison", () => {
        const { engine, cleanup } = createTrackedEngine();

        // Warm up
        evalWithTelemetry(engine, "1 + 2");

        const { telemetry } = evalWithTelemetry(engine, "3 * 4 + 5 / 6 - 7");
        expect(telemetry).not.toBeNull();

        const lexerNs = telemetry!.stages.find((s) => s.stage === "lexer")!.wallTimeNs;
        const parserNs = telemetry!.stages.find((s) => s.stage === "parser")!.wallTimeNs;
        const vmNs = telemetry!.stages.find((s) => s.stage === "vm")!.wallTimeNs;

        // Phase 0 baseline: 33% lex, 58% parse, 9% VM
        // Verify each stage is measurable (non-zero)
        expect(lexerNs).toBeGreaterThan(0);
        expect(parserNs).toBeGreaterThan(0);
        expect(vmNs).toBeGreaterThan(0);

        cleanup();
    });

    test("multiple evaluations produce distinct telemetry per call", () => {
        const { engine, cleanup } = createTrackedEngine();

        const t1 = evalWithTelemetry(engine, "1 + 1").telemetry!;
        const t2 = evalWithTelemetry(engine, "2 + 2").telemetry!;

        // Different expressions
        expect(t1.expression).toBe("1 + 1");
        expect(t2.expression).toBe("2 + 2");

        // Each has its own stages
        expect(t1.stages.length).toBeGreaterThan(0);
        expect(t2.stages.length).toBeGreaterThan(0);

        cleanup();
    });
});
