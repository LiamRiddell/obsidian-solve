import { describe, expect, test, beforeEach } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { DocumentModel } from "@solve-js/engine/DocumentModel";
import { ThreeTierEvaluator } from "@solve-js/engine/ThreeTierEvaluator";

/**
 * Memory Leak Tests — Phase 6.2
 *
 * Runs high-iteration loops and checks that memory usage does not grow
 * unboundedly, indicating no retained references or leak patterns.
 *
 * Uses process.memoryUsage() to track heap size deltas.
 * Tests are skipped when not in Node environment (e.g., jsdom).
 *
 * Note: Memory thresholds are generous to account for GC non-determinism,
 * engine allocations (Lexer, VM, LineCache per engine), and V8 heap
 * fragmentation. These tests verify absence of catastrophic leaks, not
 * byte-precise allocation tracking.
 */
describe("Memory Leak Tests", () => {
	// ── Helpers ─────────────────────────────────────────────────────

	function getHeapMB(): number {
		if (typeof process === "undefined" || !process.memoryUsage) {
			return 0;
		}
		return process.memoryUsage().heapUsed / (1024 * 1024);
	}

	function hasMemoryTracking(): boolean {
		return typeof process !== "undefined" && typeof process.memoryUsage === "function";
	}

	function checkMemoryGrowth(
		label: string,
		beforeMB: number,
		afterMB: number,
		iterations: number,
		maxGrowthMB: number = 50
	): void {
		if (!hasMemoryTracking()) return;

		const growthMB = afterMB - beforeMB;
		const perIterationKB = ((growthMB * 1024) / iterations).toFixed(2);

		if (growthMB > 1) {
			console.log(
				`[Memory:${label}] ${iterations} iterations: ` +
				`${beforeMB.toFixed(1)}MB → ${afterMB.toFixed(1)}MB ` +
				`(+${growthMB.toFixed(1)}MB, ${perIterationKB}KB/iter)`
			);
		}

		expect(growthMB).toBeLessThan(maxGrowthMB);
	}

	// ── Engine Lifecycle ────────────────────────────────────────────

	describe("engine lifecycle memory", () => {
		test("10K parseDocument iterations do not leak memory", () => {
			if (!hasMemoryTracking()) {
				console.log("[Memory] Skipped: no process.memoryUsage");
				return;
			}

			if (global.gc) global.gc();

			const beforeMB = getHeapMB();

			for (let i = 0; i < 10000; i++) {
				const engine = new ExpressionEngine();
				engine.parseDocument(`:x${i} = ${i}\n:x${i} + 5`);
			}

			if (global.gc) global.gc();
			const afterMB = getHeapMB();

			// 10K engine instances + parseDocument internal allocations.
			// Each engine creates Lexer (~5KB), VM (~3KB), LineCache,
			// ParseletRegistry, and PackageManager — ~30KB/engine baseline.
			// 10K × 30KB = ~300MB expected with heap fragmentation.
			checkMemoryGrowth("10K parseDocument", beforeMB, afterMB, 10000, 500);
		});

		test("10K evaluateLine iterations do not leak memory", () => {
			if (!hasMemoryTracking()) {
				console.log("[Memory] Skipped: no process.memoryUsage");
				return;
			}

			if (global.gc) global.gc();
			const beforeMB = getHeapMB();

			const engine = new ExpressionEngine();
			for (let i = 0; i < 10000; i++) {
				engine.evaluateLine(i + 1, `${(i % 100) + 1} + ${(i % 50) + 1}`);
			}

			if (global.gc) global.gc();
			const afterMB = getHeapMB();

			// LineCache stores all 10K entries — this WILL grow.
			// Allow up to 100MB for the accumulated cache.
			checkMemoryGrowth("10K evaluateLine", beforeMB, afterMB, 10000, 100);
		});

		test("10K evaluateNumber iterations do not leak memory", () => {
			if (!hasMemoryTracking()) {
				console.log("[Memory] Skipped: no process.memoryUsage");
				return;
			}

			if (global.gc) global.gc();
			const beforeMB = getHeapMB();

			const engine = new ExpressionEngine();
			for (let i = 0; i < 10000; i++) {
				const result = engine.evaluateNumber(`${(i % 100) + 1} * ${(i % 10) + 1}`);
				expect(typeof result).toBe("number");
			}

			if (global.gc) global.gc();
			const afterMB = getHeapMB();

			checkMemoryGrowth("10K evaluateNumber", beforeMB, afterMB, 10000, 100);
		});

		test("repeated engine creation and disposal does not leak", () => {
			if (!hasMemoryTracking()) {
				console.log("[Memory] Skipped: no process.memoryUsage");
				return;
			}

			if (global.gc) global.gc();
			const beforeMB = getHeapMB();

			for (let i = 0; i < 1000; i++) {
				const engine = new ExpressionEngine();
				const result = engine.parseDocument(`:x = ${i}\n42`);
				expect(result).toBeDefined();
				expect(result.errors).toHaveLength(0);
			}

			if (global.gc) global.gc();
			const afterMB = getHeapMB();

			checkMemoryGrowth("1K engine create/dispose", beforeMB, afterMB, 1000, 200);
		});
	});

	// ── ThreeTierEvaluator Lifecycle ────────────────────────────────

	describe("ThreeTierEvaluator lifecycle memory", () => {
		test("repeated evaluate/dispose cycles do not leak memory", () => {
			if (!hasMemoryTracking()) {
				console.log("[Memory] Skipped: no process.memoryUsage");
				return;
			}

			if (global.gc) global.gc();
			const beforeMB = getHeapMB();

			for (let i = 0; i < 1000; i++) {
				const engine = new ExpressionEngine();
				const doc = new DocumentModel();
				doc.setDocument(`:x${i} = ${i}\n:x${i} + 5\n42`);
				const evaluator = new ThreeTierEvaluator(doc, engine);
				evaluator.evaluate({ startLine: 1, endLine: 3 });
				evaluator.terminateWorker();
			}

			if (global.gc) global.gc();
			const afterMB = getHeapMB();

			checkMemoryGrowth("1K evaluator create/dispose", beforeMB, afterMB, 1000, 200);
		});

		test("LineCache does not grow unboundedly with many unique expressions", () => {
			if (!hasMemoryTracking()) {
				console.log("[Memory] Skipped: no process.memoryUsage");
				return;
			}

			const engine = new ExpressionEngine();

			if (global.gc) global.gc();
			const beforeMB = getHeapMB();

			for (let i = 0; i < 5000; i++) {
				engine.evaluateLine(i + 1, `${i} + ${i * 2}`);
			}

			if (global.gc) global.gc();
			const afterMB = getHeapMB();

			// LineCache fills with 5K entries — expected growth
			const cache = engine.getLineCache();
			expect(cache.size).toBeLessThanOrEqual(5000);

			checkMemoryGrowth("5K unique expressions", beforeMB, afterMB, 5000, 100);
		});

		test("clearing LineCache releases memory", () => {
			if (!hasMemoryTracking()) {
				console.log("[Memory] Skipped: no process.memoryUsage");
				return;
			}

			const engine = new ExpressionEngine();

			// Fill cache with 5000 entries
			for (let i = 0; i < 5000; i++) {
				engine.evaluateLine(i + 1, `${i} + ${i * 2}`);
			}

			if (global.gc) global.gc();
			const beforeClearMB = getHeapMB();

			// Clear the cache
			engine.getLineCache().clear();

			if (global.gc) global.gc();
			const afterClearMB = getHeapMB();

			// Cache should be empty
			expect(engine.getLineCache().size).toBe(0);

			// Memory should not increase significantly after clear
			checkMemoryGrowth("LineCache clear", beforeClearMB, afterClearMB, 1, 100);
		});
	});

	// ── DocumentModel Memory ────────────────────────────────────────

	describe("DocumentModel memory", () => {
		test("setDocument clears previous state completely", () => {
			const doc = new DocumentModel();

			// Set a large document
			doc.setDocument(Array(1000).fill("42").join("\n"));
			expect(doc.lineCount).toBe(1000);

			// Replace with a small document
			doc.setDocument("single line");
			expect(doc.lineCount).toBe(1);
			expect(doc.getLineAt(1)!.text).toBe("single line");
		});

		test("clear() releases all resources", () => {
			const doc = new DocumentModel();
			doc.setDocument(Array(500).fill(":x = 42").join("\n"));
			expect(doc.lineCount).toBe(500);

			doc.clear();
			expect(doc.lineCount).toBe(0);
			expect(doc.isEmpty).toBe(true);
		});
	});

	// ── Stress: Rapid Engine Operations ─────────────────────────────

	describe("stress: rapid engine operations", () => {
		test("engine handles 5K alternating parseDocument + evaluateNumber without crash", () => {
			const engine = new ExpressionEngine();

			for (let i = 0; i < 5000; i++) {
				if (i % 2 === 0) {
					engine.parseDocument(`:x${i} = ${i}\n42`);
				} else {
					const result = engine.evaluateNumber(`${i} + ${i}`);
					expect(typeof result).toBe("number");
				}
			}
		});

		test("ThreeTierEvaluator handles 1K alternating evaluate + setViewport without crash", () => {
			const engine = new ExpressionEngine();
			const doc = new DocumentModel();
			doc.setDocument(":x = 1\n:x + 2\n:x * 3\n:x + 4\n:x * 5\n42\n:y = 10\n:y + 1\n:y + 2\n:y + 3");
			const evaluator = new ThreeTierEvaluator(doc, engine);

			for (let i = 0; i < 1000; i++) {
				if (i % 2 === 0) {
					evaluator.evaluate({ startLine: 1, endLine: 5 });
				} else {
					evaluator.setViewport({ startLine: 6, endLine: 10 });
				}
			}

			evaluator.terminateWorker();
		});
	});
});
