// ── Allocation Tracker Telemetry Framework ─────────────────────────────────
// Phase 1: Per-stage allocation + wall-time tracking for the 5-layer pipeline.
//
// Usage:
//   AllocationTracker.enable();
//   const { result, alloc } = AllocationTracker.track('lexer', () => lexer.tokenizeAll());
//   AllocationTracker.disable();
//
// Each track() call captures:
//   - Wall-clock time (via process.hrtime in Node.js, performance.now in browser)
//   - Heap delta (via process.memoryUsage in Node.js, unavailable in browser)
//   - Object counts (reserved for Phase 2+ with --expose-gc heap snapshots)
//
// Design principle: Zero overhead when disabled. The enabled flag is a static
// boolean — a single branch that V8's JIT eliminates when allocation tracking
// is disabled in production.

import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";

// ── Types ─────────────────────────────────────────────────────────────────

export type PipelineStage =
    | 'lexer'
    | 'normalizer'
    | 'parser'
    | 'resolver'
    | 'vm'
    | 'orchestrator';

export interface StageAllocation {
    /** Pipeline stage name. */
    stage: PipelineStage;
    /** Number of objects allocated (reserved — requires --expose-gc snapshots). */
    allocCount: number;
    /** Heap bytes allocated (delta of process.memoryUsage().heapUsed). */
    allocBytes: number;
    /** Breakdown of object types allocated (reserved — requires heap snapshots). */
    objectCounts: Record<string, number>;
    /** Wall-clock duration in nanoseconds. */
    wallTimeNs: number;
    /** Optional: sub-stage name for finer-grained tracking within a stage. */
    subStage?: string;
    /** Optional: whether this stage hit a cache (zero-parse, zero-lex). */
    cacheHit?: boolean;
}

export interface PipelineTelemetry {
    /** The expression text that was evaluated. */
    expression: string;
    /** Per-stage allocation and timing data, in execution order. */
    stages: StageAllocation[];
    /** Total heap bytes allocated across all stages. */
    totalAllocBytes: number;
    /** Total wall-clock duration in nanoseconds. */
    totalWallTimeNs: number;
    /** Whether the expression took the orchestrator fast path. */
    fastPath: boolean;
}

/** Aggregate statistics across multiple pipeline runs. */
export interface StageAggregate {
    stage: PipelineStage;
    count: number;
    meanAllocBytes: number;
    meanWallTimeNs: number;
    minWallTimeNs: number;
    maxWallTimeNs: number;
    p50WallTimeNs: number;
    p95WallTimeNs: number;
    p99WallTimeNs: number;
}

// ── AllocationTracker ─────────────────────────────────────────────────────

export class AllocationTracker {
    /** Master kill-switch. Disabled in production — zero allocation overhead. */
    private static enabled: boolean = false;

    // ══ Lifecycle ═══════════════════════════════════════════════════════════

    /** Enable allocation tracking. Idempotent. */
    static enable(): void {
        this.enabled = true;
    }

    /** Disable allocation tracking. Idempotent. */
    static disable(): void {
        this.enabled = false;
    }

    /** Query whether tracking is currently enabled. */
    static isEnabled(): boolean {
        return this.enabled;
    }

    // ══ Core: Track a pipeline stage ═══════════════════════════════════════

    /**
     * Execute a function and capture allocation + wall-time data.
     *
     * When disabled, executes `fn()` with zero overhead (no measurements taken).
     * When enabled, captures heap delta via process.memoryUsage() (Node.js) and
     * wall-clock via process.hrtime() (Node.js) or performance.now() (browser).
     *
     * @param stage    - Pipeline stage name (e.g., 'lexer', 'parser', 'vm').
     * @param fn       - The pipeline stage function to execute and measure.
     * @param opts     - Optional: sub-stage name and cache-hit flag.
     * @returns The function's result and the allocation/timing data.
     */
    static track<T>(
        stage: PipelineStage,
        fn: () => T,
        opts?: { subStage?: string; cacheHit?: boolean }
    ): { result: T; alloc: StageAllocation | null } {
        if (!this.enabled) {
            return { result: fn(), alloc: null };
        }

        // ══ Capture pre-execution state ══
        const startMem = typeof process !== 'undefined' && process.memoryUsage
            ? process.memoryUsage()
            : null;
        // hrtime() returns [seconds, nanoseconds]; performance.now() returns milliseconds
        const startTime = typeof process !== 'undefined' && process.hrtime
            ? process.hrtime()
            : performance.now();

        // ══ Execute the pipeline stage ══
        // Errors propagate naturally — track() must not swallow.
        const result = fn();

        // ══ Capture post-execution state ══
        const endTime = typeof process !== 'undefined' && process.hrtime
            ? process.hrtime(startTime as [number, number])
            : undefined;
        const endMem = typeof process !== 'undefined' && process.memoryUsage
            ? process.memoryUsage()
            : null;

        // Compute wall time:
        //   Node.js:  endTime is [seconds, nanoseconds] → convert to ns
        //   Browser:  endTime undefined, startTime is performance.now() → compute delta in ns
        const wallTimeNs: number = endTime
            ? endTime[0] * 1e9 + endTime[1]
            : (performance.now() - (startTime as number)) * 1e6;

        const allocBytes: number = startMem && endMem
            ? endMem.heapUsed - startMem.heapUsed
            : 0;

        const alloc: StageAllocation = {
            stage,
            allocCount: 0,  // Reserved — requires --expose-gc heap snapshots (Phase 2+)
            allocBytes,
            objectCounts: {},  // Reserved — requires heap snapshots (Phase 2+)
            wallTimeNs,
            ...opts,
        };

        return { result, alloc };
    }

    // ══ Report Generation ══════════════════════════════════════════════════

    /**
     * Generate a markdown table from an array of PipelineTelemetry records.
     *
     * Aggregates by stage and outputs mean/min/max wall time, mean alloc bytes,
     * and p50/p95/p99 percentiles.
     *
     * @param telemetry  - Array of pipeline telemetry records from multiple runs.
     * @param title      - Optional title for the markdown section.
     * @returns A markdown-formatted string with per-stage and total aggregate tables.
     */
    static generateReport(telemetry: PipelineTelemetry[], title?: string): string {
        const lines: string[] = [];

        lines.push(title ? `## ${title}` : '## Pipeline Allocation Report');
        lines.push('');
        lines.push(`**Runs:** ${telemetry.length} | **Generated:** ${new Date().toISOString()}`);
        lines.push('');

        // Aggregate by stage
        const aggregate = this.aggregate(telemetry);

        if (aggregate.length === 0) {
            lines.push('_No telemetry data._');
            return lines.join('\n');
        }

        // Per-stage table
        lines.push('### Per-Stage Breakdown');
        lines.push('');
        lines.push('| Stage | Count | Mean Wall (µs) | Mean Alloc (bytes) | Min (µs) | Max (µs) | p50 (µs) | p95 (µs) | p99 (µs) |');
        lines.push('|-------|:-----:|:--------------:|:------------------:|:--------:|:--------:|:--------:|:--------:|:--------:|');

        for (const agg of aggregate) {
            lines.push(
                `| ${agg.stage} | ${agg.count} | ` +
                `${(agg.meanWallTimeNs / 1000).toFixed(2)} | ` +
                `${agg.meanAllocBytes.toFixed(0)} | ` +
                `${(agg.minWallTimeNs / 1000).toFixed(2)} | ` +
                `${(agg.maxWallTimeNs / 1000).toFixed(2)} | ` +
                `${(agg.p50WallTimeNs / 1000).toFixed(2)} | ` +
                `${(agg.p95WallTimeNs / 1000).toFixed(2)} | ` +
                `${(agg.p99WallTimeNs / 1000).toFixed(2)} |`
            );
        }

        // Total stats
        const totalAllocBytes = telemetry.reduce((sum, t) => sum + t.totalAllocBytes, 0);
        const totalWallNs = telemetry.reduce((sum, t) => sum + t.totalWallTimeNs, 0);
        const fastPathCount = telemetry.filter(t => t.fastPath).length;

        lines.push('');
        lines.push('### Totals');
        lines.push('');
        lines.push(`- **Total wall time:** ${(totalWallNs / 1e6).toFixed(2)} ms (${telemetry.length} runs)`);
        lines.push(`- **Total heap allocated:** ${totalAllocBytes.toLocaleString()} bytes`);
        lines.push(`- **Fast-path runs:** ${fastPathCount}/${telemetry.length} (${((fastPathCount / telemetry.length) * 100).toFixed(0)}%)`);
        lines.push(`- **Mean per-run:** ${(totalWallNs / telemetry.length / 1000).toFixed(2)} µs, ${(totalAllocBytes / telemetry.length).toFixed(0)} bytes`);

        return lines.join('\n');
    }

    /**
     * Aggregate PipelineTelemetry records by stage.
     *
     * Computes count, mean/min/max wall time, mean alloc bytes, and
     * p50/p95/p99 percentiles for each pipeline stage.
     */
    static aggregate(telemetry: PipelineTelemetry[]): StageAggregate[] {
        const stageMap = new Map<PipelineStage, StageAllocation[]>();

        // Collect all stage allocations by stage
        for (const t of telemetry) {
            for (const s of t.stages) {
                if (!stageMap.has(s.stage)) {
                    stageMap.set(s.stage, []);
                }
                stageMap.get(s.stage)!.push(s);
            }
        }

        // Compute aggregates
        const result: StageAggregate[] = [];
        for (const [stage, allocations] of stageMap) {
            const wallTimes = allocations.map(a => a.wallTimeNs).sort((a, b) => a - b);
            const allocBytes = allocations.map(a => a.allocBytes);
            const count = allocations.length;

            result.push({
                stage,
                count,
                meanAllocBytes: allocBytes.reduce((s, v) => s + v, 0) / count,
                meanWallTimeNs: wallTimes.reduce((s, v) => s + v, 0) / count,
                minWallTimeNs: wallTimes[0],
                maxWallTimeNs: wallTimes[wallTimes.length - 1],
                p50WallTimeNs: percentile(wallTimes, 50),
                p95WallTimeNs: percentile(wallTimes, 95),
                p99WallTimeNs: percentile(wallTimes, 99),
            });
        }

        // Sort by stage name for consistent output
        result.sort((a, b) => a.stage.localeCompare(b.stage));
        return result;
    }

    /**
     * Create a PipelineTelemetry from a collection of StageAllocations.
     *
     * @param expression   - The expression that was evaluated.
     * @param stages       - Per-stage allocation data in execution order.
     * @param fastPath     - Whether the orchestrator took the fast path.
     */
    static createTelemetry(
        expression: string,
        stages: StageAllocation[],
        fastPath: boolean = false
    ): PipelineTelemetry {
        const totalAllocBytes = stages.reduce((sum, s) => sum + s.allocBytes, 0);
        const totalWallTimeNs = stages.reduce((sum, s) => sum + s.wallTimeNs, 0);
        return { expression, stages, totalAllocBytes, totalWallTimeNs, fastPath };
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Compute the nth percentile from a sorted array of numbers.
 * Uses linear interpolation between neighboring values.
 */
function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0];

    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];

    const fraction = index - lower;
    return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
}
