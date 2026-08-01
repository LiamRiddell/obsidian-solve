import { describe, expect, test, beforeEach } from "@jest/globals";
import { SegmentTree } from "@solve-js/engine/SegmentTree";

describe("SegmentTree", () => {
	describe("getAt", () => {
		let tree: SegmentTree;

		beforeEach(() => {
			tree = new SegmentTree();
			tree.replaceAll([10, 20, 30, 40, 50]);
		});

		test("returns correct element by index", () => {
			expect(tree.getAt(0)).toBe(10);
			expect(tree.getAt(2)).toBe(30);
			expect(tree.getAt(4)).toBe(50);
		});

		test("returns undefined for negative index", () => {
			expect(tree.getAt(-1)).toBeUndefined();
		});

		test("returns undefined for index out of bounds", () => {
			expect(tree.getAt(5)).toBeUndefined();
			expect(tree.getAt(100)).toBeUndefined();
		});

		test("returns undefined when tree is empty", () => {
			const empty = new SegmentTree();
			expect(empty.getAt(0)).toBeUndefined();
		});
	});

	describe("insertAt", () => {
		let tree: SegmentTree;

		beforeEach(() => {
			tree = new SegmentTree();
			tree.replaceAll([10, 30, 40]);
		});

		test("inserts at beginning", () => {
			tree.insertAt(0, 5);
			expect(tree.length).toBe(4);
			expect(tree.getAt(0)).toBe(5);
			expect(tree.getAt(1)).toBe(10);
			expect(tree.getAt(2)).toBe(30);
			expect(tree.getAt(3)).toBe(40);
		});

		test("inserts in middle", () => {
			tree.insertAt(1, 20);
			expect(tree.length).toBe(4);
			expect(tree.getAt(0)).toBe(10);
			expect(tree.getAt(1)).toBe(20);
			expect(tree.getAt(2)).toBe(30);
			expect(tree.getAt(3)).toBe(40);
		});

		test("inserts at end", () => {
			tree.insertAt(3, 50);
			expect(tree.length).toBe(4);
			expect(tree.getAt(3)).toBe(50);
		});

		test("inserts into empty tree", () => {
			const empty = new SegmentTree();
			empty.insertAt(0, 99);
			expect(empty.length).toBe(1);
			expect(empty.getAt(0)).toBe(99);
		});
	});

	describe("deleteAt", () => {
		let tree: SegmentTree;

		beforeEach(() => {
			tree = new SegmentTree();
			tree.replaceAll([10, 20, 30, 40, 50]);
		});

		test("deletes from beginning", () => {
			const removed = tree.deleteAt(0);
			expect(removed).toBe(10);
			expect(tree.length).toBe(4);
			expect(tree.getAt(0)).toBe(20);
		});

		test("deletes from middle", () => {
			const removed = tree.deleteAt(2);
			expect(removed).toBe(30);
			expect(tree.length).toBe(4);
			expect(tree.getAt(0)).toBe(10);
			expect(tree.getAt(1)).toBe(20);
			expect(tree.getAt(2)).toBe(40);
			expect(tree.getAt(3)).toBe(50);
		});

		test("deletes from end", () => {
			const removed = tree.deleteAt(4);
			expect(removed).toBe(50);
			expect(tree.length).toBe(4);
			expect(tree.getAt(3)).toBe(40);
		});

		test("returns undefined for out-of-bounds index", () => {
			expect(tree.deleteAt(5)).toBeUndefined();
			expect(tree.deleteAt(-1)).toBeUndefined();
			expect(tree.length).toBe(5); // unchanged
		});

		test("deletes last element leaves empty tree", () => {
			const single = new SegmentTree();
			single.replaceAll([42]);
			expect(single.deleteAt(0)).toBe(42);
			expect(single.length).toBe(0);
			expect(single.isEmpty).toBe(true);
		});
	});

	describe("spliceAt", () => {
		let tree: SegmentTree;

		beforeEach(() => {
			tree = new SegmentTree();
			tree.replaceAll([10, 20, 30, 40, 50]);
		});

		test("replaces elements with new IDs", () => {
			const removed = tree.spliceAt(1, 3, [21, 22]);
			expect(removed).toEqual([20, 30, 40]);
			expect(tree.length).toBe(4);
			expect(tree.getAt(0)).toBe(10);
			expect(tree.getAt(1)).toBe(21);
			expect(tree.getAt(2)).toBe(22);
			expect(tree.getAt(3)).toBe(50);
		});

		test("inserts without deletion", () => {
			const removed = tree.spliceAt(2, 0, [25, 26]);
			expect(removed).toEqual([]);
			expect(tree.length).toBe(7);
			expect(tree.getAt(2)).toBe(25);
			expect(tree.getAt(3)).toBe(26);
			expect(tree.getAt(4)).toBe(30);
		});

		test("deletes without insertion", () => {
			const removed = tree.spliceAt(2, 2, []);
			expect(removed).toEqual([30, 40]);
			expect(tree.length).toBe(3);
			expect(tree.getAt(0)).toBe(10);
			expect(tree.getAt(1)).toBe(20);
			expect(tree.getAt(2)).toBe(50);
		});

		test("splice at beginning", () => {
			const removed = tree.spliceAt(0, 2, [5, 6]);
			expect(removed).toEqual([10, 20]);
			expect(tree.length).toBe(5);
			expect(tree.getAt(0)).toBe(5);
			expect(tree.getAt(1)).toBe(6);
			expect(tree.getAt(2)).toBe(30);
		});

		test("splice at end", () => {
			const removed = tree.spliceAt(3, 2, [41, 42]);
			expect(removed).toEqual([40, 50]);
			expect(tree.length).toBe(5);
			expect(tree.getAt(3)).toBe(41);
			expect(tree.getAt(4)).toBe(42);
		});

		test("splice entire tree", () => {
			const removed = tree.spliceAt(0, 5, [99]);
			expect(removed).toEqual([10, 20, 30, 40, 50]);
			expect(tree.length).toBe(1);
			expect(tree.getAt(0)).toBe(99);
		});

		test("splice on empty tree", () => {
			const empty = new SegmentTree();
			const removed = empty.spliceAt(0, 0, [1, 2, 3]);
			expect(removed).toEqual([]);
			expect(empty.length).toBe(3);
			expect(empty.getAt(0)).toBe(1);
			expect(empty.getAt(2)).toBe(3);
		});

		test("clamps out-of-bounds start index", () => {
			const removed = tree.spliceAt(-5, 2, [0]);
			expect(removed.length).toBe(2); // clamped to start at 0
			expect(tree.getAt(0)).toBe(0);
		});

		test("clamps deleteCount exceeding remaining elements", () => {
			const removed = tree.spliceAt(3, 10, [41]);
			expect(removed).toEqual([40, 50]);
			expect(tree.length).toBe(4);
			expect(tree.getAt(3)).toBe(41);
		});
	});

	describe("getRange", () => {
		let tree: SegmentTree;

		beforeEach(() => {
			tree = new SegmentTree();
			tree.replaceAll([10, 20, 30, 40, 50, 60, 70]);
		});

		test("returns contiguous range", () => {
			expect(tree.getRange(1, 3)).toEqual([20, 30, 40]);
		});

		test("returns full range", () => {
			expect(tree.getRange(0, 6)).toEqual([10, 20, 30, 40, 50, 60, 70]);
		});

		test("returns single element", () => {
			expect(tree.getRange(3, 3)).toEqual([40]);
		});

		test("clamps start index below 0", () => {
			expect(tree.getRange(-5, 2)).toEqual([10, 20, 30]);
		});

		test("clamps end index above tree size", () => {
			expect(tree.getRange(4, 100)).toEqual([50, 60, 70]);
		});

		test("returns empty for inverted range", () => {
			expect(tree.getRange(5, 2)).toEqual([]);
		});

		test("returns empty when tree is empty", () => {
			const empty = new SegmentTree();
			expect(empty.getRange(0, 10)).toEqual([]);
		});
	});

	describe("replaceAll", () => {
		test("replaces existing content", () => {
			const tree = new SegmentTree();
			tree.replaceAll([1, 2, 3]);
			expect(tree.length).toBe(3);
			expect(tree.getAt(0)).toBe(1);

			tree.replaceAll([4, 5]);
			expect(tree.length).toBe(2);
			expect(tree.getAt(0)).toBe(4);
			expect(tree.getAt(1)).toBe(5);
		});

		test("handles empty array", () => {
			const tree = new SegmentTree();
			tree.replaceAll([1, 2, 3]);
			tree.replaceAll([]);
			expect(tree.length).toBe(0);
			expect(tree.isEmpty).toBe(true);
		});

		test("large balanced build maintains correctness", () => {
			const tree = new SegmentTree();
			const ids = Array.from({ length: 1000 }, (_, i) => i + 1);
			tree.replaceAll(ids);

			expect(tree.length).toBe(1000);
			expect(tree.getAt(0)).toBe(1);
			expect(tree.getAt(499)).toBe(500);
			expect(tree.getAt(999)).toBe(1000);
		});
	});

	describe("clear", () => {
		test("removes all elements", () => {
			const tree = new SegmentTree();
			tree.replaceAll([1, 2, 3]);
			tree.clear();
			expect(tree.length).toBe(0);
			expect(tree.isEmpty).toBe(true);
			expect(tree.getAt(0)).toBeUndefined();
		});

		test("clear on empty tree is no-op", () => {
			const tree = new SegmentTree();
			tree.clear();
			expect(tree.length).toBe(0);
		});
	});

	describe("iteration", () => {
		test("iterates in document order", () => {
			const tree = new SegmentTree();
			tree.replaceAll([10, 20, 30]);

			const result = [...tree];
			expect(result).toEqual([10, 20, 30]);
		});

		test("empty tree yields nothing", () => {
			const tree = new SegmentTree();
			expect([...tree]).toEqual([]);
		});

		test("iteration order correct after splices", () => {
			const tree = new SegmentTree();
			tree.replaceAll([10, 20, 30, 40, 50]);
			tree.spliceAt(2, 2, [21, 22, 23]);

			expect([...tree]).toEqual([10, 20, 21, 22, 23, 50]);
		});

		test("iteration after multiple insertions and deletions", () => {
			const tree = new SegmentTree();
			tree.replaceAll([1, 2, 3, 4, 5]);
			// spliceAt(1, 2, [6,7,8]) removes 2,3 and inserts 6,7,8 → [1, 6, 7, 8, 4, 5]
			tree.spliceAt(1, 2, [6, 7, 8]);
			// insertAt(0, 0) → [0, 1, 6, 7, 8, 4, 5]
			tree.insertAt(0, 0);
			// deleteAt(2) removes index 2 (=6) → [0, 1, 7, 8, 4, 5]
			tree.deleteAt(2);
			expect([...tree]).toEqual([0, 1, 7, 8, 4, 5]);
		});
	});

	describe("length and isEmpty", () => {
		test("length tracks element count", () => {
			const tree = new SegmentTree();
			expect(tree.length).toBe(0);
			expect(tree.isEmpty).toBe(true);

			tree.insertAt(0, 10);
			expect(tree.length).toBe(1);
			expect(tree.isEmpty).toBe(false);

			tree.insertAt(1, 20);
			expect(tree.length).toBe(2);

			tree.deleteAt(0);
			expect(tree.length).toBe(1);

			tree.deleteAt(0);
			expect(tree.length).toBe(0);
			expect(tree.isEmpty).toBe(true);
		});
	});

	describe("edge cases", () => {
		test("single element operations", () => {
			const tree = new SegmentTree();
			tree.replaceAll([42]);

			expect(tree.getAt(0)).toBe(42);
			expect(tree.getRange(0, 0)).toEqual([42]);

			tree.insertAt(0, 10);
			expect([...tree]).toEqual([10, 42]);

			tree.insertAt(2, 99);
			expect([...tree]).toEqual([10, 42, 99]);
		});

		test("many consecutive splice calls", () => {
			const tree = new SegmentTree();
			tree.replaceAll([0]);

			for (let i = 1; i <= 100; i++) {
				tree.spliceAt(i, 0, [i]);
			}

			expect(tree.length).toBe(101);
			expect(tree.getAt(0)).toBe(0);
			expect(tree.getAt(100)).toBe(100);

			// Delete half
			tree.spliceAt(50, 50, []);
			expect(tree.length).toBe(51);
			expect(tree.getAt(50)).toBe(100);
		});

		test("stress test: 10,000 element replaceAll and verify all positions", () => {
			const tree = new SegmentTree();
			const ids = Array.from({ length: 10000 }, (_, i) => i * 2);
			tree.replaceAll(ids);

			expect(tree.length).toBe(10000);

			// Verify random positions
			expect(tree.getAt(0)).toBe(0);
			expect(tree.getAt(9999)).toBe(19998);
			expect(tree.getAt(5000)).toBe(10000);

			// Verify range
			const range = tree.getRange(0, 9);
			expect(range).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
		});
	});
});
