import { describe, expect, test, beforeEach } from "@jest/globals";
import { DocumentModel } from "@solve-js/engine/DocumentModel";
import { djb2Hash } from "@solve-js/utilities/Hash";
import type { LineState, ApplyChangesResult } from "@solve-js/engine/DocumentModel";

describe("DocumentModel", () => {
	describe("setDocument", () => {
		test("initializes from text blob", () => {
			const model = new DocumentModel();
			model.setDocument("line1\nline2\nline3");
			expect(model.lineCount).toBe(3);
		});

		test("empty document", () => {
			const model = new DocumentModel();
			model.setDocument("");
			expect(model.lineCount).toBe(1); // split always gives at least one element
			expect(model.isEmpty).toBe(false);
		});

		test("replacing document clears old state", () => {
			const model = new DocumentModel();
			model.setDocument("a\nb\nc");
			expect(model.lineCount).toBe(3);
			model.setDocument("x\ny");
			expect(model.lineCount).toBe(2);
		});

		test("all lines marked dirty after setDocument", () => {
			const model = new DocumentModel();
			model.setDocument("a\nb\nc");
			const dirty = model.getDirtyLines();
			expect(dirty.length).toBe(3);
		});

		test("persistent line IDs assigned sequentially", () => {
			const model = new DocumentModel();
			model.setDocument("a\nb\nc");
			const lines = model.getAllLines();
			expect(lines[0].lineId).toBe(1);
			expect(lines[1].lineId).toBe(2);
			expect(lines[2].lineId).toBe(3);
		});

		test("text hash computed for each line", () => {
			const model = new DocumentModel();
			model.setDocument("hello\nworld");
			const lines = model.getAllLines();
			expect(lines[0].textHash).toBe(djb2Hash("hello"));
			expect(lines[1].textHash).toBe(djb2Hash("world"));
		});
	});

	describe("getLineAt", () => {
		let model: DocumentModel;

		beforeEach(() => {
			model = new DocumentModel();
			model.setDocument("a\nb\nc\nd\ne");
		});

		test("returns correct line by 1-based position", () => {
			expect(model.getLineAt(1)!.text).toBe("a");
			expect(model.getLineAt(3)!.text).toBe("c");
			expect(model.getLineAt(5)!.text).toBe("e");
		});

		test("returns undefined for out-of-range positions", () => {
			expect(model.getLineAt(0)).toBeUndefined();
			expect(model.getLineAt(6)).toBeUndefined();
			expect(model.getLineAt(100)).toBeUndefined();
		});

		test("returns undefined for negative positions", () => {
			expect(model.getLineAt(-1)).toBeUndefined();
		});
	});

	describe("getLinePosition", () => {
		let model: DocumentModel;

		beforeEach(() => {
			model = new DocumentModel();
			model.setDocument("a\nb\nc");
		});

		test("returns 1-based position of line ID", () => {
			const lines = model.getAllLines();
			expect(model.getLinePosition(lines[0].lineId)).toBe(1);
			expect(model.getLinePosition(lines[1].lineId)).toBe(2);
			expect(model.getLinePosition(lines[2].lineId)).toBe(3);
		});

		test("returns -1 for unknown line ID", () => {
			expect(model.getLinePosition(9999)).toBe(-1);
		});

		test("position cache is invalidated after structural edit", () => {
			const lines = model.getAllLines();
			expect(model.getLinePosition(lines[0].lineId)).toBe(1); // builds cache

			model.insertLines(2, ["x"]);

			// After insertion, position should update
			expect(model.getLinePosition(lines[0].lineId)).toBe(1); // unchanged
			expect(model.getLinePosition(lines[2].lineId)).toBe(4); // shifted
		});
	});

	describe("getLineById", () => {
		let model: DocumentModel;

		beforeEach(() => {
			model = new DocumentModel();
			model.setDocument("a\nb\nc");
		});

		test("returns LineState by persistent ID", () => {
			const lines = model.getAllLines();
			const found = model.getLineById(lines[0].lineId);
			expect(found).toBeDefined();
			expect(found!.text).toBe("a");
		});

		test("returns undefined for unknown ID", () => {
			expect(model.getLineById(9999)).toBeUndefined();
		});
	});

	describe("insertLines", () => {
		let model: DocumentModel;

		beforeEach(() => {
			model = new DocumentModel();
			model.setDocument("a\nb\nd\ne");
		});

		test("inserts lines at given position", () => {
			const newIds = model.insertLines(3, ["c1", "c2"]);
			expect(model.lineCount).toBe(6);
			expect(model.getLineAt(1)!.text).toBe("a");
			expect(model.getLineAt(2)!.text).toBe("b");
			expect(model.getLineAt(3)!.text).toBe("c1");
			expect(model.getLineAt(4)!.text).toBe("c2");
			expect(model.getLineAt(5)!.text).toBe("d");
			expect(model.getLineAt(6)!.text).toBe("e");
		});

		test("returns new persistent line IDs", () => {
			const newIds = model.insertLines(3, ["c"]);
			expect(newIds.length).toBe(1);
			expect(newIds[0]).toBeGreaterThan(0);
		});

		test("existing lines retain their IDs after insertion", () => {
			const before = model.getAllLines();
			const lineAId = before[0].lineId;
			const lineBId = before[1].lineId;

			model.insertLines(3, ["c"]);

			expect(model.getLineById(lineAId)!.text).toBe("a");
			expect(model.getLineById(lineBId)!.text).toBe("b");
			// Position shifted
			expect(model.getLinePosition(lineAId)).toBe(1);
			expect(model.getLinePosition(lineBId)).toBe(2);
		});

		test("inserts at beginning", () => {
			model.insertLines(1, ["x", "y"]);
			expect(model.lineCount).toBe(6);
			expect(model.getLineAt(1)!.text).toBe("x");
			expect(model.getLineAt(2)!.text).toBe("y");
			expect(model.getLineAt(3)!.text).toBe("a");
		});

		test("inserts at end", () => {
			model.insertLines(5, ["f", "g"]);
			expect(model.lineCount).toBe(6);
			expect(model.getLineAt(5)!.text).toBe("f");
			expect(model.getLineAt(6)!.text).toBe("g");
		});

		test("new lines are marked dirty", () => {
			// First clean all existing lines
			for (const line of model.getAllLines()) {
				model.markClean(line.lineId);
			}

			const newIds = model.insertLines(3, ["c"]);
			const newLine = model.getLineById(newIds[0]);
			expect(newLine!.dirty).toBe(true);
		});

		test("empty insert returns empty array", () => {
			const newIds = model.insertLines(2, []);
			expect(newIds.length).toBe(0);
		});
	});

	describe("deleteLines", () => {
		let model: DocumentModel;

		beforeEach(() => {
			model = new DocumentModel();
			model.setDocument("a\nb\nc\nd\ne");
		});

		test("deletes a range of lines", () => {
			const removed = model.deleteLines(2, 4);
			expect(model.lineCount).toBe(2);
			expect(model.getLineAt(1)!.text).toBe("a");
			expect(model.getLineAt(2)!.text).toBe("e");
			expect(removed.length).toBe(3);
		});

		test("surviving lines retain their IDs", () => {
			const before = model.getAllLines();
			const lineEId = before[4].lineId;

			model.deleteLines(2, 4);

			expect(model.getLineById(lineEId)!.text).toBe("e");
			expect(model.getLinePosition(lineEId)).toBe(2);
		});

		test("returns removed line IDs", () => {
			const before = model.getAllLines();
			const lineBId = before[1].lineId;

			const removed = model.deleteLines(2, 4);

			expect(removed).toContain(lineBId);
			expect(model.getLineById(lineBId)).toBeUndefined();
			expect(model.getLinePosition(lineBId)).toBe(-1);
		});

		test("delete single line", () => {
			model.deleteLines(3, 3);
			expect(model.lineCount).toBe(4);
			expect(model.getLineAt(1)!.text).toBe("a");
			expect(model.getLineAt(2)!.text).toBe("b");
			expect(model.getLineAt(3)!.text).toBe("d");
			expect(model.getLineAt(4)!.text).toBe("e");
		});

		test("delete entire document", () => {
			model.deleteLines(1, 5);
			expect(model.lineCount).toBe(0);
		});
	});

	describe("editLine", () => {
		let model: DocumentModel;

		beforeEach(() => {
			model = new DocumentModel();
			model.setDocument("a\nb\nc");
		});

		test("updates line text", () => {
			const changed = model.editLine(2, "B_new");
			expect(changed).toBe(true);
			expect(model.getLineAt(2)!.text).toBe("B_new");
		});

		test("returns false when text unchanged", () => {
			const changed = model.editLine(2, "b");
			expect(changed).toBe(false);
		});

		test("marks line dirty on change", () => {
			const line = model.getLineAt(2)!;
			model.markClean(line.lineId);

			model.editLine(2, "new text");
			expect(model.getLineAt(2)!.dirty).toBe(true);
		});

		test("clears bytecode and result on change", () => {
			const line = model.getLineAt(2)!;
			model.updateLineResult(line.lineId, [null as any], [{} as any], [""], [], [], false);

			model.editLine(2, "new text");

			const updated = model.getLineAt(2)!;
			expect(updated.bytecodes).toEqual([]);
			expect(updated.results).toEqual([]);
		});

		test("updates text hash on change", () => {
			const oldHash = model.getLineAt(2)!.textHash;
			model.editLine(2, "new text");
			expect(model.getLineAt(2)!.textHash).not.toBe(oldHash);
		});

		test("returns false for out-of-range line", () => {
			expect(model.editLine(999, "text")).toBe(false);
		});
	});

	describe("applyChanges", () => {
		let model: DocumentModel;

		beforeEach(() => {
			model = new DocumentModel();
			model.setDocument("a\nb\nc\nd\ne");
		});

		test("applies multiple non-overlapping changes", () => {
			const result = model.applyChanges([
				{ startLine: 2, deleteCount: 1, insertLines: ["B1", "B2"] },
				{ startLine: 5, deleteCount: 1, insertLines: ["E1"] },
			]);
			// Reverse order: startLine=5 first, then startLine=2
			// After change 2 (startLine=5): a b c d E1
			// After change 1 (startLine=2): a B1 B2 c d E1
			expect(model.lineCount).toBe(6);
			expect(model.getLineAt(1)!.text).toBe("a");
			expect(model.getLineAt(2)!.text).toBe("B1");
			expect(model.getLineAt(3)!.text).toBe("B2");
			expect(model.getLineAt(4)!.text).toBe("c");
			expect(model.getLineAt(5)!.text).toBe("d");
			expect(model.getLineAt(6)!.text).toBe("E1");
			expect(result.inserted.length).toBe(3); // B1, B2, E1
			expect(result.removed.length).toBe(2);  // b, e
		});

		test("handles replacement (delete + insert)", () => {
			const result = model.applyChanges([
				{ startLine: 2, deleteCount: 3, insertLines: ["X", "Y"] },
			]);
			expect(model.lineCount).toBe(4);
			expect(model.getLineAt(1)!.text).toBe("a");
			expect(model.getLineAt(2)!.text).toBe("X");
			expect(model.getLineAt(3)!.text).toBe("Y");
			expect(model.getLineAt(4)!.text).toBe("e");
			expect(result.inserted.length).toBe(2);
			expect(result.removed.length).toBe(3); // b, c, d
		});

		test("returns both inserted and removed IDs", () => {
			const result = model.applyChanges([
				{ startLine: 3, deleteCount: 0, insertLines: ["new"] },
			]);
			expect(result.inserted.length).toBe(1);
			expect(result.removed.length).toBe(0);
		});
	});

	describe("getVisibleLines", () => {
		let model: DocumentModel;

		beforeEach(() => {
			model = new DocumentModel();
			model.setDocument("a\nb\nc\nd\ne\nf\ng");
		});

		test("returns lines in viewport range", () => {
			const visible = model.getVisibleLines(2, 4);
			expect(visible.length).toBe(3);
			expect(visible[0].text).toBe("b");
			expect(visible[1].text).toBe("c");
			expect(visible[2].text).toBe("d");
		});

		test("clamps to document bounds", () => {
			const visible = model.getVisibleLines(0, 100);
			expect(visible.length).toBe(7);
		});

		test("returns empty for out-of-range viewport", () => {
			const visible = model.getVisibleLines(10, 20);
			expect(visible.length).toBe(0);
		});

		test("single line viewport", () => {
			const visible = model.getVisibleLines(3, 3);
			expect(visible.length).toBe(1);
			expect(visible[0].text).toBe("c");
		});
	});

	describe("invalidateAll", () => {
		test("marks all lines dirty", () => {
			const model = new DocumentModel();
			model.setDocument("a\nb\nc");

			for (const line of model.getAllLines()) {
				model.markClean(line.lineId);
			}

			model.invalidateAll();

			for (const line of model.getAllLines()) {
				expect(line.dirty).toBe(true);
			}
		});
	});

	describe("updateLineResult", () => {
		test("updates all evaluation state and marks clean", () => {
			const model = new DocumentModel();
			model.setDocument("x = 5");

			const line = model.getLineAt(1)!;
			const mockResult = {} as any;
			const mockBytecode = {} as any;

			model.updateLineResult(line.lineId, [mockResult], [mockBytecode], ["x = 5"], ["y"], ["x"], true);

			const updated = model.getLineById(line.lineId)!;
			expect(updated.results).toEqual([mockResult]);
			expect(updated.bytecodes).toEqual([mockBytecode]);
			expect(updated.reads).toEqual(["y"]);
			expect(updated.writes).toEqual(["x"]);
			expect(updated.isVariableDef).toBe(true);
			expect(updated.dirty).toBe(false);
		});

		test("no-op for unknown line ID", () => {
			const model = new DocumentModel();
			model.setDocument("a");
			model.updateLineResult(9999, [] as any, [] as any, [], [], [], false);
		});
	});

	describe("updateLineCompiled", () => {
		test("updates compile state without execution result and leaves dirty", () => {
			const model = new DocumentModel();
			model.setDocument("x + 1");

			const line = model.getLineAt(1)!;
			const mockBytecode = {} as any;

			model.updateLineCompiled(line.lineId, ["x + 1"], [mockBytecode], ["x"], [], false);

			const updated = model.getLineById(line.lineId)!;
			expect(updated.expressions).toEqual(["x + 1"]);
			expect(updated.bytecodes).toEqual([mockBytecode]);
			expect(updated.reads).toEqual(["x"]);
			expect(updated.dirty).toBe(true); // still dirty — needs execution
			expect(updated.results).toEqual([]); // no results set
		});
	});

	describe("isBytecodeValid", () => {
		test("returns true when text hash matches", () => {
			const model = new DocumentModel();
			model.setDocument("hello");

			const line = model.getLineAt(1)!;
			expect(model.isBytecodeValid(line.lineId, line.textHash)).toBe(true);
		});

		test("returns false when text hash differs", () => {
			const model = new DocumentModel();
			model.setDocument("hello");

			const line = model.getLineAt(1)!;
			const wrongHash = line.textHash + 1;
			expect(model.isBytecodeValid(line.lineId, wrongHash)).toBe(false);
		});

		test("returns false for unknown line ID", () => {
			const model = new DocumentModel();
			model.setDocument("hello");
			expect(model.isBytecodeValid(9999, 0)).toBe(false);
		});

		test("returns false after line is edited", () => {
			const model = new DocumentModel();
			model.setDocument("hello");

			const line = model.getLineAt(1)!;
			const originalHash = line.textHash;

			model.editLine(1, "world");

			expect(model.isBytecodeValid(line.lineId, originalHash)).toBe(false);
		});
	});

	describe("iteration", () => {
		test("iterates lines in document order", () => {
			const model = new DocumentModel();
			model.setDocument("a\nb\nc");

			const texts: string[] = [];
			for (const line of model) {
				texts.push(line.text);
			}
			expect(texts).toEqual(["a", "b", "c"]);
		});
	});

	describe("clear", () => {
		test("resets all state", () => {
			const model = new DocumentModel();
			model.setDocument("a\nb\nc");
			model.clear();

			expect(model.lineCount).toBe(0);
			expect(model.getAllLines().length).toBe(0);
		});
	});

	describe("persistent IDs survive structural edits", () => {
		test("IDs unchanged after line insertions", () => {
			const model = new DocumentModel();
			model.setDocument("a\nb\nc");
			const before = model.getAllLines();
			const idA = before[0].lineId;
			const idC = before[2].lineId;

			model.insertLines(2, ["x"]);

			expect(model.getLineById(idA)!.text).toBe("a");
			expect(model.getLineById(idC)!.text).toBe("c");
			expect(model.getLinePosition(idA)).toBe(1);
			expect(model.getLinePosition(idC)).toBe(4); // shifted down
		});

		test("IDs unchanged after line deletions", () => {
			const model = new DocumentModel();
			model.setDocument("a\nb\nc\nd\ne");
			const before = model.getAllLines();
			const idA = before[0].lineId;
			const idE = before[4].lineId;

			model.deleteLines(2, 4);

			expect(model.getLineById(idA)!.text).toBe("a");
			expect(model.getLineById(idE)!.text).toBe("e");
			expect(model.getLinePosition(idA)).toBe(1);
			expect(model.getLinePosition(idE)).toBe(2); // shifted up
		});

		test("IDs stable across mixed insert + delete", () => {
			const model = new DocumentModel();
			model.setDocument("a\nb\nc\nd\ne");
			const before = model.getAllLines();
			const idA = before[0].lineId;
			const idE = before[4].lineId;

			// Replace b,c with X,Y,Z and delete e
			model.applyChanges([
				{ startLine: 2, deleteCount: 2, insertLines: ["X", "Y", "Z"] },
				{ startLine: 5, deleteCount: 1, insertLines: [] },
			]);

			expect(model.lineCount).toBe(5);
			expect(model.getLineById(idA)!.text).toBe("a");
			expect(model.getLineById(idE)).toBeUndefined(); // e was deleted
			expect(model.getLineAt(1)!.text).toBe("a");
			expect(model.getLineAt(2)!.text).toBe("X");
			expect(model.getLineAt(3)!.text).toBe("Y");
			expect(model.getLineAt(4)!.text).toBe("Z");
			expect(model.getLineAt(5)!.text).toBe("d");
		});
	});
});
