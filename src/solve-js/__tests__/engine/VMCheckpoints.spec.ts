import { describe, expect, test, beforeEach } from "@jest/globals";
import { createVM } from "@solve-js/vm/VM";
import { VMCheckpointer, VMCheckpoint } from "@solve-js/vm/VMCheckpoints";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { numberValue, stringValue, Value } from "@solve-js/vm/Value";

// Helpers

function createTestVM() {
	return createVM(sharedOpRegistry);
}

function setVar(vm: ReturnType<typeof createTestVM>, name: string, val: Value) {
	vm.setVar(name, val);
}

function getVar(vm: ReturnType<typeof createTestVM>, name: string): Value | undefined {
	return vm.getVar(name);
}

// ── Core snapshot / restore ─────────────────────────────────────────────

describe("VMCheckpointer - snapshot and restore", () => {
	let vm: ReturnType<typeof createTestVM>;
	let cp: VMCheckpointer;

	beforeEach(() => {
		vm = createTestVM();
		cp = new VMCheckpointer(vm);
	});

	test("snapshot returns null for empty variableNames", () => {
		const result = cp.snapshot(1, 100, []);
		expect(result).toBeNull();
		expect(cp.count).toBe(0);
	});

	test("snapshot records a single variable from the VM", () => {
		vm.setVar("x", numberValue(42));
		const result = cp.snapshot(5, 500, ["x"]);
		expect(result).not.toBeNull();
		expect(result!.lineNumber).toBe(5);
		expect(result!.lineId).toBe(500);
		expect(result!.variables.x.toNumber()).toBe(42);
		expect(result!.parent).toBeNull();
		expect(cp.count).toBe(1);
	});

	test("snapshot records multiple variables at once", () => {
		vm.setVar("a", numberValue(1));
		vm.setVar("b", numberValue(2));
		vm.setVar("c", stringValue("hello"));

		cp.snapshot(3, 300, ["a", "b", "c"]);
		expect(cp.count).toBe(1);

		const ckpt = cp.getCheckpointAt(3);
		expect(ckpt).toBeDefined();
		expect(ckpt!.variables.a.toNumber()).toBe(1);
		expect(ckpt!.variables.b.toNumber()).toBe(2);
		expect(ckpt!.variables.c.value).toBe("hello");
	});

	test("snapshot skips variables not found in VM", () => {
		vm.setVar("x", numberValue(10));
		cp.snapshot(1, 101, ["x", "nonexistent"]);

		const ckpt = cp.getCheckpointAt(1);
		expect(ckpt!.variables.x.toNumber()).toBe(10);
		expect("nonexistent" in ckpt!.variables).toBe(false);
	});

	test("restoreTo with no checkpoints resets the VM", () => {
		vm.setVar("x", numberValue(99));
		vm.push(numberValue(1));

		cp.restoreTo(5);
		expect(vm.getStack().length).toBe(0);
		expect(vm.getVar("x")).toBeUndefined();
	});

	test("restoreTo replays all checkpoints up to target line", () => {
		vm.setVar("x", numberValue(10));
		cp.snapshot(2, 200, ["x"]);

		vm.setVar("y", numberValue(20));
		cp.snapshot(4, 400, ["y"]);

		vm.setVar("x", numberValue(99)); // overwrite in VM
		// x=99 in VM, but checkpoint at line 2 has x=10, line 4 has y=20

		cp.restoreTo(4);
		// Should have x=10 (from cp 2) and y=20 (from cp 4)
		expect(vm.getVar("x")?.toNumber()).toBe(10);
		expect(vm.getVar("y")?.toNumber()).toBe(20);
	});

	test("restoreTo at line between checkpoints uses nearest previous", () => {
		vm.setVar("a", numberValue(1));
		cp.snapshot(3, 300, ["a"]);

		vm.setVar("b", numberValue(2));
		cp.snapshot(7, 700, ["b"]);

		// Restore to line 5 — should have a from cp 3, but NOT b from cp 7
		cp.restoreTo(5);
		expect(vm.getVar("a")?.toNumber()).toBe(1);
		expect(vm.getVar("b")).toBeUndefined();
	});

	test("restoreTo at line before any checkpoint clears VM", () => {
		vm.setVar("a", numberValue(1));
		cp.snapshot(5, 500, ["a"]);

		cp.restoreTo(2);
		expect(vm.getVar("a")).toBeUndefined();
	});

	test("restoreTo clears the stack", () => {
		vm.setVar("x", numberValue(1));
		cp.snapshot(1, 101, ["x"]);
		vm.push(numberValue(42));
		vm.push(numberValue(99));

		cp.restoreTo(1);
		expect(vm.getStack().length).toBe(0);
		expect(vm.getVar("x")?.toNumber()).toBe(1);
	});
});

// ── Prototypal inheritance ──────────────────────────────────────────────

describe("VMCheckpointer - prototypal inheritance chain", () => {
	let vm: ReturnType<typeof createTestVM>;
	let cp: VMCheckpointer;

	beforeEach(() => {
		vm = createTestVM();
		cp = new VMCheckpointer(vm);
	});

	test("checkpoints form a parent chain", () => {
		vm.setVar("x", numberValue(1));
		const cp1 = cp.snapshot(1, 101, ["x"])!;

		vm.setVar("y", numberValue(2));
		const cp2 = cp.snapshot(3, 103, ["y"])!;

		vm.setVar("z", numberValue(3));
		const cp3 = cp.snapshot(5, 105, ["z"])!;

		expect(cp1.parent).toBeNull();
		expect(cp2.parent).toBe(cp1);
		expect(cp3.parent).toBe(cp2);
	});

	test("inherited variables are accessible through prototype chain", () => {
		vm.setVar("base", numberValue(100));
		cp.snapshot(1, 101, ["base"]);

		vm.setVar("mid", numberValue(200));
		cp.snapshot(3, 103, ["mid"]);

		// lookupVariable walks the prototype chain
		expect(cp.lookupVariable("base")?.toNumber()).toBe(100);
		expect(cp.lookupVariable("mid")?.toNumber()).toBe(200);
		expect(cp.lookupVariable("nonexistent")).toBeUndefined();
	});

	test("shadowing: later checkpoints override inherited values", () => {
		vm.setVar("x", numberValue(1));
		cp.snapshot(1, 101, ["x"]);

		vm.setVar("x", numberValue(999));
		cp.snapshot(5, 105, ["x"]);

		// lookupVariable should find the latest (own) value, not inherited
		expect(cp.lookupVariable("x")?.toNumber()).toBe(999);

		// After restoreTo(5), VM should have x=999
		cp.restoreTo(5);
		expect(vm.getVar("x")?.toNumber()).toBe(999);

		// After restoreTo(1), VM should have x=1
		cp.restoreTo(1);
		expect(vm.getVar("x")?.toNumber()).toBe(1);
	});

	test("Object.keys on checkpoint returns only own variables", () => {
		vm.setVar("a", numberValue(1));
		cp.snapshot(1, 101, ["a"]);

		vm.setVar("b", numberValue(2));
		cp.snapshot(3, 103, ["b"]);

		vm.setVar("c", numberValue(3));
		cp.snapshot(5, 105, ["c"]);

		const lastCheckpoint = cp.getAllCheckpoints()[2];
		const ownKeys = Object.keys(lastCheckpoint.variables);
		expect(ownKeys).toEqual(["c"]); // only "c" is own, "a" and "b" are inherited
	});

	test("restoreTo only sets own variables, not inherited", () => {
		// This test verifies that restoreTo uses Object.keys() which only
		// returns own properties, so inherited variables are not double-set.
		vm.setVar("a", numberValue(1));
		cp.snapshot(1, 101, ["a"]);

		vm.setVar("b", numberValue(2));
		cp.snapshot(3, 103, ["b"]);

		// Restore to checkpoint 3. The chain is: cp1 {a}, cp2 {b}.
		// restoreTo should set a from cp1 and b from cp2.
		cp.restoreTo(3);
		expect(vm.getVar("a")?.toNumber()).toBe(1);
		expect(vm.getVar("b")?.toNumber()).toBe(2);
	});
});

// ── Query methods ───────────────────────────────────────────────────────

describe("VMCheckpointer - query methods", () => {
	let vm: ReturnType<typeof createTestVM>;
	let cp: VMCheckpointer;

	beforeEach(() => {
		vm = createTestVM();
		cp = new VMCheckpointer(vm);
	});

	test("getNearestCheckpoint returns null with no checkpoints", () => {
		expect(cp.getNearestCheckpoint(5)).toBeNull();
	});

	test("getNearestCheckpoint finds checkpoint at exact line", () => {
		vm.setVar("x", numberValue(1));
		cp.snapshot(5, 500, ["x"]);
		expect(cp.getNearestCheckpoint(5)?.lineNumber).toBe(5);
	});

	test("getNearestCheckpoint finds nearest before line", () => {
		vm.setVar("a", numberValue(1));
		cp.snapshot(3, 300, ["a"]);
		vm.setVar("b", numberValue(2));
		cp.snapshot(7, 700, ["b"]);

		expect(cp.getNearestCheckpoint(5)?.lineNumber).toBe(3);
		expect(cp.getNearestCheckpoint(8)?.lineNumber).toBe(7);
	});

	test("getNearestCheckpoint returns null for line before all checkpoints", () => {
		vm.setVar("x", numberValue(1));
		cp.snapshot(5, 500, ["x"]);
		expect(cp.getNearestCheckpoint(2)).toBeNull();
	});

	test("getCheckpointAt returns undefined for missing line", () => {
		expect(cp.getCheckpointAt(99)).toBeUndefined();
	});

	test("getAllCheckpoints returns in order", () => {
		vm.setVar("a", numberValue(1));
		cp.snapshot(1, 101, ["a"]);
		vm.setVar("b", numberValue(2));
		cp.snapshot(3, 103, ["b"]);
		vm.setVar("c", numberValue(3));
		cp.snapshot(5, 105, ["c"]);

		const all = cp.getAllCheckpoints();
		expect(all.length).toBe(3);
		expect(all[0].lineNumber).toBe(1);
		expect(all[1].lineNumber).toBe(3);
		expect(all[2].lineNumber).toBe(5);
	});

	test("count tracks number of snapshots", () => {
		expect(cp.count).toBe(0);
		vm.setVar("x", numberValue(1));
		cp.snapshot(1, 101, ["x"]);
		expect(cp.count).toBe(1);
		vm.setVar("y", numberValue(2));
		cp.snapshot(3, 103, ["y"]);
		expect(cp.count).toBe(2);
	});

	test("isEmpty reflects whether checkpoints exist", () => {
		expect(cp.isEmpty).toBe(true);
		vm.setVar("x", numberValue(1));
		cp.snapshot(1, 101, ["x"]);
		expect(cp.isEmpty).toBe(false);
	});
});

// ── Lifecycle ───────────────────────────────────────────────────────────

describe("VMCheckpointer - lifecycle", () => {
	let vm: ReturnType<typeof createTestVM>;
	let cp: VMCheckpointer;

	beforeEach(() => {
		vm = createTestVM();
		cp = new VMCheckpointer(vm);
	});

	test("clear removes all checkpoints", () => {
		vm.setVar("x", numberValue(1));
		cp.snapshot(1, 101, ["x"]);
		vm.setVar("y", numberValue(2));
		cp.snapshot(3, 103, ["y"]);
		expect(cp.count).toBe(2);

		cp.clear();
		expect(cp.count).toBe(0);
		expect(cp.isEmpty).toBe(true);
	});

	test("clear does not reset VM", () => {
		vm.setVar("x", numberValue(42));
		cp.snapshot(1, 101, ["x"]);
		cp.clear();
		expect(vm.getVar("x")?.toNumber()).toBe(42); // VM still has x
	});

	test("vmInstance getter returns the associated VM", () => {
		expect(cp.vmInstance).toBe(vm);
	});
});

// ── Edge cases ──────────────────────────────────────────────────────────

describe("VMCheckpointer - edge cases", () => {
	let vm: ReturnType<typeof createTestVM>;
	let cp: VMCheckpointer;

	beforeEach(() => {
		vm = createTestVM();
		cp = new VMCheckpointer(vm);
	});

	test("many checkpoints with repeated variable updates work correctly", () => {
		// Simulate a counter variable being updated on multiple lines
		vm.setVar("counter", numberValue(0));
		cp.snapshot(1, 101, ["counter"]);

		vm.setVar("counter", numberValue(1));
		cp.snapshot(3, 103, ["counter"]);

		vm.setVar("counter", numberValue(2));
		cp.snapshot(5, 105, ["counter"]);

		vm.setVar("counter", numberValue(3));
		cp.snapshot(7, 107, ["counter"]);

		expect(cp.count).toBe(4);
		expect(cp.lookupVariable("counter")?.toNumber()).toBe(3);

		cp.restoreTo(5);
		expect(vm.getVar("counter")?.toNumber()).toBe(2);

		cp.restoreTo(3);
		expect(vm.getVar("counter")?.toNumber()).toBe(1);

		cp.restoreTo(1);
		expect(vm.getVar("counter")?.toNumber()).toBe(0);
	});

	test("restoreTo with multiple variables across checkpoints maintains all", () => {
		vm.setVar("a", numberValue(10));
		vm.setVar("b", numberValue(20));
		cp.snapshot(1, 101, ["a", "b"]);

		vm.setVar("c", numberValue(30));
		cp.snapshot(3, 103, ["c"]);

		vm.setVar("b", numberValue(999)); // overwrite b
		cp.snapshot(5, 105, ["b"]);

		cp.restoreTo(5);
		expect(vm.getVar("a")?.toNumber()).toBe(10);
		expect(vm.getVar("b")?.toNumber()).toBe(999);
		expect(vm.getVar("c")?.toNumber()).toBe(30);

		cp.restoreTo(3);
		expect(vm.getVar("a")?.toNumber()).toBe(10);
		expect(vm.getVar("b")?.toNumber()).toBe(20);
		expect(vm.getVar("c")?.toNumber()).toBe(30);
	});

	test("restoreTo does not leak variables from checkpoints after target", () => {
		vm.setVar("early", numberValue(1));
		cp.snapshot(2, 200, ["early"]);

		vm.setVar("late", numberValue(2));
		cp.snapshot(10, 1000, ["late"]);

		cp.restoreTo(5);
		expect(vm.getVar("early")?.toNumber()).toBe(1);
		expect(vm.getVar("late")).toBeUndefined();
	});

	test("lookupVariable on empty checkpointer returns undefined", () => {
		expect(cp.lookupVariable("x")).toBeUndefined();
	});

	test("restoreTo clears old VM values not in checkpoints", () => {
		// Set a variable in VM without checkpointing it, then restore
		vm.setVar("x", numberValue(1));
		cp.snapshot(1, 101, ["x"]);

		vm.setVar("transient", numberValue(999)); // never checkpointed
		cp.restoreTo(1);

		expect(vm.getVar("x")?.toNumber()).toBe(1);
		expect(vm.getVar("transient")).toBeUndefined(); // cleared by reset
	});
});
