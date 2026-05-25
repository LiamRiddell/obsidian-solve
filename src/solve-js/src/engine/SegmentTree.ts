/**
 * SegmentTree — an order-statistic Treap (randomized BST).
 *
 * Replaces the flat `lineOrder: number[]` array in DocumentModel with a
 * balanced tree that supports O(log N) insert, delete, and get-at-index
 * operations. Each node stores a `lineId` and its subtree size, enabling
 * order-statistic queries (find the k-th element by position).
 *
 * Key operations:
 *   getAt(index)      — O(log N) expected
 *   insertAt(index)   — O(log N) expected
 *   deleteAt(index)   — O(log N) expected
 *   spliceAt(index, deleteCount, newIds) — O(log N + deleteCount + insertCount)
 *   indexOf(lineId)   — O(N) without reverse map; cached lazily in DocumentModel
 *
 * Implementation: Treap (Tree + Heap) with implicit keys.
 * Nodes are ordered by position (in-order traversal), not by lineId value.
 * The `size` field enables O(log N) order statistics.
 * Random priorities maintain balance with high probability (O(log N) depth).
 *
 * Memory: ~40 bytes per node (lineId + size + priority + left + right).
 * For 100K lines: ~4MB for tree structure (acceptable).
 */

// ── Types ──────────────────────────────────────────────────────────────────

interface Node {
	lineId: number;
	/** Total number of nodes in this subtree (including self). */
	size: number;
	/** Random priority for heap property (maintains balance). */
	priority: number;
	left: Node | null;
	right: Node | null;
}

// ── SegmentTree ────────────────────────────────────────────────────────────

export class SegmentTree {
	private root: Node | null = null;

	// ── Public API ───────────────────────────────────────────────────────

	/** Total number of elements in the tree. */
	get length(): number {
		return this.root ? this.root.size : 0;
	}

	/** Whether the tree is empty. */
	get isEmpty(): boolean {
		return this.root === null;
	}

	/**
	 * Get the lineId at the given 0-based index.
	 * Returns undefined if index is out of bounds.
	 * O(log N) expected.
	 */
	getAt(index: number): number | undefined {
		if (index < 0 || index >= (this.root?.size ?? 0)) return undefined;
		return this.nodeAt(this.root, index).lineId;
	}

	/**
	 * Insert a single lineId at the given 0-based index.
	 * O(log N) expected.
	 */
	insertAt(index: number, lineId: number): void {
		const [left, right] = split(this.root, index);
		this.root = merge(merge(left, createNode(lineId)), right);
	}

	/**
	 * Delete a single element at the given 0-based index.
	 * Returns the removed lineId, or undefined if out of bounds.
	 * O(log N) expected.
	 */
	deleteAt(index: number): number | undefined {
		if (index < 0 || index >= (this.root?.size ?? 0)) return undefined;

		const [left, midRight] = split(this.root, index);
		const [mid, right] = split(midRight, 1);

		const removed = mid ? mid.lineId : undefined;
		this.root = merge(left, right);
		return removed;
	}

	/**
	 * Bulk splice: delete `deleteCount` elements at `startIndex` (0-based),
	 * then insert `newIds` in their place.
	 *
	 * Returns the removed lineId array.
	 * O(log N + deleteCount + insertCount) expected.
	 */
	spliceAt(
		startIndex: number,
		deleteCount: number,
		newIds: number[]
	): number[] {
		const clampedStart = Math.max(0, startIndex);
		const clampedCount = Math.min(
			Math.max(0, deleteCount),
			(this.root?.size ?? 0) - clampedStart
		);

		// Split into three parts: [0, start) [start, start+count) [start+count, end)
		const [left, midRight] = split(this.root, clampedStart);
		const [mid, right] = split(midRight, clampedCount);

		// Collect removed IDs
		const removed = collectInOrder(mid);

		// Build a treap from the new IDs and merge
		const newTree = buildTreap(newIds, 0, newIds.length);
		this.root = merge(merge(left, newTree), right);

		return removed;
	}

	/**
	 * Replace the entire tree with a new set of lineIds.
	 * O(N) — builds a balanced treap from a flat array.
	 */
	replaceAll(lineIds: number[]): void {
		this.root = buildTreap(lineIds, 0, lineIds.length);
	}

	/**
	 * Get a contiguous range of lineIds by index.
	 * O(rangeSize + log N) — single in-order walk instead of N × O(log N).
	 *
	 * This is the hot path for viewport rendering in DocumentModel.getVisibleLines().
	 */
	getRange(startIndex: number, endIndex: number): number[] {
		const clampedStart = Math.max(0, startIndex);
		const clampedEnd = Math.min((this.root?.size ?? 0) - 1, endIndex);
		if (clampedStart > clampedEnd) return [];

		const result: number[] = [];
		this.collectRange(this.root, clampedStart, clampedEnd, 0, result);
		return result;
	}

	/**
	 * Clear the tree.
	 */
	clear(): void {
		this.root = null;
	}

	// ── Iteration ─────────────────────────────────────────────────────────

	/**
	 * In-order iterator yielding all lineIds.
	 */
	*[Symbol.iterator](): IterableIterator<number> {
		yield* this.inOrder(this.root);
	}

	private *inOrder(node: Node | null): IterableIterator<number> {
		if (!node) return;
		yield* this.inOrder(node.left);
		yield node.lineId;
		yield* this.inOrder(node.right);
	}

	// ── Private helpers ───────────────────────────────────────────────────

	private nodeAt(node: Node | null, index: number): Node {
		// This is only called with valid indices, so node is non-null
		const leftSize = node!.left ? node!.left.size : 0;

		if (index < leftSize) {
			return this.nodeAt(node!.left, index);
		} else if (index === leftSize) {
			return node!;
		} else {
			return this.nodeAt(node!.right, index - leftSize - 1);
		}
	}

	/**
	 * Collect all node values in the range [targetStart, targetEnd] into result.
	 * `offset` is the 0-based start of the current subtree within the full tree.
	 * O(rangeSize + log N) — skips entire subtrees outside the target range.
	 */
	private collectRange(
		node: Node | null,
		targetStart: number,
		targetEnd: number,
		offset: number,
		result: number[]
	): void {
		if (!node) return;

		const leftSize = node.left ? node.left.size : 0;
		const nodeIndex = offset + leftSize;

		// Traverse left subtree if it overlaps the target range
		if (nodeIndex > targetStart && node.left) {
			this.collectRange(node.left, targetStart, targetEnd, offset, result);
		}

		// Include this node if within range
		if (nodeIndex >= targetStart && nodeIndex <= targetEnd) {
			result.push(node.lineId);
		}

		// Traverse right subtree if it overlaps the target range
		if (nodeIndex < targetEnd && node.right) {
			this.collectRange(node.right, targetStart, targetEnd, nodeIndex + 1, result);
		}
	}
}

// ── Free functions ──────────────────────────────────────────────────────────

/** Create a new treap node. */
function createNode(lineId: number): Node {
	return {
		lineId,
		size: 1,
		priority: Math.random(),
		left: null,
		right: null,
	};
}

/** Update a node's size from its children. */
function updateSize(node: Node): void {
	node.size = 1 + (node.left ? node.left.size : 0) + (node.right ? node.right.size : 0);
}

/**
 * Merge two treaps. All keys in `left` must be ≤ all keys in `right`.
 * O(log N) expected.
 */
function merge(left: Node | null, right: Node | null): Node | null {
	if (!left) return right;
	if (!right) return left;

	if (left.priority > right.priority) {
		left.right = merge(left.right, right);
		updateSize(left);
		return left;
	} else {
		right.left = merge(left, right.left);
		updateSize(right);
		return right;
	}
}

/**
 * Split a treap at `index` (0-based).
 * Returns [left, right] where `left` contains the first `index` elements
 * and `right` contains the rest.
 * O(log N) expected.
 */
function split(
	node: Node | null,
	index: number
): [Node | null, Node | null] {
	if (!node) return [null, null];

	const leftSize = node.left ? node.left.size : 0;

	if (index <= leftSize) {
		const [left, right] = split(node.left, index);
		node.left = right;
		updateSize(node);
		return [left, node];
	} else {
		const [left, right] = split(node.right, index - leftSize - 1);
		node.right = left;
		updateSize(node);
		return [node, right];
	}
}

/**
 * Collect all lineIds from a treap in-order.
 * O(N).
 */
function collectInOrder(node: Node | null): number[] {
	const result: number[] = [];
	collect(node, result);
	return result;
}

function collect(node: Node | null, result: number[]): void {
	if (!node) return;
	collect(node.left, result);
	result.push(node.lineId);
	collect(node.right, result);
}

/**
 * Build a balanced treap from a flat array of lineIds.
 * Uses divide-and-conquer with pre-sorted priorities to produce
 * a heap-ordered tree in O(N) time.
 * O(N).
 */
function buildTreap(lineIds: number[], start: number, end: number): Node | null {
	if (start >= end) return null;

	const mid = Math.floor((start + end) / 2);

	// Generate a deterministic-but-random priority based on position
	// This ensures the same array always produces the same tree shape
	const priority = pseudoRandom(mid);

	const node: Node = {
		lineId: lineIds[mid],
		size: end - start,
		priority,
		left: buildTreap(lineIds, start, mid),
		right: buildTreap(lineIds, mid + 1, end),
	};

	return node;
}

/**
 * Simple pseudo-random number generator for deterministic treap building.
 * Uses a multiplicative hash of the input.
 */
function pseudoRandom(seed: number): number {
	let x = seed;
	x = ((x >> 16) ^ x) * 0x45d9f3b;
	x = ((x >> 16) ^ x) * 0x45d9f3b;
	x = (x >> 16) ^ x;
	return x / 0xffffffff; // normalize to [0, 1)
}
