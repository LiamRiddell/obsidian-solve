import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import {
  ARITHMETIC_PACKAGE,
  FUNCTION_PACKAGE,
  DICE_PACKAGE,
  PERCENTAGE_PACKAGE,
  DATETIME_PACKAGE,
  VARIABLES_PACKAGE,
  UOM_PACKAGE,
  VECTOR_PACKAGE,
  BIGINT_PACKAGE,
  BUILTIN_PACKAGES,
} from "@solve-js/packages/builtins";

describe("ExpressionEngine constructor — packages parameter", () => {
  // ── Default behavior (no packages param) ──────────────────────────

  test("default constructor uses all BUILTIN_PACKAGES", () => {
    const engine = new ExpressionEngine();
    // Arithmetic should work
    expect(engine.evaluateLine(1, "1 + 2")[0].toNumber()).toBe(3);
    // Functions should work
    expect(engine.evaluateLine(2, "sqrt(144)")[0].toNumber()).toBe(12);
    // Percentages should work
    const [pct] = engine.evaluateLine(3, "50% of 200");
    expect(pct.toNumber()).toBe(100);
    // Dice should work
    const [dice] = engine.evaluateLine(4, "roll(1, 6)");
    expect(dice.toNumber()).toBeGreaterThanOrEqual(1);
    expect(dice.toNumber()).toBeLessThanOrEqual(6);
    // Variables should work
    engine.evaluateLine(5, ":x = 100");
    expect(engine.evaluateLine(6, ":x + 50")[0].toNumber()).toBe(150);
  });

  test("default constructor is equivalent to BUILTIN_PACKAGES", () => {
    const engineDefault = new ExpressionEngine();
    const engineExplicit = new ExpressionEngine("en", false, undefined, undefined, BUILTIN_PACKAGES);

    expect(engineDefault.evaluateLine(1, "2 + 3")[0].toNumber()).toBe(5);
    expect(engineExplicit.evaluateLine(1, "2 + 3")[0].toNumber()).toBe(5);

    expect(engineDefault.evaluateLine(2, "sqrt(144)")[0].toNumber()).toBe(12);
    expect(engineExplicit.evaluateLine(2, "sqrt(144)")[0].toNumber()).toBe(12);
  });

  // ── Empty packages ────────────────────────────────────────────────

  test("empty packages array creates engine with only Tier 1 inline operations (no parselets)", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, []);
    // Tier 1 inline: NUMBER, PLUS, MINUS etc. work without packages
    expect(engine.evaluateLine(1, "1 + 2")[0].toNumber()).toBe(3);
    // But parselet-requiring operations (FUNC tokens, variables, etc.) fail
    expect(() => engine.evaluateLine(2, "sqrt(144)")).toThrow();
    expect(() => engine.evaluateLine(3, ":x = 100")).toThrow();
  });

  test("empty packages still allows engine instantiation without error", () => {
    expect(() => new ExpressionEngine("en", false, undefined, undefined, [])).not.toThrow();
  });

  test("empty packages engine can still be used for parsing empty input", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, []);
    // parseDocument with no expressions should not crash
    const result = engine.parseDocument("Hello world");
    expect(result.lines.length).toBeGreaterThan(0);
  });

  // ── Single package: ARITHMETIC only ───────────────────────────────

  test("ARITHMETIC_PACKAGE only: supports basic arithmetic", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, [ARITHMETIC_PACKAGE]);

    // Basic operations work
    expect(engine.evaluateLine(1, "1 + 2")[0].toNumber()).toBe(3);
    expect(engine.evaluateLine(2, "10 - 3")[0].toNumber()).toBe(7);
    expect(engine.evaluateLine(3, "4 * 5")[0].toNumber()).toBe(20);
    expect(engine.evaluateLine(4, "20 / 4")[0].toNumber()).toBe(5);
    expect(engine.evaluateLine(5, "2 ^ 3")[0].toNumber()).toBe(8);

    // Parentheses work (GroupParselet is in ARITHMETIC)
    expect(engine.evaluateLine(6, "(2 + 3) * 4")[0].toNumber()).toBe(20);

    // Unary operators work
    expect(engine.evaluateLine(7, "-5")[0].toNumber()).toBe(-5);
    expect(engine.evaluateLine(8, "+5")[0].toNumber()).toBe(5);
  });

  test("ARITHMETIC_PACKAGE only: functions are NOT available", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, [ARITHMETIC_PACKAGE]);
    expect(() => engine.evaluateLine(1, "sqrt(144)")).toThrow();
  });

  test("ARITHMETIC_PACKAGE only: dice are NOT available", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, [ARITHMETIC_PACKAGE]);
    expect(() => engine.evaluateLine(1, "roll(1, 20)")).toThrow();
  });

  test("ARITHMETIC_PACKAGE only: PERCENT token handled inline (Tier 1 infix)", () => {
    // PERCENT is a Tier 1 inline infix operator — always available regardless of packages.
    // "50% of 200" → 50 / 100 * 200 = 100
    const engine = new ExpressionEngine("en", false, undefined, undefined, [ARITHMETIC_PACKAGE]);
    const [result] = engine.evaluateLine(1, "50% of 200");
    expect(result.toNumber()).toBe(100);
  });

  test("ARITHMETIC_PACKAGE only: variables are NOT available", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, [ARITHMETIC_PACKAGE]);
    expect(() => engine.evaluateLine(1, ":x = 100")).toThrow();
  });

  test("ARITHMETIC_PACKAGE only: constants (PI, E) work", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, [ARITHMETIC_PACKAGE]);
    const [pi] = engine.evaluateLine(1, "PI");
    expect(pi.toNumber()).toBeCloseTo(Math.PI, 5);
    const [e] = engine.evaluateLine(2, "E");
    expect(e.toNumber()).toBeCloseTo(Math.E, 5);
  });

  // ── Single package: FUNCTION only ─────────────────────────────────
  // Note: FUNCTION alone cannot parse number literals since NUMBER parselet
  // is in ARITHMETIC. This tests the dependency chain correctly.

  test("FUNCTION_PACKAGE only: functions work (NUMBER is Tier 1 inline)", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, [FUNCTION_PACKAGE]);
    // FUNCTION_PACKAGE provides FUNC prefix parselet; NUMBER 144 is Tier 1 inline
    const [result] = engine.evaluateLine(1, "sqrt(144)");
    expect(result.toNumber()).toBe(12);
  });

  test("FUNCTION_PACKAGE only: basic arithmetic works (Tier 1 inline)", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, [FUNCTION_PACKAGE]);
    // NUMBER and PLUS are Tier 1 inline — always available
    expect(engine.evaluateLine(1, "1 + 2")[0].toNumber()).toBe(3);
  });

  // ── Multiple packages (subset) ────────────────────────────────────

  test("ARITHMETIC + FUNCTION packages: both work, others don't", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, [
      ARITHMETIC_PACKAGE,
      FUNCTION_PACKAGE,
    ]);

    // Arithmetic works
    expect(engine.evaluateLine(1, "1 + 2")[0].toNumber()).toBe(3);
    // Functions work (NUMBER parselet now available from ARITHMETIC)
    expect(engine.evaluateLine(2, "sqrt(144) + 5")[0].toNumber()).toBe(17);
    // Dice NOT available
    expect(() => engine.evaluateLine(3, "roll(1, 20)")).toThrow();
    // PERCENT is Tier 1 inline infix — evaluates as 50 / 100 * 200 = 100
    const [pct] = engine.evaluateLine(4, "50% of 200");
    expect(pct.toNumber()).toBe(100);
  });

  test("ARITHMETIC + PERCENTAGE packages only", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, [
      ARITHMETIC_PACKAGE,
      PERCENTAGE_PACKAGE,
    ]);

    // Arithmetic works
    expect(engine.evaluateLine(1, "1 + 2")[0].toNumber()).toBe(3);
    // Percentages work (PERCENTAGE_PACKAGE provides PERCENT infix parselet)
    const [pct] = engine.evaluateLine(2, "50% of 200");
    expect(pct.toNumber()).toBe(100);
    // Functions NOT available
    expect(() => engine.evaluateLine(3, "sqrt(144)")).toThrow();
  });

  test("ARITHMETIC + VARIABLES packages only", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, [
      ARITHMETIC_PACKAGE,
      VARIABLES_PACKAGE,
    ]);

    // Variables work
    engine.evaluateLine(1, ":x = 100");
    expect(engine.evaluateLine(2, ":x + 50")[0].toNumber()).toBe(150);
    // Functions NOT available
    expect(() => engine.evaluateLine(3, "sqrt(144)")).toThrow();
  });

  test("ARITHMETIC + DICE packages only", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, [
      ARITHMETIC_PACKAGE,
      DICE_PACKAGE,
    ]);

    // Arithmetic works
    expect(engine.evaluateLine(1, "1 + 2")[0].toNumber()).toBe(3);
    // Dice work
    const [dice] = engine.evaluateLine(2, "roll(1, 6)");
    expect(dice.toNumber()).toBeGreaterThanOrEqual(1);
    expect(dice.toNumber()).toBeLessThanOrEqual(6);
    // Functions NOT available
    expect(() => engine.evaluateLine(3, "sqrt(144)")).toThrow();
  });

  test("ARITHMETIC + DATETIME packages only", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, [
      ARITHMETIC_PACKAGE,
      DATETIME_PACKAGE,
    ]);

    // Arithmetic works
    expect(engine.evaluateLine(1, "1 + 2")[0].toNumber()).toBe(3);
    // Datetime works (now returns epoch ms)
    const [nowResult] = engine.evaluateLine(2, "now");
    expect(nowResult.toNumber()).toBeGreaterThan(0);
  });

  test("ARITHMETIC + UOM packages only", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, [
      ARITHMETIC_PACKAGE,
      UOM_PACKAGE,
    ]);

    // Arithmetic works
    expect(engine.evaluateLine(1, "1 + 2")[0].toNumber()).toBe(3);
    // Units work
    const [result] = engine.evaluateLine(2, "100 cm + 1 m");
    expect(result.toNumber()).toBeGreaterThan(0);
  });

  test("ARITHMETIC + BIGINT packages only", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, [
      ARITHMETIC_PACKAGE,
      BIGINT_PACKAGE,
    ]);

    // Arithmetic works
    expect(engine.evaluateLine(1, "1 + 2")[0].toNumber()).toBe(3);
    // BigInt works
    const [result] = engine.evaluateLine(2, "99999999999999999999n");
    expect(result.value).toBeDefined();
  });

  // ── Three packages ────────────────────────────────────────────────

  test("ARITHMETIC + FUNCTION + PERCENTAGE — only these three work", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, [
      ARITHMETIC_PACKAGE,
      FUNCTION_PACKAGE,
      PERCENTAGE_PACKAGE,
    ]);

    // Arithmetic works
    expect(engine.evaluateLine(1, "1 + 2")[0].toNumber()).toBe(3);
    // Functions work
    expect(engine.evaluateLine(2, "sqrt(144)")[0].toNumber()).toBe(12);
    // Percentages work
    const [pct] = engine.evaluateLine(3, "50% of 200");
    expect(pct.toNumber()).toBe(100);
    // Combined
    expect(engine.evaluateLine(4, "sqrt(100) + 50% of 200")[0].toNumber()).toBe(110);

    // Dice NOT available
    expect(() => engine.evaluateLine(5, "roll(1, 20)")).toThrow();
    // Variables NOT available
    expect(() => engine.evaluateLine(6, ":x = 1")).toThrow();
  });

  // ── All built-in packages listed explicitly ───────────────────────

  test("explicitly passing all BUILTIN_PACKAGES works the same as default", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, [
      ...BUILTIN_PACKAGES,
    ]);

    expect(engine.evaluateLine(1, "1 + 2 * 3")[0].toNumber()).toBe(7);
    expect(engine.evaluateLine(2, "sqrt(144)")[0].toNumber()).toBe(12);
    const [pct] = engine.evaluateLine(3, "10% of 200");
    expect(pct.toNumber()).toBe(20);
    engine.evaluateLine(4, ":x = 100");
    expect(engine.evaluateLine(5, ":x + 50")[0].toNumber()).toBe(150);
  });

  // ── Cross-contamination between engines ───────────────────────────

  test("multiple engines with different package sets do not interfere", () => {
    const fullEngine = new ExpressionEngine("en", false, undefined, undefined, BUILTIN_PACKAGES);
    const arithmeticOnly = new ExpressionEngine("en", false, undefined, undefined, [ARITHMETIC_PACKAGE]);

    // Full engine has all features
    expect(fullEngine.evaluateLine(1, "sqrt(144)")[0].toNumber()).toBe(12);

    // Arithmetic-only engine should not have functions
    expect(() => arithmeticOnly.evaluateLine(1, "sqrt(144)")).toThrow();

    // But arithmetic-only still has arithmetic
    expect(arithmeticOnly.evaluateLine(2, "1 + 2")[0].toNumber()).toBe(3);

    // Full engine still works after creating arithmetic-only
    expect(fullEngine.evaluateLine(3, "sqrt(144) + 5")[0].toNumber()).toBe(17);
  });

  test("creating engines with different subsets sequentially does not leak state", () => {
    // Engine 1: ARITHMETIC only
    const e1 = new ExpressionEngine("en", false, undefined, undefined, [ARITHMETIC_PACKAGE]);
    expect(e1.evaluateLine(1, "1 + 2")[0].toNumber()).toBe(3);
    expect(() => e1.evaluateLine(2, "sqrt(144)")).toThrow();

    // Engine 2: ARITHMETIC + FUNCTION — functions work because numbers are available
    const e2 = new ExpressionEngine("en", false, undefined, undefined, [
      ARITHMETIC_PACKAGE,
      FUNCTION_PACKAGE,
    ]);
    expect(e2.evaluateLine(1, "sqrt(144)")[0].toNumber()).toBe(12);
    expect(e2.evaluateLine(2, "1 + 2")[0].toNumber()).toBe(3);

    // Engine 3: Full — still works
    const e3 = new ExpressionEngine("en", false, undefined, undefined, BUILTIN_PACKAGES);
    expect(e3.evaluateLine(1, "sqrt(144) + 5")[0].toNumber()).toBe(17);
    expect(e3.evaluateLine(2, "1 + 2")[0].toNumber()).toBe(3);
  });

  // ── Edge cases ────────────────────────────────────────────────────

  test("nullish coalescing: undefined packages defaults to BUILTIN_PACKAGES", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, undefined);
    expect(engine.evaluateLine(1, "1 + 2")[0].toNumber()).toBe(3);
    expect(engine.evaluateLine(2, "sqrt(144)")[0].toNumber()).toBe(12);
  });

  test("multiple engines with same package subset get independent registries", () => {
    const e1 = new ExpressionEngine("en", false, undefined, undefined, [ARITHMETIC_PACKAGE]);
    const e2 = new ExpressionEngine("en", false, undefined, undefined, [ARITHMETIC_PACKAGE]);

    // Both work independently
    expect(e1.evaluateLine(1, "1 + 2")[0].toNumber()).toBe(3);
    expect(e2.evaluateLine(1, "1 + 2")[0].toNumber()).toBe(3);

    // Both independently lack VARIABLES
    expect(() => e1.evaluateLine(2, ":x = 100")).toThrow();
    expect(() => e2.evaluateLine(2, ":x = 100")).toThrow();
  });

  test("engine with only VARIABLES but no ARITHMETIC: variable assignments work (NUMBER inline)", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, [VARIABLES_PACKAGE]);
    // NUMBER 100 is Tier 1 inline — always available for RHS
    engine.evaluateLine(1, ":x = 100");
    expect(engine.evaluateLine(2, ":x + 50")[0].toNumber()).toBe(150);
  });

  test("engine with VARIABLES + ARITHMETIC can assign and read variables", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, [
      ARITHMETIC_PACKAGE,
      VARIABLES_PACKAGE,
    ]);

    engine.evaluateLine(1, ":x = 100");
    expect(engine.evaluateLine(2, ":x + 50")[0].toNumber()).toBe(150);
  });

  test("parseDocument works with subset packages", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, [
      ARITHMETIC_PACKAGE,
      VARIABLES_PACKAGE,
    ]);

    const doc = ":x = 10\n:x + 5\n:x * 2";
    const result = engine.parseDocument(doc);
    expect(result.lines.length).toBe(3);
    expect(result.errors.length).toBe(0);
  });

  test("parseDocument with empty packages skips expression lines gracefully", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, []);
    const doc = "1 + 2\n3 + 4";
    const result = engine.parseDocument(doc);
    // Lines are classified but evaluation will fail — should have errors
    expect(result.lines.length).toBe(2);
  });

  // ── Per-package containment (gap found during the error-handling pass) ──
  //
  // registerPackage()'s lexerVocabulary sub-registration is the one call in
  // that method that can throw (ExpressionLexer.registerVocabulary()'s hard
  // guard against overriding a built-in keyword/operator/unit — every other
  // sub-registration there is already "warn and proceed"). Before this fix,
  // an unguarded throw from one bad package (most plausibly third-party,
  // passed via this constructor's `packages` param) escaped the constructor
  // loop entirely: `new ExpressionEngine(...)` never returned an instance,
  // every package listed AFTER the offender never registered, and anything
  // the offending or earlier packages already wrote into shared
  // module-level registries had no owning engine instance left to clean up.

  test("a package whose lexerVocabulary collides with a built-in keyword is skipped, not fatal to construction", () => {
    const collidingPackage = {
      name: "CollidingTestPackage",
      lexerVocabulary: {
        // "pi" is a built-in English-locale keyword (see
        // LexerVocabularyFuzz.spec.ts's BUILTIN_KEYWORDS) — registering it
        // here reproduces ExpressionLexer.registerVocabulary()'s
        // PLUGIN_KEYWORD_COLLISION throw deterministically.
        keywords: { pi: "COLLIDING_PI_TOKEN" },
      },
    };

    let engine!: ExpressionEngine;
    expect(() => {
      engine = new ExpressionEngine("en", false, undefined, undefined, [
        ARITHMETIC_PACKAGE,
        collidingPackage,
        VARIABLES_PACKAGE,
      ]);
    }).not.toThrow();

    // Packages registered before AND after the offender in the list still
    // work — construction didn't abort partway through.
    expect(engine.evaluateLine(1, "1 + 2")[0].toNumber()).toBe(3);
    engine.evaluateLine(2, ":x = 100");
    expect(engine.evaluateLine(3, ":x + 50")[0].toNumber()).toBe(150);
  });

  test("a package that fails registration is not left in a phantom registeredPackages entry", () => {
    const collidingPackage = {
      name: "CollidingTestPackage2",
      lexerVocabulary: { keywords: { pi: "COLLIDING_PI_TOKEN_2" } },
    };
    const engine = new ExpressionEngine("en", false, undefined, undefined, [
      ARITHMETIC_PACKAGE,
      collidingPackage,
    ]);

    // Since it never actually registered, re-registering it directly
    // (registerPackage() itself still throws for a single bad package —
    // only the constructor's loop contains the failure) should throw the
    // SAME PLUGIN_KEYWORD_COLLISION error again, not silently no-op as it
    // would if a stale "already registered" entry had survived the failed
    // construction-time attempt (that path logs a warning and calls
    // unregisterPackage() instead of re-attempting registration).
    expect.assertions(1);
    try {
      engine.registerPackage(collidingPackage);
    } catch (e) {
      expect((e as { code?: string }).code).toBe("PLUGIN_KEYWORD_COLLISION");
    }
  });
});
