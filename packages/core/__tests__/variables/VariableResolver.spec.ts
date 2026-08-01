/**
 * VariableResolver — Unit Tests
 *
 * Tests the variable resolution system:
 * - Multi-source variable lookup with priority ordering
 * - Source registration and fallback to undefined for unknown variables
 * - Cache invalidation
 */

import { describe, expect, test } from "@jest/globals";
import { VariableResolver } from "@solve-js/variables/VariableResolver";
import { IVariableSource } from "@solve-js/variables/IVariableSource";

class MockSource implements IVariableSource {
	name = "mock";
	priority = 10;
	private values: Map<string, number | string> = new Map();

	constructor(values: Record<string, number | string>) {
		for (const [k, v] of Object.entries(values)) {
			this.values.set(k, v);
		}
	}

	async get(name: string): Promise<number | string | undefined> {
		return this.values.get(name);
	}

	async set(name: string, value: number | string): Promise<void> {
		this.values.set(name, value);
	}
}

describe("VariableResolver", () => {
	test("resolves a variable from a source", async () => {
		const resolver = new VariableResolver();
		resolver.registerSource(new MockSource({ x: 42 }));
		const value = await resolver.resolve("x");
		expect(value).toBe(42);
	});

	test("returns undefined for unknown variable", async () => {
		const resolver = new VariableResolver();
		resolver.registerSource(new MockSource({}));
		const value = await resolver.resolve("unknown");
		expect(value).toBeUndefined();
	});

	test("sources are ordered by priority", async () => {
		const resolver = new VariableResolver();
		resolver.registerSource(new MockSource({ x: 1 }));
		resolver.registerSource(new MockSource({ x: 2 }));
		const value = await resolver.resolve("x");
		expect(value).toBe(1); // First registered source has priority
	});

	test("invalidate clears cache", async () => {
		const source = new MockSource({ x: 42 });
		const resolver = new VariableResolver();
		resolver.registerSource(source);
		await resolver.resolve("x");
		resolver.invalidate("x");
		// Should re-fetch (cache was cleared)
		const value = await resolver.resolve("x");
		expect(value).toBe(42);
	});
});
