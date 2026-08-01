/**
 * Cancellation Overhead Benchmarks
 *
 * Measures the wall-time cost of the "One AbortController Per Keystroke"
 * pattern's per-evaluation overhead: addEventListener + removeEventListener
 * on AbortSignal, local controller creation, and keystroke-signal linking.
 *
 * All results are in microseconds (µs).  The hypothesis is that each
 * addEventListener/removeEventListener pair costs well under 1µs,
 * making the total overhead per evaluation effectively zero relative
 * to the expression pipeline (which is typically 50–200µs per line).
 *
 * ── Listener accumulation avoidance ───────────────────────────────────
 * Several tests create AbortSignals with `{ once: true }` listeners.
 * Since `{ once: true }` only auto-removes when the signal fires,
 * reusing the same signal across iterations would accumulate listeners
 * and skew timing.  To avoid this, tests that don't abort the signal
 * create a fresh AbortController inside each iteration's closure so
 * the signal is discarded (GC-eligible) after each measurement.
 */

import { describe, expect, test, afterAll } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { benchmarkFn } from "@tools/testUtils";

describe("Cancellation Overhead Benchmarks", () => {
	const results: Record<string, number> = {};

	afterAll(() => {
		console.log(
			"\n📊 CANCELLATION OVERHEAD BENCHMARK RESULTS (mean µs):",
		);
		console.log(
			`${
				"Benchmark".padEnd(52)
			} ${
				"Mean (µs)".padStart(10)
			} ${
				"Ops/sec".padStart(12)
			} ${
				"vs Pipeline".padStart(12)
			}`,
		);
		console.log(`${"─".repeat(90)}`);

		// Use the pipeline baseline as reference for "vs Pipeline" column
		const pipelineUs = results["engine.evaluateLine (no signal)"] ?? 0;

		for (const [name, mean] of Object.entries(results)) {
			const opsPerSec = 1_000_000 / mean;
			const vsPipeline =
				pipelineUs > 0
					? `${((mean / pipelineUs) * 100).toFixed(1)}%`
					: "—";
			console.log(
				`${
					name.padEnd(52)
				} ${
					mean.toFixed(3).padStart(10)
				} ${
					opsPerSec.toFixed(0).padStart(12)
				} ${
					vsPipeline.padStart(12)
				}`,
			);
		}

		// Print summary
		const overheadUs = results["overhead delta (with - without - wrapper)"] ?? 0;
		console.log(
			`\n   ✅ Cancellation overhead: ${overheadUs.toFixed(3)}µs per evaluation`,
		);
		if (pipelineUs > 0 && overheadUs < pipelineUs * 0.05) {
			console.log(
				`      (${((overheadUs / pipelineUs) * 100).toFixed(1)}% of pipeline — negligible)`,
			);
		}

		// Save baseline for regression detection
		const fs = require("fs");
		const path = require("path");
		const dir = path.join(
			__dirname, "..", "..", "benchmarks", "results",
		);
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(
			path.join(dir, "cancellation-overhead-baseline.json"),
			JSON.stringify(
				{ timestamp: new Date().toISOString(), results },
				null,
				2,
			),
		);
	});

	// ═══════════════════════════════════════════════════════════════
	// GROUP 1: Raw addEventListener / removeEventListener atoms
	// ═══════════════════════════════════════════════════════════════

	test("addEventListener + removeEventListener pair on AbortSignal", () => {
		// Measures the atomic cost of attaching + detaching an abort
		// listener — the fundamental operation performed per evaluation.
		// Each iteration creates a fresh controller so the signal is
		// discarded (no listener accumulation).
		let listener: () => void;

		const r = benchmarkFn(
			() => {
				const controller = new AbortController();
				listener = () => {};
				controller.signal.addEventListener("abort", listener, {
					once: true,
				});
				controller.signal.removeEventListener(
					"abort",
					listener,
				);
			},
			200_000,
			2_000,
		);
		results["addEventListener + removeEventListener"] =
			r.meanMs * 1000;
		expect(r.meanMs * 1000).toBeLessThan(5); // < 5µs
	});

	test("addEventListener only (no remove, fresh signal per iter)", () => {
		// Measures just the addEventListener cost — the fast path
		// (listener auto-removes via { once: true } on abort).
		// Each iteration creates a fresh controller so listeners
		// don't accumulate on a reused signal.
		const r = benchmarkFn(
			() => {
				const c = new AbortController();
				c.signal.addEventListener("abort", () => {}, {
					once: true,
				});
			},
			200_000,
			2_000,
		);
		results["addEventListener only"] = r.meanMs * 1000;
		expect(r.meanMs * 1000).toBeLessThan(5); // < 5µs
	});

	test("new AbortController() creation", () => {
		// Measures the cost of creating a fresh AbortController —
		// done once per evaluation in executeAndStore/executeRaw.
		const r = benchmarkFn(
			() => {
				const c = new AbortController();
				void c.signal; // prevent dead-code elimination
			},
			200_000,
			2_000,
		);
		results["new AbortController()"] = r.meanMs * 1000;
		expect(r.meanMs * 1000).toBeLessThan(10); // < 10µs
	});

	// ═══════════════════════════════════════════════════════════════
	// GROUP 2: Full keystroke-linking pattern (atoms combined)
	// ═══════════════════════════════════════════════════════════════

	test("full local-controller create + link + unlink cycle", () => {
		// Simulates the exact pattern used in executeAndStore and
		// executeRaw: create AbortController, addEventListener on
		// keystroke signal, then removeEventListener in abortCurrent.
		// Fresh keystroke controller per iteration to avoid
		// listener accumulation.
		const r = benchmarkFn(
			() => {
				const keystrokeController = new AbortController();
				const keystrokeSignal = keystrokeController.signal;

				const controller = new AbortController();
				const abortLocal = () => controller.abort();
				keystrokeSignal.addEventListener("abort", abortLocal, {
					once: true,
				});
				// Cleanup (simulates abortCurrent or vm.reset)
				keystrokeSignal.removeEventListener(
					"abort",
					abortLocal,
				);
			},
			200_000,
			2_000,
		);
		results["full create+link+unlink cycle"] = r.meanMs * 1000;
		expect(r.meanMs * 1000).toBeLessThan(10); // < 10µs
	});

	test("keystroke abort cascading to 50 local controllers", () => {
		// Simulates the real keystroke pattern: one keystroke abort
		// triggers abortLocal on N local controllers (one per line
		// being evaluated). Measures create+link+abort for N=50
		// (typical viewport size). Each iteration uses a fresh
		// keystroke controller so the { once: true } listeners
		// fire and clean up automatically on abort.
		const N = 50;

		const r = benchmarkFn(
			() => {
				const kc = new AbortController();
				const ks = kc.signal;

				// Register N local controllers, all linked to one keystroke signal
				for (let i = 0; i < N; i++) {
					const c = new AbortController();
					const l = () => c.abort();
					ks.addEventListener("abort", l, { once: true });
				}

				// Simulate keystroke — fires all 50 listeners
				kc.abort("keystroke");
			},
			10_000,
			100,
		);
		results[`keystroke abort → ${N} local aborts`] =
			r.meanMs * 1000;
		// 50 controllers: create + link + abort. ~15µs each = 750µs.
		// Threshold of 1000µs (1ms) leaves headroom for CI variance.
		expect(r.meanMs * 1000).toBeLessThan(1000);
	});

	// ═══════════════════════════════════════════════════════════════
	// GROUP 3: Real ExpressionEngine evaluation overhead
	// ═══════════════════════════════════════════════════════════════

	test("executeCached overhead: with keystroke signal vs without", () => {
		// The cleanest overhead measurement. Uses executeCached()
		// which runs ONLY bytecode execution (already compiled) —
		// bypassing lex/parse/compile variance to isolate the
		// pure cancellation overhead of executeRaw's per-call
		// AbortController create + link + unlink cycle.
		const engine = new ExpressionEngine("en", false);

		// Compile once to populate the bytecode cache
		const compiled = engine.compileExpression("1 + 2");
		const program = compiled.program;

		// ── Without keystroke signal (baseline) ─────────────────
		const rNoSignal = benchmarkFn(
			() => {
				engine.executeCached(program);
			},
			200_000,
			2_000,
		);

		// ── With keystroke signal (fresh signal per iteration) ──
		const rWithSignal = benchmarkFn(
			() => {
				const kc = new AbortController();
				engine.setKeystrokeSignal(kc.signal);
				engine.executeCached(program);
				engine.setKeystrokeSignal(null);
				kc.abort("next");
			},
			200_000,
			2_000,
		);

		// ── Keystroke wrapper overhead (create+set+clear+abort, no exec) ──
		const rWrapper = benchmarkFn(
			() => {
				const kc = new AbortController();
				engine.setKeystrokeSignal(kc.signal);
				engine.setKeystrokeSignal(null);
				kc.abort("next");
			},
			200_000,
			2_000,
		);

		// ── Compute results ─────────────────────────────────────
		const noSignalUs = rNoSignal.meanMs * 1000;
		const withSignalRawUs = rWithSignal.meanMs * 1000;
		const wrapperUs = rWrapper.meanMs * 1000;

		// True overhead = (with signal including wrapper) - (no signal) - (wrapper)
		const overheaddUs = withSignalRawUs - noSignalUs - wrapperUs;
		const overheadPercent =
			noSignalUs > 0 ? (overheaddUs / noSignalUs) * 100 : 0;

		results["executeCached (no signal)"] = noSignalUs;
		results["executeCached (with signal, raw)"] = withSignalRawUs;
		results["keystroke wrapper overhead"] = wrapperUs;
		results["overhead delta (with - without - wrapper)"] =
			overheaddUs;

		console.log(
			`\n   executeCached baseline:     ${noSignalUs.toFixed(3)}µs`,
		);
		console.log(
			`   With signal (raw):          ${withSignalRawUs.toFixed(3)}µs`,
		);
		console.log(
			`   Wrapper overhead:           ${wrapperUs.toFixed(3)}µs`,
		);
		console.log(
			`   True cancellation overhead:  ${overheaddUs.toFixed(3)}µs (${overheadPercent.toFixed(1)}% of baseline)`,
		);

		// The true cancellation overhead: executeRaw internally
		// creates an AbortController + addEventListener on keystroke
		// + sets vm.activeSignal/abortCurrent + abortLogger calls.
		// Raw atoms benchmark at ~0.6µs, but the combined path in
		// executeRaw includes additional vm property assignments,
		// closure creation, and stack operations. Threshold of 25µs
		// is generous but confirms overhead is negligible vs the
		// full pipeline (50–200µs).
		expect(overheaddUs).toBeLessThan(25);
	});

	test("evaluateLine overhead: with keystroke signal vs without", () => {
		// Real-world overhead measurement using the full evaluateLine
		// pipeline (lex → parse → compile → execute). Less precise
		// than executeCached due to pipeline variance, but confirms
		// the overhead holds up in the production code path.
		const engine = new ExpressionEngine("en", false);

		// Warm the bytecode cache + VM
		engine.evaluateLine(1, "1 + 2");

		// ── Without keystroke signal (baseline) ─────────────────
		const rNoSignal = benchmarkFn(
			() => {
				engine.evaluateLine(1, "1 + 2");
			},
			50_000,
			500,
		);

		// ── With keystroke signal (fresh signal per iteration) ──
		const rWithSignal = benchmarkFn(
			() => {
				const kc = new AbortController();
				engine.setKeystrokeSignal(kc.signal);
				engine.evaluateLine(1, "1 + 2");
				engine.setKeystrokeSignal(null);
				kc.abort("next");
			},
			50_000,
			500,
		);

		// ── Compute results ─────────────────────────────────────
		const noSignalUs = rNoSignal.meanMs * 1000;
		const withSignalRawUs = rWithSignal.meanMs * 1000;
		const overheaddUs = withSignalRawUs - noSignalUs;

		results["engine.evaluateLine (no signal)"] = noSignalUs;
		results["engine.evaluateLine (with signal, raw)"] =
			withSignalRawUs;

		console.log(
			`\n   Pipeline baseline:          ${noSignalUs.toFixed(3)}µs`,
		);
		console.log(
			`   With signal (raw, incl. wrapper): ${withSignalRawUs.toFixed(3)}µs`,
		);
		console.log(
			`   Raw delta (includes wrapper):     ${overheaddUs.toFixed(3)}µs`,
		);

		// The evaluateLine path includes lex/parse/compile variance
		// on top of the cancellation overhead. The executeCached
		// benchmark measures the pure overhead; this is a sanity
		// check that it doesn't explode in the full pipeline.
		expect(overheaddUs).toBeLessThan(100);
	});

	test("50 rapid keystroke cycles (real-world pattern)", () => {
		// Simulates 50 rapid keystrokes. Each cycle: create fresh
		// keystroke controller, set signal on engine, evaluate,
		// clear signal, abort (which cleans up { once: true }
		// listeners). This is the most realistic benchmark.
		const engine = new ExpressionEngine("en", false);

		// Warm
		engine.evaluateLine(1, "1 + 2");

		const CYCLES = 50;

		const r = benchmarkFn(
			() => {
				for (let i = 0; i < CYCLES; i++) {
					const kc = new AbortController();
					engine.setKeystrokeSignal(kc.signal);
					engine.evaluateLine(1, "1 + 2");
					engine.setKeystrokeSignal(null);
					kc.abort("next keystroke");
				}
			},
			500,
			10,
		);

		const totalUs = r.meanMs * 1000;
		const perCycleUs = totalUs / CYCLES;

		results["50 keystroke cycles (total)"] = totalUs;
		results["per keystroke cycle"] = perCycleUs;

		console.log(
			`\n   50 keystroke cycles total: ${totalUs.toFixed(2)}µs`,
		);
		console.log(
			`   Per-cycle: ${perCycleUs.toFixed(3)}µs`,
		);

		// Each cycle includes: create controller + evaluateLine +
		// setKeystrokeSignal(null) + abort. Should be well under 500µs.
		expect(perCycleUs).toBeLessThan(500);
	});

	test("addEventListener cost on ALREADY-ABORTED signal", () => {
		// Edge case: when a keystroke signal is aborted before the
		// next evaluation starts (e.g., rapid typing), addEventListener
		// on an already-aborted signal triggers internal machinery
		// (microtask scheduling) that adds measurable overhead.
		// Measures the cost of addEventListener on an aborted signal.
		const abortedController = new AbortController();
		abortedController.abort("already aborted");

		const r = benchmarkFn(
			() => {
				abortedController.signal.addEventListener(
					"abort",
					() => {},
					{ once: true },
				);
			},
			100_000,
			1_000,
		);
		results["addEventListener on aborted signal"] =
			r.meanMs * 1000;

		// Node.js queues a microtask when addEventListener is called
		// on an already-aborted signal, which adds overhead vs the
		// normal (non-aborted) path (~0.4µs). Still < 200µs is safe —
		// this edge case only triggers on rapid-typing abort races,
		// affecting at most one evaluation per keystroke.
		expect(r.meanMs * 1000).toBeLessThan(200);
	});

	test("signal.aborted property access (resolveAsync guard)", () => {
		// Measures the cost of the `signal.aborted` check used in
		// resolveAsync()'s stale-data guards. This is a simple
		// boolean property access — should be sub-nanosecond.
		const controller = new AbortController();
		const signal = controller.signal;

		const r = benchmarkFn(
			() => {
				void signal.aborted;
			},
			500_000,
			5_000,
		);
		results["signal.aborted property access"] = r.meanMs * 1000;
		expect(r.meanMs * 1000).toBeLessThan(1); // < 1µs
	});
});
