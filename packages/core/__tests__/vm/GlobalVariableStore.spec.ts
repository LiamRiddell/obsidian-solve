import { describe, expect, test, beforeEach } from "@jest/globals";
import { GlobalVariableStore, globalDagKey } from "@solve-js/vm/GlobalVariableStore";
import { numberValue } from "@solve-js/vm/Value";

describe("GlobalVariableStore", () => {
	let store: GlobalVariableStore;

	beforeEach(() => {
		store = new GlobalVariableStore();
	});

	test("get() returns undefined for a name that was never set", () => {
		expect(store.get("x")).toBeUndefined();
		expect(store.has("x")).toBe(false);
	});

	test("set() then get() returns the stored value", () => {
		store.set("x", numberValue(42));
		expect(store.get("x")!.toNumber()).toBe(42);
		expect(store.has("x")).toBe(true);
	});

	test("last-write-wins: a second set() on the same name overwrites the first", () => {
		store.set("x", numberValue(1));
		store.set("x", numberValue(2));
		store.set("x", numberValue(3));
		expect(store.get("x")!.toNumber()).toBe(3);
	});

	test("different names don't collide", () => {
		store.set("x", numberValue(1));
		store.set("y", numberValue(2));
		expect(store.get("x")!.toNumber()).toBe(1);
		expect(store.get("y")!.toNumber()).toBe(2);
	});

	describe("subscribe / notify", () => {
		test("a subscribed listener is called with the name and value on set()", () => {
			const calls: Array<[string, number]> = [];
			store.subscribe((name, value) => calls.push([name, value.toNumber()]));

			store.set("x", numberValue(5));

			expect(calls).toEqual([["x", 5]]);
		});

		test("multiple listeners all fire", () => {
			let count = 0;
			store.subscribe(() => count++);
			store.subscribe(() => count++);
			store.subscribe(() => count++);

			store.set("x", numberValue(1));

			expect(count).toBe(3);
		});

		test("a listener fires for every set() call, including repeated writes to the same name", () => {
			const calls: number[] = [];
			store.subscribe((_name, value) => calls.push(value.toNumber()));

			store.set("x", numberValue(1));
			store.set("x", numberValue(2));

			expect(calls).toEqual([1, 2]);
		});

		test("unsubscribing (calling the returned function) stops further notifications", () => {
			const calls: number[] = [];
			const unsubscribe = store.subscribe((_name, value) => calls.push(value.toNumber()));

			store.set("x", numberValue(1));
			unsubscribe();
			store.set("x", numberValue(2));

			expect(calls).toEqual([1]);
		});

		test("unsubscribing one listener doesn't affect others", () => {
			const callsA: number[] = [];
			const callsB: number[] = [];
			const unsubA = store.subscribe((_n, v) => callsA.push(v.toNumber()));
			store.subscribe((_n, v) => callsB.push(v.toNumber()));

			unsubA();
			store.set("x", numberValue(1));

			expect(callsA).toEqual([]);
			expect(callsB).toEqual([1]);
		});

		test("calling the unsubscribe function twice is a safe no-op the second time", () => {
			const unsubscribe = store.subscribe(() => {});
			unsubscribe();
			expect(() => unsubscribe()).not.toThrow();
		});

		test("notify only fires for the name that changed — listener still receives the name to filter on", () => {
			const seenNames: string[] = [];
			store.subscribe((name) => seenNames.push(name));

			store.set("x", numberValue(1));
			store.set("y", numberValue(2));

			expect(seenNames).toEqual(["x", "y"]);
		});
	});

	describe("reentrancy / cycle guard", () => {
		test("a listener that writes back to the SAME store doesn't recurse forever, and the store ends in a well-defined state", () => {
			let depth = 0;
			let maxDepthSeen = 0;
			store.subscribe((name, value) => {
				depth++;
				maxDepthSeen = Math.max(maxDepthSeen, depth);
				// Deliberately re-trigger notification by writing a DIFFERENT
				// name each time, simulating an unbounded chain rather than
				// an exact infinite loop on one name.
				if (depth < 1000) {
					store.set(`${name}-chain`, numberValue(value.toNumber() + 1));
				}
				depth--;
			});

			expect(() => store.set("g0", numberValue(0))).not.toThrow();
			// Propagation must have been cut off well short of 1000 — proves
			// the depth guard actually bounded the recursion.
			expect(maxDepthSeen).toBeLessThan(100);
			// The store itself is still queryable and holds sane values —
			// not corrupted by the guard kicking in mid-chain.
			expect(store.get("g0")!.toNumber()).toBe(0);
		});

		test("a mutual A<->B write cycle terminates without a stack overflow", () => {
			store.subscribe((name, value) => {
				if (name === "a") store.set("b", numberValue(value.toNumber() + 1));
				else if (name === "b") store.set("a", numberValue(value.toNumber() + 1));
			});

			expect(() => store.set("a", numberValue(0))).not.toThrow();
			// Both names end up with SOME well-defined numeric value, not
			// undefined/corrupted.
			expect(store.get("a")).toBeDefined();
			expect(store.get("b")).toBeDefined();
			expect(typeof store.get("a")!.toNumber()).toBe("number");
			expect(typeof store.get("b")!.toNumber()).toBe("number");
		});
	});

	describe("clear()", () => {
		test("removes all stored values", () => {
			store.set("x", numberValue(1));
			store.set("y", numberValue(2));
			store.clear();
			expect(store.get("x")).toBeUndefined();
			expect(store.get("y")).toBeUndefined();
			expect(store.has("x")).toBe(false);
		});

		test("removes all listeners", () => {
			let calls = 0;
			store.subscribe(() => calls++);
			store.clear();
			store.set("x", numberValue(1));
			expect(calls).toBe(0);
		});

		test("a store is fully reusable after clear() — set/get/subscribe all work normally again", () => {
			store.set("x", numberValue(1));
			store.clear();

			const calls: number[] = [];
			store.subscribe((_n, v) => calls.push(v.toNumber()));
			store.set("y", numberValue(9));

			expect(store.get("y")!.toNumber()).toBe(9);
			expect(calls).toEqual([9]);
		});
	});
});

describe("globalDagKey", () => {
	test("prefixes the name with 'global:'", () => {
		expect(globalDagKey("hello")).toBe("global:hello");
	});

	test("distinct names produce distinct keys", () => {
		expect(globalDagKey("x")).not.toBe(globalDagKey("y"));
	});

	test("the prefixed key never collides with a plausible plain local variable name", () => {
		// ':' isn't a valid character inside a lexed IDENT, so no local
		// variable name can ever equal a globalDagKey() output.
		const key = globalDagKey("price");
		expect(key).toBe("global:price");
		expect(key).not.toBe("price");
	});
});
