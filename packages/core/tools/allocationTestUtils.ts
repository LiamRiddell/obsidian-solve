/**
 * Allocation Test Helpers for solve-js
 *
 * Provides assertion helpers for AllocationTracker-based telemetry tests.
 * Used by allocation benchmark specs and telemetry unit tests.
 *
 * Located outside __tests__/ to prevent Jest from treating it as a test suite.
 */

import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { AllocationTracker } from "@solve-js/telemetry";
import type { PipelineTelemetry, StageAllocation, StageAggregate } from "@solve-js/telemetry";

/**
 * Create an ExpressionEngine with allocation tracking enabled.
 * Returns both the engine and a cleanup function.
 */
export function createTrackedEngine(locale = "en", diagnostic = false): {
    engine: ExpressionEngine;
    cleanup: () => void;
} {
    AllocationTracker.enable();
    const engine = new ExpressionEngine(locale, diagnostic);
    return {
        engine,
        cleanup: () => {
            AllocationTracker.disable();
        },
    };
}

/**
 * Evaluate an expression and return its PipelineTelemetry.
 * Enables AllocationTracker for the duration of the call.
 *
 * Uses evaluateLine() which internally calls evaluateExpressionWithDiagnostic().
 */
export function evalWithTelemetry(
    engine: ExpressionEngine,
    expression: string,
    lineNumber = 1
): { value: number; telemetry: PipelineTelemetry | null } {
    const values = engine.evaluateLine(lineNumber, expression);
    return {
        value: values[0].toNumber(),
        telemetry: engine.getLastTelemetry(),
    };
}

/**
 * Assert that a PipelineTelemetry contains the expected stages in order.
 */
export function expectStages(
    telemetry: PipelineTelemetry | null,
    expectedStages: string[]
): void {
    if (!telemetry) {
        throw new Error("Expected telemetry to be non-null but got null. Is AllocationTracker enabled?");
    }
    const actualStages = telemetry.stages.map((s) => s.stage);
    const missing = expectedStages.filter((s) => !actualStages.includes(s as any));
    if (missing.length > 0) {
        throw new Error(
            `Expected stages ${JSON.stringify(expectedStages)} but missing ${JSON.stringify(missing)}. ` +
            `Got: ${JSON.stringify(actualStages)}`
        );
    }
}

/**
 * Assert that a stage allocation's wall-time is within expected bounds (in nanoseconds).
 * Useful for verifying that tracking is producing reasonable, non-zero measurements.
 */
export function expectWallTimeInRange(
    alloc: StageAllocation,
    minNs: number,
    maxNs: number,
    stageName?: string
): void {
    const label = stageName ? `Stage "${stageName}"` : "Stage";
    if (alloc.wallTimeNs < minNs) {
        throw new Error(
            `${label} wall time ${alloc.wallTimeNs}ns is below minimum ${minNs}ns`
        );
    }
    if (alloc.wallTimeNs > maxNs) {
        throw new Error(
            `${label} wall time ${alloc.wallTimeNs}ns exceeds maximum ${maxNs}ns`
        );
    }
}

/**
 * Assert that all stages in a PipelineTelemetry have non-negative wall times
 * and valid stage names.
 */
export function expectValidTelemetry(telemetry: PipelineTelemetry | null): void {
    if (!telemetry) {
        throw new Error("Telemetry is null");
    }
    if (telemetry.stages.length === 0) {
        throw new Error("Telemetry has no stages");
    }
    const validStages = new Set([
        "lexer", "normalizer", "parser", "resolver", "vm", "orchestrator",
    ]);
    for (const stage of telemetry.stages) {
        if (!validStages.has(stage.stage)) {
            throw new Error(`Invalid stage name: ${stage.stage}`);
        }
        if (stage.wallTimeNs < 0) {
            throw new Error(`Stage "${stage.stage}" has negative wall time: ${stage.wallTimeNs}ns`);
        }
        if (stage.allocBytes < 0) {
            throw new Error(`Stage "${stage.stage}" has negative alloc bytes: ${stage.allocBytes}`);
        }
    }
    if (telemetry.totalWallTimeNs < 0) {
        throw new Error(`Total wall time is negative: ${telemetry.totalWallTimeNs}ns`);
    }
    if (telemetry.totalAllocBytes < 0) {
        throw new Error(`Total alloc bytes is negative: ${telemetry.totalAllocBytes}`);
    }
}

/**
 * Assert that the cacheHit flag on a stage matches the expected value.
 */
export function expectCacheHit(
    telemetry: PipelineTelemetry | null,
    stageName: string,
    expected: boolean
): void {
    if (!telemetry) {
        throw new Error("Telemetry is null");
    }
    const stage = telemetry.stages.find((s) => s.stage === stageName);
    if (!stage) {
        throw new Error(`Stage "${stageName}" not found in telemetry`);
    }
    if (stage.cacheHit !== expected) {
        throw new Error(
            `Expected stage "${stageName}" cacheHit=${expected} but got ${stage.cacheHit}`
        );
    }
}

/**
 * Generate a markdown report from an array of PipelineTelemetry records
 * using AllocationTracker.generateReport().
 */
export function generateReport(telemetry: PipelineTelemetry[], title?: string): string {
    return AllocationTracker.generateReport(telemetry, title);
}

/**
 * Aggregate telemetry records and return per-stage statistics.
 */
export function aggregateTelemetry(telemetry: PipelineTelemetry[]): StageAggregate[] {
    return AllocationTracker.aggregate(telemetry);
}
