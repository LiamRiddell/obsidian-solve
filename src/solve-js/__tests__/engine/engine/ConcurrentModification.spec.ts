import { describe, expect, test, beforeEach } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { DocumentModel } from "@solve-js/engine/DocumentModel";
import { ThreeTierEvaluator } from "@solve-js/engine/ThreeTierEvaluator";

/**
 * Concurrent Modification Tests — Phase 6.2
 *
 * Verifies the engine handles rapid, overlapping, and interleaved
 * document changes correctly without state corruption.
 */
describe("Concurrent Modification", () => {
	// ── Rapid applyTransaction ──────────────────────────────────────

	describe("rapid applyTransaction sequences", () => {
		test("10 rapid applyTransaction calls in sequence preserve document integrity", () => {
			const engine = new ExpressionEngine();
			const doc = new DocumentModel();
			doc.setDocument("line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\nline 10");
			const evaluator = new ThreeTierEvaluator(doc, engine);

			// Sequence of alternating inserts and deletes
			evaluator.applyTransaction([
				{ startLine: 1, deleteCount: 0, insertLines: ["inserted A"] },
			]);
			evaluator.applyTransaction([
				{ startLine: 5, deleteCount: 1, insertLines: [] },
			]);
			evaluator.applyTransaction([
				{ startLine: 3, deleteCount: 2, insertLines: ["replacement B", "replacement C"] },
			]);
			evaluator.applyTransaction([
				{ startLine: 8, deleteCount: 0, insertLines: ["inserted D"] },
			]);
			evaluator.applyTransaction([
				{ startLine: 1, deleteCount: 2, insertLines: ["beginning E"] },
			]);
			evaluator.applyTransaction([
				{ startLine: doc.lineCount + 1, deleteCount: 0, insertLines: ["appended F"] },
			]);
			evaluator.applyTransaction([
				{ startLine: 4, deleteCount: 3, insertLines: [] },
			]);
			evaluator.applyTransaction([
				{ startLine: 2, deleteCount: 0, insertLines: ["middle G"] },
			]);
			evaluator.applyTransaction([
				{ startLine: 3, deleteCount: 1, insertLines: ["replaced H"] },
			]);
			evaluator.applyTransaction([
				{ startLine: 1, deleteCount: 0, insertLines: ["very start I"] },
			]);

			// Document should be in a valid state
			expect(doc.lineCount).toBeGreaterThan(0);
			expect(doc.isEmpty).toBe(false);

			// All positions should have valid lines
			for (let pos = 1; pos <= doc.lineCount; pos++) {
				const state = doc.getLineAt(pos);
				expect(state).toBeDefined();
				expect(state!.text.length).toBeGreaterThan(0);
			}

			evaluator.terminateWorker();
		});

		test("100 sequential single-line edits do not corrupt state", () => {
			const engine = new ExpressionEngine();
			const doc = new DocumentModel();
			doc.setDocument("initial content line");
			const evaluator = new ThreeTierEvaluator(doc, engine);

			for (let i = 0; i < 100; i++) {
				// Edit the only line in place
				const changed = doc.editLine(1, `edit ${i}: ${"x".repeat(i % 10 + 1)}`);
				expect(doc.lineCount).toBe(1);

				if (changed) {
					// Re-evaluate after edit
					evaluator.evaluate({ startLine: 1, endLine: 1 });
				}
			}

			expect(doc.lineCount).toBe(1);
			evaluator.terminateWorker();
		});
	});

	// ── Overlapping Edits ───────────────────────────────────────────

	describe("overlapping and adjacent edits", () => {
		test("adjacent edits (no overlap) are processed correctly in reverse order", () => {
			const engine = new ExpressionEngine();
			const doc = new DocumentModel();
			doc.setDocument("A\nB\nC\nD\nE");
			const evaluator = new ThreeTierEvaluator(doc, engine);

			// Two non-overlapping changes
			const result = evaluator.applyTransaction([
				{ startLine: 2, deleteCount: 1, insertLines: ["X"] },
				{ startLine: 4, deleteCount: 1, insertLines: ["Y"] },
			]);

			// Should have 2 removals (B and D) and 2 insertions (X and Y)
			expect(result.removed.length).toBe(2);
			expect(result.inserted.length).toBe(2);

			// Result should be: A, X, C, Y, E
			expect(doc.lineCount).toBe(5);
			expect(doc.getLineAt(1)!.text).toBe("A");
			expect(doc.getLineAt(2)!.text).toBe("X");
			expect(doc.getLineAt(3)!.text).toBe("C");
			expect(doc.getLineAt(4)!.text).toBe("Y");
			expect(doc.getLineAt(5)!.text).toBe("E");

			evaluator.terminateWorker();
		});

		test("edit same line, then delete it, then insert at its position", () => {
			const engine = new ExpressionEngine();
			const doc = new DocumentModel();
			doc.setDocument("keep me\nchange me\nalso keep");
			const evaluator = new ThreeTierEvaluator(doc, engine);

			// Step 1: Edit line 2
			doc.editLine(2, "changed text");
			evaluator.evaluate({ startLine: 1, endLine: 3 });

			// Step 2: Delete line 2, insert new content
			evaluator.applyTransaction([
				{ startLine: 2, deleteCount: 1, insertLines: ["brand new A", "brand new B"] },
			]);

			// Result: "keep me", "brand new A", "brand new B", "also keep"
			expect(doc.lineCount).toBe(4);
			expect(doc.getLineAt(1)!.text).toBe("keep me");
			expect(doc.getLineAt(2)!.text).toBe("brand new A");
			expect(doc.getLineAt(3)!.text).toBe("brand new B");
			expect(doc.getLineAt(4)!.text).toBe("also keep");

			evaluator.terminateWorker();
		});

		test("insert at start, middle, and end in one batch (reverse-order application)", () => {
			const engine = new ExpressionEngine();
			const doc = new DocumentModel();
			doc.setDocument("A\nB\nC");
			const evaluator = new ThreeTierEvaluator(doc, engine);

			// Three non-overlapping insertions at original positions.
			// Changes are applied in REVERSE order (highest startLine first):
			//   1. "END" at orig pos 5 (appends to end)
			//   2. "MIDDLE" at orig pos 3 (between B and C)
			//   3. "START" at orig pos 1 (before A)
			// Result: START, A, B, MIDDLE, C, END
			evaluator.applyTransaction([
				{ startLine: 1, deleteCount: 0, insertLines: ["START"] },
				{ startLine: 3, deleteCount: 0, insertLines: ["MIDDLE"] },
				{ startLine: 5, deleteCount: 0, insertLines: ["END"] },
			]);

			expect(doc.lineCount).toBe(6);
			expect(doc.getLineAt(1)!.text).toBe("START");
			expect(doc.getLineAt(2)!.text).toBe("A");
			expect(doc.getLineAt(3)!.text).toBe("B");
			expect(doc.getLineAt(4)!.text).toBe("MIDDLE");
			expect(doc.getLineAt(5)!.text).toBe("C");
			expect(doc.getLineAt(6)!.text).toBe("END");

			evaluator.terminateWorker();
		});
	});

	// ── Interleaved Evaluate + Edit ─────────────────────────────────

	describe("interleaved evaluate and edit operations", () => {
		test("evaluate after variable value edit produces correct downstream results", () => {
			const engine = new ExpressionEngine();
			const doc = new DocumentModel();
			doc.setDocument(":x = 5\n:x + 3\n42");
			const evaluator = new ThreeTierEvaluator(doc, engine);

			// Initial evaluation
			const r1 = evaluator.evaluate({ startLine: 1, endLine: 3 });
			expect(r1.tierCounts.tier1).toBe(3);
			expect(doc.getLineAt(2)!.result!.toNumber()).toBe(8); // 5+3

			// Edit line 1: change variable value, then re-evaluate
			doc.editLine(1, ":x = 100");
			evaluator.evaluate({ startLine: 1, endLine: 3 });

			// Line 2 (:x + 3) should reflect new value: 100 + 3 = 103
			const line2After = doc.getLineAt(2)!;
			// After re-evaluation, result should be updated
			expect(line2After.result).not.toBeNull();
			if (line2After.result) {
				expect(line2After.result.toNumber()).toBe(103);
			}

			evaluator.terminateWorker();
		});

		test("applyTransaction + evaluate preserves correct line content after insertion", () => {
			const engine = new ExpressionEngine();
			const doc = new DocumentModel();
			doc.setDocument(":a = 1\n:a + 5\n42");
			const evaluator = new ThreeTierEvaluator(doc, engine);

			// Initial eval
			evaluator.evaluate({ startLine: 1, endLine: 3 });
			expect(doc.getLineAt(2)!.result!.toNumber()).toBe(6);

			// Insert a new line between lines 1 and 2
			evaluator.applyTransaction([
				{ startLine: 2, deleteCount: 0, insertLines: ["inserted text"] },
			]);

			// After insertion, line 2 is now the inserted text (dirty)
			expect(doc.getLineAt(2)!.text).toBe("inserted text");
			// Original line 2 (:a + 5) shifted to position 3
			expect(doc.getLineAt(3)!.text).toBe(":a + 5");

			evaluator.terminateWorker();
		});

		test("full evaluate after applyTransaction rebuilds correct state", () => {
			const engine = new ExpressionEngine();
			const doc = new DocumentModel();
			doc.setDocument(":x = 2\n:y = :x * 3\n:z = :y + 1");
			const evaluator = new ThreeTierEvaluator(doc, engine);

			evaluator.evaluate({ startLine: 1, endLine: 3 });
			expect(doc.getLineAt(2)!.result!.toNumber()).toBe(6); // y = 2*3
			expect(doc.getLineAt(3)!.result!.toNumber()).toBe(7); // z = 6+1

			// Delete line 1 (:x = 2) — remaining lines shift up
			evaluator.applyTransaction([
				{ startLine: 1, deleteCount: 1, insertLines: [] },
			]);

			// After delete, document has 2 lines
			expect(doc.lineCount).toBe(2);

			// Old line 2 (:y = :x * 3) is now position 1
			// Old line 3 (:z = :y + 1) is now position 2
			expect(doc.getLineAt(1)!.text).toBe(":y = :x * 3");
			expect(doc.getLineAt(2)!.text).toBe(":z = :y + 1");

			evaluator.terminateWorker();
		});
	});

	// ── Large Batch Edits ───────────────────────────────────────────

	describe("large batch edits", () => {
		test("deleting the entire document in one change", () => {
			const engine = new ExpressionEngine();
			const doc = new DocumentModel();
			doc.setDocument(Array(100).fill("42").join("\n"));
			const evaluator = new ThreeTierEvaluator(doc, engine);

			expect(doc.lineCount).toBe(100);

			evaluator.applyTransaction([
				{ startLine: 1, deleteCount: 100, insertLines: [] },
			]);

			expect(doc.lineCount).toBe(0);
			expect(doc.isEmpty).toBe(true);

			evaluator.terminateWorker();
		});

		test("replacing the entire document in one change", () => {
			const engine = new ExpressionEngine();
			const doc = new DocumentModel();
			doc.setDocument(Array(50).fill("old").join("\n"));
			const evaluator = new ThreeTierEvaluator(doc, engine);

			const newLines = ["new A", "new B", "new C"];
			evaluator.applyTransaction([
				{ startLine: 1, deleteCount: 50, insertLines: newLines },
			]);

			expect(doc.lineCount).toBe(3);
			expect(doc.getLineAt(1)!.text).toBe("new A");
			expect(doc.getLineAt(2)!.text).toBe("new B");
			expect(doc.getLineAt(3)!.text).toBe("new C");

			evaluator.terminateWorker();
		});

		test("50 simultaneous non-overlapping single-line edits", () => {
			const engine = new ExpressionEngine();
			const doc = new DocumentModel();
			const lines: string[] = [];
			for (let i = 0; i < 50; i++) {
				lines.push(`line ${i}`);
			}
			doc.setDocument(lines.join("\n"));
			const evaluator = new ThreeTierEvaluator(doc, engine);

			// Replace every even-indexed line (1-based: 1, 3, 5, ...)
			const changes = [];
			for (let i = 50; i >= 1; i -= 2) {
				changes.push({
					startLine: i,
					deleteCount: 1,
					insertLines: [`replaced ${i}`],
				});
			}

			const result = evaluator.applyTransaction(changes);
			expect(result.removed.length).toBe(25);
			expect(result.inserted.length).toBe(25);
			expect(doc.lineCount).toBe(50); // Same count (replace, not delete)

			evaluator.terminateWorker();
		});
	});

	// ── Edge Cases ──────────────────────────────────────────────────

	describe("concurrent modification edge cases", () => {
		test("insert at position beyond document end appends to end", () => {
			const engine = new ExpressionEngine();
			const doc = new DocumentModel();
			doc.setDocument("only line");
			const evaluator = new ThreeTierEvaluator(doc, engine);

			// Insert at position beyond doc end
			expect(() => {
				evaluator.applyTransaction([
					{ startLine: 999, deleteCount: 0, insertLines: ["appended"] },
				]);
			}).not.toThrow();

			// Should have appended at the end
			expect(doc.lineCount).toBe(2);
			expect(doc.getLineAt(2)!.text).toBe("appended");

			evaluator.terminateWorker();
		});

		test("delete more lines than exist clips to document bounds", () => {
			const engine = new ExpressionEngine();
			const doc = new DocumentModel();
			doc.setDocument("A\nB\nC");
			const evaluator = new ThreeTierEvaluator(doc, engine);

			// Try to delete 100 lines starting at line 2
			// SegmentTree spliceAt clips to available length
			evaluator.applyTransaction([
				{ startLine: 2, deleteCount: 100, insertLines: [] },
			]);

			expect(doc.lineCount).toBe(1);
			expect(doc.getLineAt(1)!.text).toBe("A");

			evaluator.terminateWorker();
		});

		test("empty insertLines array is a pure delete", () => {
			const engine = new ExpressionEngine();
			const doc = new DocumentModel();
			doc.setDocument("A\nB\nC\nD\nE");
			const evaluator = new ThreeTierEvaluator(doc, engine);

			evaluator.applyTransaction([
				{ startLine: 2, deleteCount: 2, insertLines: [] },
			]);

			expect(doc.lineCount).toBe(3);
			expect(doc.getLineAt(1)!.text).toBe("A");
			expect(doc.getLineAt(2)!.text).toBe("D");
			expect(doc.getLineAt(3)!.text).toBe("E");

			evaluator.terminateWorker();
		});

		test("zero deleteCount with insertLines is a pure insert", () => {
			const engine = new ExpressionEngine();
			const doc = new DocumentModel();
			doc.setDocument("A\nB\nC");
			const evaluator = new ThreeTierEvaluator(doc, engine);

			evaluator.applyTransaction([
				{ startLine: 2, deleteCount: 0, insertLines: ["X", "Y"] },
			]);

			expect(doc.lineCount).toBe(5);
			expect(doc.getLineAt(1)!.text).toBe("A");
			expect(doc.getLineAt(2)!.text).toBe("X");
			expect(doc.getLineAt(3)!.text).toBe("Y");
			expect(doc.getLineAt(4)!.text).toBe("B");
			expect(doc.getLineAt(5)!.text).toBe("C");

			evaluator.terminateWorker();
		});

		test("empty change list is a no-op", () => {
			const engine = new ExpressionEngine();
			const doc = new DocumentModel();
			doc.setDocument("A\nB\nC");
			const evaluator = new ThreeTierEvaluator(doc, engine);

			const result = evaluator.applyTransaction([]);

			expect(result.inserted.length).toBe(0);
			expect(result.removed.length).toBe(0);
			expect(doc.lineCount).toBe(3);

			evaluator.terminateWorker();
		});
	});
});
