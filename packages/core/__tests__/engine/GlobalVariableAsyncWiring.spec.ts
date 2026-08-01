import { describe, expect, test, afterEach } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { ValueType } from "@solve-js/vm/Value";
import { sharedGlobalVariableStore } from "@solve-js/vm/GlobalVariableStore";
import type { AsyncResolutionEvent } from "@solve-js/engine/AsyncResolutionBatcher";

/**
 * End-to-end proof that GlobalVariableAsyncResolver is correctly wired into
 * the REAL ExpressionEngine's async pipeline — not just the resolver in
 * isolation (see GlobalVariableAsyncResolver.spec.ts) or the cross-document
 * DAG/dirty-marking scenarios via ThreeTierEvaluator (see
 * GlobalVariablesAcrossDocuments.spec.ts). This is the minimal single-engine
 * sanity check that the plumbing itself is connected.
 */
describe("GlobalVariableAsyncResolver — wired into the real ExpressionEngine", () => {
	afterEach(() => {
		sharedGlobalVariableStore.clear();
	});

	test("reading an undeclared global returns a Pending value, not a throw", () => {
		const engine = new ExpressionEngine("en", false);
		const result = engine.evaluateLine(1, "global :undeclaredThing");
		expect(result[0].type).toBe(ValueType.Pending);
		engine.clear();
	});

	test("the pending value's queryKey identifies the missing global by name", () => {
		const engine = new ExpressionEngine("en", false);
		const result = engine.evaluateLine(1, "global :widgetPrice");
		expect(result[0].type).toBe(ValueType.Pending);
		expect(result[0].value).toBe("global:widgetPrice");
		engine.clear();
	});

	test("once declared, a fresh evaluation of the same expression succeeds synchronously (no longer pending)", () => {
		const engine = new ExpressionEngine("en", false);
		const pending = engine.evaluateLine(1, "global :widgetPrice + 1");
		expect(pending[0].type).toBe(ValueType.Pending);

		// Declare it — standing in for "a different document" via a second,
		// independent engine writing the same process-wide global.
		const otherDocEngine = new ExpressionEngine("en", false);
		otherDocEngine.evaluateLine(1, "global :widgetPrice = 99");
		otherDocEngine.clear();

		const resolved = engine.evaluateLine(2, "global :widgetPrice + 1");
		expect(resolved[0].type).not.toBe(ValueType.Pending);
		expect(resolved[0].toNumber()).toBe(100);
		engine.clear();
	});

	test("the engine's async event stream fires when a pending global resolves in the background", async () => {
		const engine = new ExpressionEngine("en", true);
		const events: AsyncResolutionEvent[] = [];
		const reader = engine.getEventStream().getReader();
		const readLoop = (async () => {
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					events.push(value);
				}
			} catch {
				/* stream closed on engine.clear() — expected */
			}
		})();

		engine.evaluateLine(1, "global :streamedGlobal");

		const otherDocEngine = new ExpressionEngine("en", false);
		otherDocEngine.evaluateLine(1, "global :streamedGlobal = 7");
		otherDocEngine.clear();

		// resolveAsync() awaits the resolver promise and the batcher flushes
		// on a microtask — give the pipeline a couple of ticks.
		await new Promise((r) => setTimeout(r, 0));
		await new Promise((r) => setTimeout(r, 0));

		expect(events.some((e) => e.type === "lines-updated" || e.type === "error")).toBe(true);

		engine.clear();
		await readLoop.catch(() => {});
	});
});
