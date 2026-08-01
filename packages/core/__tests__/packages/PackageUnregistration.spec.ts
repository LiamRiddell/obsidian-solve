/**
 * Package Unregistration — Shared-Registry Cleanup
 *
 * registerPackage() writes variable sources into sharedVariableResolver —
 * process-wide state. These tests verify unregisterPackage() reverses
 * exactly those contributions (plan Task 2).
 */

import { describe, expect, test, jest } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { sharedVariableResolver } from "@solve-js/variables/VariableResolver";
import { getTokenCategory } from "@solve-js/language/TokenCategoryMap";
import { OSRS_PACKAGE } from "@solve-js-examples/osrs/OsrsPackage";
import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import type { IVariableSource } from "@solve-js/variables/IVariableSource";

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

function makeTestPackage(source: IVariableSource): IEnginePackage {
	return {
		name: "test-unregistration-pkg",
		variableSources: [source],
	};
}

describe("ExpressionEngine.unregisterPackage — shared registry cleanup", () => {
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

	test("re-registering after unregistration works cleanly", async () => {
		const engine = new ExpressionEngine("en");
		const source = makeVariableSource({ unregTestVar: 7 });
		const pkg = makeTestPackage(source);

		engine.registerPackage(pkg);
		engine.unregisterPackage(pkg.name);
		engine.registerPackage(pkg);

		expect(await sharedVariableResolver.resolve("unregTestVar")).toBe(7);
		expect(engine.unregisterPackage(pkg.name)).toBe(true);
		expect(await sharedVariableResolver.resolve("unregTestVar")).toBeUndefined();
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

describe("ExpressionEngine.registerPackage — duplicate-name guard", () => {
	// Regression: registerPackage() used to have no guard against being
	// called twice with the same pkg.name — the second call's contribution
	// record silently overwrote the first's in packageContributions, so the
	// FIRST registration's shared-registry entries (variable sources,
	// plugin-function indices, resolver namespaces, token categories) became
	// permanently orphaned: unregisterPackage() could then only reverse the
	// second registration, and the first's contributions were unreachable
	// for the rest of the process's lifetime.
	test("re-registering the same package name unregisters the previous registration first (no orphaned variable source)", async () => {
		const engine = new ExpressionEngine("en");
		const firstSource = makeVariableSource({ dupTestVar: 1 });
		const secondSource = makeVariableSource({ dupTestVar: 2 });

		engine.registerPackage({ name: "dup-test-pkg", variableSources: [firstSource] });
		expect(await sharedVariableResolver.resolve("dupTestVar")).toBe(1);

		// Same name, different source — used to silently orphan firstSource
		// instead of cleanly replacing it.
		engine.registerPackage({ name: "dup-test-pkg", variableSources: [secondSource] });
		expect(await sharedVariableResolver.resolve("dupTestVar")).toBe(2);

		// Unregistering once must fully clean up — if the first registration
		// had been orphaned, a stale source would still resolve here.
		expect(engine.unregisterPackage("dup-test-pkg")).toBe(true);
		expect(await sharedVariableResolver.resolve("dupTestVar")).toBeUndefined();
	});

	test("warns on the console when re-registering the same package name", () => {
		const engine = new ExpressionEngine("en");
		const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

		engine.registerPackage({ name: "dup-warn-pkg" });
		expect(warnSpy).not.toHaveBeenCalled();

		engine.registerPackage({ name: "dup-warn-pkg" });
		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("dup-warn-pkg"));

		warnSpy.mockRestore();
		engine.unregisterPackage("dup-warn-pkg");
	});
});

describe("ExpressionEngine.unregisterPackage — token highlight category cleanup", () => {
	/** Token type in a range no builtin package uses. */
	const TEST_TOKEN_TYPE = "TEST_UNREGISTRATION_TOKEN";

	function makeHighlightPackage(): IEnginePackage {
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
	function makeCompletionPackage(): IEnginePackage {
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
