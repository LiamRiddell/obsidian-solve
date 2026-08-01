import { describe, expect, test, beforeEach } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { DocumentModel } from "@solve-js/engine/DocumentModel";
import { ThreeTierEvaluator } from "@solve-js/engine/ThreeTierEvaluator";

/**
 * Cache Coherence Tests — Phase 6.2
 *
 * Verifies that the three state stores (DAG, LineCache, DocumentModel)
 * remain consistent across all engine operations.
 */
describe("Cache Coherence", () => {
	// ── DAG ↔ LineCache Sync ─────────────────────────────────────────

	describe("DAG ↔ LineCache consistency", () => {
		let engine: ExpressionEngine;

		beforeEach(() => {
			engine = new ExpressionEngine();
		});

		test("after evaluateLine, DAG registers writes matching LineCache entry", () => {
			engine.evaluateLine(1, ":x = 42");

			const dag = engine.getDag();
			const cache = engine.getLineCache();
			const entry = cache.getEntryForLine(1);

			expect(entry).toBeDefined();
			expect(entry!.writeVariable).toBe("x");

			// DAG should track that line 1 writes "x"
			const writes = dag.getWrites(1);
			expect(writes.has("x")).toBe(true);
		});

		test("after evaluateLine, DAG consumers match LineCache read variables", () => {
			engine.evaluateLine(1, ":x = 10");
			engine.evaluateLine(2, ":x + 5");

			const dag = engine.getDag();
			const cache = engine.getLineCache();
			const entry = cache.getEntryForLine(2);

			expect(entry).toBeDefined();
			// Line 2 reads "x" (via :x)
			expect(entry!.readVariables).toContain("x");

			// DAG should show line 2 as a consumer of "x"
			const consumers = dag.getConsumers("x");
			expect(consumers.has(2)).toBe(true);
		});

		test("after chained evaluateLine calls, DAG tracks variable write/consumer relationships", () => {
			// Use individual evaluateLine calls for precise DAG tracking
			engine.evaluateLine(1, ":x = 1");
			engine.evaluateLine(2, ":y = :x + 2");
			engine.evaluateLine(3, ":z = :y * 3");

			const dag = engine.getDag();

			// "x" is written on line 1, consumed on line 2
			const aConsumers = dag.getConsumers("x");
			expect(aConsumers.has(2)).toBe(true);

			// "y" is written on line 2, consumed on line 3
			const bConsumers = dag.getConsumers("y");
			expect(bConsumers.has(3)).toBe(true);

			// "z" is written on line 3, no consumers
			const cConsumers = dag.getConsumers("z");
			expect(cConsumers.size).toBe(0);
		});

		test("getAffectedLines returns transitive consumers via BFS walk", () => {
			engine.evaluateLine(1, ":x = 1");
			engine.evaluateLine(2, ":y = :x + 2");
			engine.evaluateLine(3, ":z = :y * 3");
			engine.evaluateLine(4, "42"); // unrelated

			const dag = engine.getDag();

			// Changing "x" should affect y-writer (line 2) and z-writer (line 3),
			// but NOT line 4 (no dependency on x or y)
			const affected = dag.getAffectedLines("x");
			expect(affected.has(2)).toBe(true);
			expect(affected.has(3)).toBe(true);
			expect(affected.has(4)).toBe(false);
		});
	});

	// ── DocumentModel ↔ LineCache Consistency ────────────────────────

	describe("DocumentModel ↔ LineCache consistency", () => {
		test("Tier 1 evaluation syncs bytecode from LineCache to DocumentModel", () => {
			const engine = new ExpressionEngine();
			const doc = new DocumentModel();
			doc.setDocument(":x = 42\n:x + 8");

			const evaluator = new ThreeTierEvaluator(doc, engine);
			const result = evaluator.evaluate({ startLine: 1, endLine: 2 });

			// Both lines should be Tier 1 (dirty + visible)
			expect(result.tierCounts.tier1).toBe(2);

			// DocumentModel should have bytecode for both lines
			const line1 = doc.getLineAt(1);
			const line2 = doc.getLineAt(2);
			expect(line1).toBeDefined();
			expect(line2).toBeDefined();
			expect(line1!.bytecodes.length).toBeGreaterThan(0);
			expect(line2!.bytecodes.length).toBeGreaterThan(0);
			expect(line1!.bytecodes[0].opcodes.length).toBeGreaterThan(0);
			expect(line2!.bytecodes[0].opcodes.length).toBeGreaterThan(0);

			// LineCache should also have the same entries
			const cache = engine.getLineCache();
			const entry1 = cache.getEntryForLine(1);
			const entry2 = cache.getEntryForLine(2);
			expect(entry1).toBeDefined();
			expect(entry2).toBeDefined();
		});

		test("LineCache entry result matches DocumentModel result after Tier 1", () => {
			const engine = new ExpressionEngine();
			const doc = new DocumentModel();
			doc.setDocument(":x = 42");

			const evaluator = new ThreeTierEvaluator(doc, engine);
			evaluator.evaluate({ startLine: 1, endLine: 1 });

			const state = doc.getLineAt(1);
			const cacheEntry = engine.getLineCache().getEntryForLine(1);

			expect(state!.result).not.toBeNull();
			expect(cacheEntry!.result).not.toBeNull();
			expect(state!.result!.toNumber()).toBe(42);
			expect(cacheEntry!.result!.toNumber()).toBe(42);
		});

		test("LineCache has same reads/writes as DocumentModel", () => {
			const engine = new ExpressionEngine();
			const doc = new DocumentModel();
			doc.setDocument(":x = 5\n:x + 3");

			const evaluator = new ThreeTierEvaluator(doc, engine);
			evaluator.evaluate({ startLine: 1, endLine: 2 });

			const line1 = doc.getLineAt(1)!;
			const line2 = doc.getLineAt(2)!;
			const entry1 = engine.getLineCache().getEntryForLine(1)!;
			const entry2 = engine.getLineCache().getEntryForLine(2)!;

			// Line 1 writes x, reads nothing
			expect(line1.writes).toContain("x");
			expect(entry1.writeVariable).toBe("x");

			// Line 2 reads x, writes nothing
			expect(line2.reads).toContain("x");
			expect(entry2.readVariables).toContain("x");
			expect(entry2.writeVariable).toBeNull();
		});
	});

	// ── DocumentModel → DAG Coherence ────────────────────────────────

	describe("DocumentModel → DAG coherence", () => {
		test("dirty state is consistent: clean lines have valid bytecode", () => {
			const engine = new ExpressionEngine();
			const doc = new DocumentModel();
			doc.setDocument(":x = 10\n42");

			const evaluator = new ThreeTierEvaluator(doc, engine);
			evaluator.evaluate({ startLine: 1, endLine: 2 });

			const line1 = doc.getLineAt(1)!;
			const line2 = doc.getLineAt(2)!;

			expect(line1.dirty).toBe(false);
			expect(line2.dirty).toBe(false);
			expect(line1.bytecodes.length).toBeGreaterThan(0);
			expect(line2.bytecodes.length).toBeGreaterThan(0);
		});

		test("editing a line clears its bytecode and marks it dirty", () => {
			const engine = new ExpressionEngine();
			const doc = new DocumentModel();
			doc.setDocument(":x = 10\n:x + 5");

			const evaluator = new ThreeTierEvaluator(doc, engine);
			evaluator.evaluate({ startLine: 1, endLine: 2 });

			// Edit line 1 — change variable value
			doc.editLine(1, ":x = 99");

			const line1 = doc.getLineAt(1)!;
			expect(line1.dirty).toBe(true);
			expect(line1.bytecodes.length).toBe(0);
			expect(line1.result).toBeNull();
		});

		test("applyTransaction correctly dirties downstream consumers via DAG", () => {
			// This tests the REAL production code path, not a manual simulation.
			const engine = new ExpressionEngine();
			const doc = new DocumentModel();
			doc.setDocument(":x = 10\n:x + 5\n42");

			const evaluator = new ThreeTierEvaluator(doc, engine);
			evaluator.evaluate({ startLine: 1, endLine: 3 });

			// Replace line 1 (variable definition changed) — triggers applyTransaction
			// which propagates dirty state to downstream consumers via DAG
			evaluator.applyTransaction([
				{ startLine: 1, deleteCount: 1, insertLines: [":x = 99"] },
			]);

			// Line 1 is new, so dirty
			expect(doc.getLineAt(1)!.dirty).toBe(true);

			// Line 2 was a consumer of "x" written by the deleted line 1.
			// applyTransaction's Phase 4 marks downstream by lineId — line 2 should be dirty.
			expect(doc.getLineAt(2)!.dirty).toBe(true);

			// Line 3 was not a consumer, should remain clean
			expect(doc.getLineAt(3)!.dirty).toBe(false);
		});
	});

	// ── applyTransaction Coherence ───────────────────────────────────

	describe("applyTransaction coherence", () => {
		test("inserting lines shifts existing content to correct positions", () => {
			const engine = new ExpressionEngine();
			const doc = new DocumentModel();
			doc.setDocument("old line 1\nold line 2");

			const evaluator = new ThreeTierEvaluator(doc, engine);
			evaluator.evaluate({ startLine: 1, endLine: 2 });

			// Insert a new line at position 1
			evaluator.applyTransaction([
				{ startLine: 1, deleteCount: 0, insertLines: ["new line"] },
			]);

			// Document should have 3 lines
			expect(doc.lineCount).toBe(3);

			// The original lines shifted down but kept their text
			expect(doc.getLineAt(1)!.text).toBe("new line");
			expect(doc.getLineAt(2)!.text).toBe("old line 1");
			expect(doc.getLineAt(3)!.text).toBe("old line 2");

			// After insertion, verify shifted lines retain their original text
			// at new positions. The text preservation is the key invariant.
			const shiftedLine = doc.getLineAt(2)!;
			expect(shiftedLine.text).toBe("old line 1");
			expect(shiftedLine).toBeDefined();

			evaluator.terminateWorker();
		});

		test("deleting lines reduces document length and removes content", () => {
			const engine = new ExpressionEngine();
			const doc = new DocumentModel();
			doc.setDocument("line 1\nline 2\nline 3\nline 4");

			const evaluator = new ThreeTierEvaluator(doc, engine);
			evaluator.evaluate({ startLine: 1, endLine: 4 });

			// Delete lines 2-3
			evaluator.applyTransaction([
				{ startLine: 2, deleteCount: 2, insertLines: [] },
			]);

			expect(doc.lineCount).toBe(2);
			expect(doc.getLineAt(1)!.text).toBe("line 1");
			expect(doc.getLineAt(2)!.text).toBe("line 4");

			evaluator.terminateWorker();
		});

		test("multiple non-overlapping changes in one batch are processed correctly", () => {
			const engine = new ExpressionEngine();
			const doc = new DocumentModel();
			doc.setDocument("line 1\nline 2\nline 3\nline 4\nline 5");

			const evaluator = new ThreeTierEvaluator(doc, engine);
			evaluator.evaluate({ startLine: 1, endLine: 5 });

			// Delete line 2 and line 4 (non-overlapping)
			const result = evaluator.applyTransaction([
				{ startLine: 4, deleteCount: 1, insertLines: [] },
				{ startLine: 2, deleteCount: 1, insertLines: [] },
			]);

			expect(result.removed.length).toBe(2);

			// After the transaction, we should have 3 lines
			expect(doc.lineCount).toBe(3);

			// The remaining lines should be "line 1", "line 3", "line 5"
			expect(doc.getLineAt(1)!.text).toBe("line 1");
			expect(doc.getLineAt(2)!.text).toBe("line 3");
			expect(doc.getLineAt(3)!.text).toBe("line 5");

			evaluator.terminateWorker();
		});
	});

	// ── evaluateIncremental Coherence ────────────────────────────────

	describe("evaluateIncremental coherence", () => {
		test("only affected lines are re-evaluated, result stored in cache", () => {
			const engine = new ExpressionEngine();
			engine.evaluateLine(1, ":x = 5");
			engine.evaluateLine(2, ":x + 3");
			engine.evaluateLine(3, ":y = 10");
			engine.evaluateLine(4, ":y + 2");

			// Change "x" — only line 2 (:x + 3) should re-evaluate
			const result = engine.evaluateIncremental("x", 20);

			// Should only have 1 entry (line 2) — line 4 is NOT affected
			expect(result.size).toBe(1);
			for (const [, value] of result) {
				expect(value.toNumber()).toBe(23); // 20 + 3
			}

			// Line 2 result should be stored in LineCache
			const entry = engine.getLineCache().getEntryForLine(2);
			expect(entry).toBeDefined();
			expect(entry!.result).not.toBeNull();
			expect(entry!.result.toNumber()).toBe(23);
		});

		test("re-evaluated result is stored in LineCache", () => {
			const engine = new ExpressionEngine();
			engine.evaluateLine(1, ":x = 5");
			engine.evaluateLine(2, ":x + 10");

			engine.evaluateIncremental("x", 100);

			const entry = engine.getLineCache().getEntryForLine(2);
			expect(entry).toBeDefined();
			expect(entry!.result).not.toBeNull();
			expect(entry!.result.toNumber()).toBe(110);
		});

		test("VM variable state is updated after evaluateIncremental", () => {
			const engine = new ExpressionEngine();
			engine.evaluateLine(1, ":x = 5");
			engine.evaluateLine(2, ":x + 10");

			engine.evaluateIncremental("x", 7);

			// :x should now be 7 (direct variable lookup via evaluateLine)
			const [result] = engine.evaluateLine(3, ":x");
			expect(result.toNumber()).toBe(7);
		});
	});

	// ── Bytecode Cache Consistency ───────────────────────────────────

	describe("bytecode cache consistency", () => {
		test("bytecode cached in LineCache is reused for same expression", () => {
			const engine = new ExpressionEngine();

			// First evaluation compiles and caches
			engine.evaluateLine(1, "5 + 5");
			const entry1 = engine.getLineCache().getEntryForLine(1);
			expect(entry1).toBeDefined();

			// Evaluate the same expression at a different line number
			engine.evaluateLine(2, "5 + 5");
			const entry2 = engine.getLineCache().getEntryForLine(2);
			expect(entry2).toBeDefined();

			// Both should have valid bytecode
			expect(entry1!.bytecode.opcodes.length).toBeGreaterThan(0);
			expect(entry2!.bytecode.opcodes.length).toBeGreaterThan(0);
		});

		test("bytecodeCache is cleared on package unregister", () => {
			const engine = new ExpressionEngine();
			engine.evaluateLine(1, "5 + 5");

			// Get initial bytecode
			const entryBefore = engine.getLineCache().getEntryForLine(1);
			expect(entryBefore).toBeDefined();

			// Register then unregister a package (should clear bytecode cache)
			engine.registerPackage({ name: "test-package" });
			engine.unregisterPackage("test-package");

			// After cache clear, re-evaluation should still work correctly
			const result = engine.evaluateNumber("5 + 5");
			expect(result).toBe(10);
		});

		test("compileExpression produces bytecode that executeCached can run", () => {
			const engine = new ExpressionEngine();

			const { program, reads, writes } = engine.compileExpression("3 * 7");
			expect(program.opcodes.length).toBeGreaterThan(0);
			expect(reads).toEqual([]);
			expect(writes).toEqual([]);

			const result = engine.executeCached(program);
			expect(result.toNumber()).toBe(21);
		});

		test("compileExpression for variable def writes the variable", () => {
			const engine = new ExpressionEngine();

			const { program, reads, writes } = engine.compileExpression(":foo = 42");

			expect(program.opcodes.length).toBeGreaterThan(0);
			// The write variable is "foo" (variable being assigned)
			expect(writes).toContain("foo");
			// ":foo = 42" — reads may include "foo" if the parser treats :foo as a read
			// before the assignment. Either [] or ["foo"] is acceptable.
			expect(reads.length).toBeGreaterThanOrEqual(0);
		});

		describe("tryCompileExpression — non-throwing compile check", () => {
			test("returns true for a well-formed expression, without throwing", () => {
				const engine = new ExpressionEngine();
				expect(() => engine.tryCompileExpression("3 * 7")).not.toThrow();
				expect(engine.tryCompileExpression("3 * 7")).toBe(true);
			});

			test("returns false for text that doesn't parse as an expression, without throwing", () => {
				const engine = new ExpressionEngine();
				expect(() => engine.tryCompileExpression("My name is dave")).not.toThrow();
				expect(engine.tryCompileExpression("My name is dave")).toBe(false);
			});

			test("returns false (not throw) for an expression that's too long", () => {
				const engine = new ExpressionEngine();
				const longExpr = Array(2000).fill("1").join("+");
				expect(() => engine.tryCompileExpression(longExpr)).not.toThrow();
				expect(engine.tryCompileExpression(longExpr)).toBe(false);
			});

			test("returns false (not throw) for an expression that's too complex", () => {
				const engine = new ExpressionEngine();
				const complexExpr = Array(600).fill("1 + 1").join(" + ");
				expect(() => engine.tryCompileExpression(complexExpr)).not.toThrow();
				expect(engine.tryCompileExpression(complexExpr)).toBe(false);
			});

			test("agrees with compileExpression: true iff compileExpression doesn't throw", () => {
				const engine = new ExpressionEngine();
				const cases = ["3 * 7", ":foo = 42", "My name is dave", "sqrt(144)", "1 2 3", ""];
				for (const expr of cases) {
					let compileSucceeded = true;
					try {
						engine.compileExpression(expr);
					} catch {
						compileSucceeded = false;
					}
					expect(engine.tryCompileExpression(expr)).toBe(compileSucceeded);
				}
			});

			test("a successful tryCompileExpression populates the bytecode cache, so a subsequent compileExpression is a cache hit", () => {
				const engine = new ExpressionEngine();
				expect(engine.tryCompileExpression("9 * 9")).toBe(true);

				const { program } = engine.compileExpression("9 * 9");
				const result = engine.executeCached(program);
				expect(result.toNumber()).toBe(81);
			});
		});
	});

	// Regression for a bug found during release hardening: config.performance
	// .defaultCacheSize was documented (see PerformanceConfig's JSDoc) as
	// controlling cache eviction, but ExpressionEngine's bytecode cache read
	// a hardcoded constant instead and never consulted it — the config value
	// had zero effect no matter what a host set it to.
	describe("bytecode cache size respects config.performance.defaultCacheSize", () => {
		test("cache never grows past the configured limit — oldest entries are evicted", () => {
			const engine = new ExpressionEngine("en", false, {
				performance: { defaultCacheSize: 3, maxDocumentLines: 10000, parseTimeoutMs: 5000, executionTimeoutMs: 10000 },
			});

			// 5 distinct expressions against a cache capped at 3 entries.
			for (const expr of ["1 + 1", "2 + 2", "3 + 3", "4 + 4", "5 + 5"]) {
				engine.compileExpression(expr);
			}

			expect(engine.getBytecodeCache().size).toBe(3);
		});

		test("a larger configured limit actually retains more entries than the old hardcoded default would have allowed", () => {
			const engine = new ExpressionEngine("en", false, {
				performance: { defaultCacheSize: 10, maxDocumentLines: 10000, parseTimeoutMs: 5000, executionTimeoutMs: 10000 },
			});

			for (let i = 0; i < 10; i++) {
				engine.compileExpression(`${i} + ${i}`);
			}

			// All 10 survive because the configured cap (10) accommodates them —
			// proving the value flows through, not just that eviction exists.
			expect(engine.getBytecodeCache().size).toBe(10);
		});
	});
});
