/**
 * Package Unregistration — Shared-Registry Cleanup
 *
 * registerPackage() writes opcode handlers into sharedOpRegistry and
 * variable sources into sharedVariableResolver — process-wide state.
 * These tests verify unregisterPackage() reverses exactly those
 * contributions (plan Task 2).
 */

import { describe, expect, test, afterEach } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { sharedVariableResolver } from "@solve-js/variables/VariableResolver";
import { getTokenCategory } from "@solve-js/language/TokenCategoryMap";
import { OSRS_PACKAGE } from "@solve-js/packages/osrs/OsrsPackage";
import type { ISolvePackage } from "@solve-js/api/SolveAPI";
import type { IVariableSource } from "@solve-js/variables/IVariableSource";

/** Opcode in the dynamic range (>= 200) that no builtin package uses. */
const TEST_OPCODE = 253;

function makeVariableSource(values: Record<string, number>): IVariableSource {
	const store: Record<string, number | string> = { ...values };
	return {
		name: "test-unregistration-source",
		priority: 10,
		async get(name: string) {
			return store[name];
		},
		async set(name: string, value: number | string) {
			store[name] = value;
		},
	};
}

function makeTestPackage(source: IVariableSource): ISolvePackage {
	return {
		name: "test-unregistration-pkg",
		opcodeHandlers: [
			{
				opcode: TEST_OPCODE,
				handler: (_vm, _opcodes, ip) => ip + 1,
				pluginName: "test-unregistration-pkg",
			},
		],
		variableSources: [source],
	};
}

describe("ExpressionEngine.unregisterPackage — shared registry cleanup", () => {
	afterEach(() => {
		// Safety net: never leak the test opcode into other suites.
		sharedOpRegistry.unregister(TEST_OPCODE);
	});

	test("opcode handler is removed from sharedOpRegistry", () => {
		const engine = new ExpressionEngine("en");
		const pkg = makeTestPackage(makeVariableSource({}));

		engine.registerPackage(pkg);
		expect(sharedOpRegistry.has(TEST_OPCODE)).toBe(true);

		expect(engine.unregisterPackage(pkg.name)).toBe(true);
		expect(sharedOpRegistry.has(TEST_OPCODE)).toBe(false);
	});

	test("variable source no longer resolves after unregistration", async () => {
		const engine = new ExpressionEngine("en");
		const source = makeVariableSource({ unregTestVar: 42 });
		const pkg = makeTestPackage(source);

		engine.registerPackage(pkg);
		expect(await sharedVariableResolver.resolve("unregTestVar")).toBe(42);

		engine.unregisterPackage(pkg.name);
		expect(await sharedVariableResolver.resolve("unregTestVar")).toBeUndefined();
	});

	test("unregistering an unknown package returns false and changes nothing", () => {
		const engine = new ExpressionEngine("en");
		expect(engine.unregisterPackage("never-registered")).toBe(false);
	});

	test("re-registering after unregistration works cleanly", () => {
		const engine = new ExpressionEngine("en");
		const pkg = makeTestPackage(makeVariableSource({}));

		engine.registerPackage(pkg);
		engine.unregisterPackage(pkg.name);
		engine.registerPackage(pkg);

		expect(sharedOpRegistry.has(TEST_OPCODE)).toBe(true);
		expect(engine.unregisterPackage(pkg.name)).toBe(true);
		expect(sharedOpRegistry.has(TEST_OPCODE)).toBe(false);
	});

	test("unregistration clears the bytecode cache", () => {
		const engine = new ExpressionEngine("en");
		const pkg = makeTestPackage(makeVariableSource({}));
		engine.registerPackage(pkg);

		engine.evaluateExpression("2 + 2");
		expect(engine.getBytecodeCache().size).toBeGreaterThan(0);

		engine.unregisterPackage(pkg.name);
		expect(engine.getBytecodeCache().size).toBe(0);
	});
});

describe("ExpressionEngine.unregisterPackage — token highlight category cleanup", () => {
	/** Token type in a range no builtin package uses. */
	const TEST_TOKEN_TYPE = "TEST_UNREGISTRATION_TOKEN";

	function makeHighlightPackage(): ISolvePackage {
		return {
			name: "test-highlight-unregistration-pkg",
			tokenCategories: { [TEST_TOKEN_TYPE]: "keyword" },
		};
	}

	afterEach(() => {
		// Safety net: never leak the test category into other suites.
		const engine = new ExpressionEngine("en");
		engine.unregisterPackage("test-highlight-unregistration-pkg");
	});

	test("registerPackage makes the category resolvable via getTokenCategory", () => {
		const engine = new ExpressionEngine("en");
		expect(getTokenCategory(TEST_TOKEN_TYPE)).toBeUndefined();

		engine.registerPackage(makeHighlightPackage());
		expect(getTokenCategory(TEST_TOKEN_TYPE)).toBe("keyword");
	});

	test("unregisterPackage removes the category again", () => {
		const engine = new ExpressionEngine("en");
		engine.registerPackage(makeHighlightPackage());
		expect(getTokenCategory(TEST_TOKEN_TYPE)).toBe("keyword");

		expect(engine.unregisterPackage("test-highlight-unregistration-pkg")).toBe(true);
		expect(getTokenCategory(TEST_TOKEN_TYPE)).toBeUndefined();
	});

	test("re-registering after unregistration works cleanly", () => {
		const engine = new ExpressionEngine("en");
		const pkg = makeHighlightPackage();

		engine.registerPackage(pkg);
		engine.unregisterPackage(pkg.name);
		engine.registerPackage(pkg);

		expect(getTokenCategory(TEST_TOKEN_TYPE)).toBe("keyword");
		expect(engine.unregisterPackage(pkg.name)).toBe(true);
		expect(getTokenCategory(TEST_TOKEN_TYPE)).toBeUndefined();
	});
});

describe("ExpressionEngine.unregisterPackage — lexer plugin cleanup (OSRS)", () => {
	test("OSRS-contributed keyword/item categories are registered while active, gone after unregister", () => {
		// OSRS is a builtin-adjacent but opt-in package (not in
		// BUILTIN_PACKAGES) — register it explicitly rather than assuming
		// default construction includes it.
		const engine = new ExpressionEngine("en", false, undefined, undefined, []);
		engine.registerPackage(OSRS_PACKAGE);

		expect(getTokenCategory("OSRS_KEYWORD")).toBe("keyword");
		expect(getTokenCategory("GAME_ITEM")).toBe("osrs-item");

		engine.unregisterPackage(OSRS_PACKAGE.name);
		expect(getTokenCategory("OSRS_KEYWORD")).toBeUndefined();
		expect(getTokenCategory("GAME_ITEM")).toBeUndefined();
	});
});

describe("ExpressionEngine.unregisterPackage — completionItems cleanup", () => {
	function makeCompletionPackage(): ISolvePackage {
		return {
			name: "test-completion-unregistration-pkg",
			completionItems: [{ label: "TestCandidate", category: "keyword" }],
		};
	}

	test("registerPackage makes the item queryable via getPackageCompletionItems, gone after unregister", () => {
		const engine = new ExpressionEngine("en", false, undefined, undefined, []);
		expect(engine.getPackageCompletionItems()).toEqual([]);

		engine.registerPackage(makeCompletionPackage());
		expect(engine.getPackageCompletionItems()).toEqual([{ label: "TestCandidate", category: "keyword" }]);

		expect(engine.unregisterPackage("test-completion-unregistration-pkg")).toBe(true);
		expect(engine.getPackageCompletionItems()).toEqual([]);
	});

	test("OSRS's real completionItems (item names) are queryable while active, gone after unregister", () => {
		const engine = new ExpressionEngine("en", false, undefined, undefined, []);
		engine.registerPackage(OSRS_PACKAGE);
		expect(engine.getPackageCompletionItems().some(i => i.label === "Iron Axe" && i.category === "osrs-item")).toBe(true);

		engine.unregisterPackage(OSRS_PACKAGE.name);
		expect(engine.getPackageCompletionItems()).toEqual([]);
	});
});
