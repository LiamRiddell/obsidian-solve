import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

describe("Phase 1: Safety Limits", () => {
  // ── Expression length ─────────────────────────────────────────────────

  test("rejects expression exceeding max length via evaluateLine", () => {
    const engine = new ExpressionEngine();
    const longExpr = "1".repeat(3000);
    expect(() => engine.evaluateLine(1, longExpr)).toThrow(/max length/i);
  });

  test("rejects expression exceeding max length via evaluateNumber", () => {
    const engine = new ExpressionEngine();
    const longExpr = "1".repeat(3000);
    // evaluateNumber catches errors and returns NaN
    expect(engine.evaluateNumber(longExpr)).toBeNaN();
  });

  test("rejects expression exceeding max length via evaluateLines", () => {
    const engine = new ExpressionEngine();
    const longExpr = "1".repeat(3000);
    const results = engine.evaluateLines([longExpr]);
    expect(results[0].error).toMatch(/max length/i);
  });

  test("rejects expression exceeding custom max length via config", () => {
    const engine = new ExpressionEngine("en", false, {
      validation: { maxExpressionLength: 5, maxComplexity: 500, maxNestingDepth: 50, autoBalanceParens: false },
    });
    // "123456" is 6 chars, exceeds limit of 5
    expect(() => engine.evaluateLine(1, "123456")).toThrow(/max length/i);
  });

  test("allows expression within custom max length via config", () => {
    const engine = new ExpressionEngine("en", false, {
      validation: { maxExpressionLength: 10, maxComplexity: 500, maxNestingDepth: 50, autoBalanceParens: false },
    });
    expect(engine.evaluateLine(1, "1 + 2")[0].toNumber()).toBe(3);
  });

  test("rejects expression through compileExpression when too long", () => {
    const engine = new ExpressionEngine();
    const longExpr = "1".repeat(3000);
    expect(() => engine.compileExpression(longExpr)).toThrow(/max length/i);
  });

  // ── Expression complexity ─────────────────────────────────────────────

  test("rejects overly complex expression with many function calls", () => {
    const engine = new ExpressionEngine();
    let expr = "";
    for (let i = 0; i < 60; i++) expr += `sqrt(${i}) + `;
    expr += "1";
    expect(() => engine.evaluateLine(1, expr)).toThrow(/complexity/i);
  });

  test("rejects overly complex expression via evaluateNumber", () => {
    const engine = new ExpressionEngine();
    let expr = "";
    for (let i = 0; i < 60; i++) expr += `sqrt(${i}) + `;
    expr += "1";
    expect(engine.evaluateNumber(expr)).toBeNaN();
  });

  test("rejects complex expression through compileExpression", () => {
    const engine = new ExpressionEngine();
    let expr = "";
    for (let i = 0; i < 60; i++) expr += `sqrt(${i}) + `;
    expr += "1";
    expect(() => engine.compileExpression(expr)).toThrow(/complexity/i);
  });

  test("accepts expression within complexity limit", () => {
    const engine = new ExpressionEngine();
    const [result] = engine.evaluateLine(1, "1 + 2 * 3");
    expect(result.toNumber()).toBe(7);
  });

  test("rejects expression exceeding custom complexity via config", () => {
    const engine = new ExpressionEngine("en", false, {
      validation: { maxExpressionLength: 2000, maxComplexity: 10, maxNestingDepth: 50, autoBalanceParens: false },
    });
    // "1 + 2" has ~3 tokens → complexity 3 (under 10), but "1 + 2 + 3 + 4" has 7 tokens → complexity 7 (under 10 too)
    // Let's use a longer expression: "a + b + c + d + e" = 9 tokens → complexity 9 (under 10)
    // "a + b + c + d + e + f" = 11 tokens → complexity 11 (over 10)
    expect(() => engine.evaluateLine(1, "a + b + c + d + e + f")).toThrow(/complexity/i);
  });

  // ── Nesting depth ─────────────────────────────────────────────────────

  test("rejects expression with excessive nesting depth", () => {
    const engine = new ExpressionEngine("en", false, {
      validation: { maxExpressionLength: 2000, maxComplexity: 500, maxNestingDepth: 3, autoBalanceParens: false },
    });
    // ((((1)))) — depth 4, exceeds max of 3
    expect(() => engine.evaluateLine(1, "((((1))))")).toThrow(/nesting depth/i);
  });

  test("allows expression within nesting depth limit", () => {
    const engine = new ExpressionEngine("en", false, {
      validation: { maxExpressionLength: 2000, maxComplexity: 500, maxNestingDepth: 10, autoBalanceParens: false },
    });
    // ((1 + 2) * 3) — depth 3, under 10
    const [result] = engine.evaluateLine(1, "((1 + 2) * 3)");
    expect(result.toNumber()).toBe(9);
  });

  test("default nesting depth allows reasonable expressions", () => {
    const engine = new ExpressionEngine();
    const [result] = engine.evaluateLine(1, "((1 + 2) * (3 + 4))");
    expect(result.toNumber()).toBe(21);
  });

  test("nesting depth limit is enforced by parser", () => {
    const engine = new ExpressionEngine("en", false, {
      validation: { maxExpressionLength: 2000, maxComplexity: 500, maxNestingDepth: 1, autoBalanceParens: false },
    });
    // (1) — depth 2, exceeds 1
    expect(() => engine.evaluateLine(1, "(1)")).toThrow(/nesting depth/i);
  });

  // ── evaluateLine baseline ─────────────────────────────────────────────

  test("evaluateLine returns correct result for valid expression", () => {
    const engine = new ExpressionEngine();
    const [result] = engine.evaluateLine(1, "10 + 20");
    expect(result.toNumber()).toBe(30);
  });

  test("evaluateLine throws helpful error when safety limit is hit", () => {
    const engine = new ExpressionEngine();
    const longExpr = "1".repeat(3000);
    try {
      engine.evaluateLine(1, longExpr);
      // Should not reach here
      expect(true).toBe(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).toMatch(/max length|Expression/i);
    }
  });

  // ── evaluateNumber fast path ──────────────────────────────────────────

  test("evaluateNumber returns NaN for too-long expression", () => {
    const engine = new ExpressionEngine();
    expect(engine.evaluateNumber("1".repeat(3000))).toBeNaN();
  });

  test("evaluateNumber returns NaN for too-complex expression", () => {
    const engine = new ExpressionEngine();
    let expr = "";
    for (let i = 0; i < 60; i++) expr += `sqrt(${i}) + `;
    expr += "1";
    expect(engine.evaluateNumber(expr)).toBeNaN();
  });

  test("evaluateNumber works for normal expressions with safety limits", () => {
    const engine = new ExpressionEngine();
    expect(engine.evaluateNumber("42")).toBe(42);
    expect(engine.evaluateNumber("1 + 2")).toBe(3);
    expect(engine.evaluateNumber("10 * 10")).toBe(100);
  });

  // ── evaluateLines batch path ──────────────────────────────────────────

  test("evaluateLines reports safety errors per line", () => {
    const engine = new ExpressionEngine();
    const results = engine.evaluateLines(["1 + 1", "1".repeat(3000), "2 + 2"]);
    expect(results[0].result?.toNumber()).toBe(2);
    expect(results[1].error).toMatch(/max length/i);
    expect(results[2].result?.toNumber()).toBe(4);
  });

  test("evaluateLines processes valid lines despite safety failure on another", () => {
    const engine = new ExpressionEngine();
    let expr = "";
    for (let i = 0; i < 60; i++) expr += `sqrt(${i}) + `;
    expr += "1";
    const results = engine.evaluateLines(["42", expr, "99"]);
    expect(results[0].result?.toNumber()).toBe(42);
    expect(results[1].error).toMatch(/complexity/i);
    expect(results[2].result?.toNumber()).toBe(99);
  });

  // ── Config integration ─────────────────────────────────────────────────

  test("constructor accepts partial validation config", () => {
    const engine = new ExpressionEngine("en", false, {
      validation: { maxExpressionLength: 100, maxComplexity: 500, maxNestingDepth: 50, autoBalanceParens: false },
    });
    // Expression within 100-char limit should pass
    expect(engine.evaluateLine(1, "42 + 1")[0].toNumber()).toBe(43);
    // Expression exceeding 100 chars should fail
    expect(() => engine.evaluateLine(1, "1".repeat(150))).toThrow(/max length/i);
  });

  test("default config has sensible limits", () => {
    const engine = new ExpressionEngine();
    // Default maxExpressionLength is 2000 — a normal expression should pass
    expect(() => engine.evaluateLine(1, "1 + 2 * 3")).not.toThrow();
    expect(engine.evaluateLine(1, "1 + 2 * 3")[0].toNumber()).toBe(7);
  });

  // ── compileExpression safety path ─────────────────────────────────────

  test("compileExpression rejects too-long expression", () => {
    const engine = new ExpressionEngine();
    expect(() => engine.compileExpression("1".repeat(3000))).toThrow(/max length/i);
  });

  test("compileExpression rejects too-complex expression", () => {
    const engine = new ExpressionEngine();
    let expr = "";
    for (let i = 0; i < 60; i++) expr += `sqrt(${i}) + `;
    expr += "1";
    expect(() => engine.compileExpression(expr)).toThrow(/complexity/i);
  });

  test("compileExpression succeeds for valid expression", () => {
    const engine = new ExpressionEngine();
    const result = engine.compileExpression("1 + 2");
    expect(result.program.opcodes.length).toBeGreaterThan(0);
    expect(result.tokens.length).toBeGreaterThan(0);
    expect(result.reads).toBeDefined();
    expect(result.writes).toBeDefined();
  });

  // ── Constant pool overflow (bytecode opcodes are a Uint8Array) ────────
  //
  // Regression for a real bug found while hardening for release: an
  // expression with more than 256 distinct numeric literals used to
  // silently produce a WRONG answer (the constant-pool index wrapped
  // instead of erroring) rather than throwing. Unreachable with the
  // default maxComplexity (500 caps a "1+1+1+..." chain at ~250 literals),
  // but reachable — and previously silent — the moment a host raises
  // maxComplexity for legitimately larger expressions. BytecodeBuilder now
  // throws instead of wrapping; this pins that behavior at the engine level.
  test("expression with >256 distinct numeric literals throws instead of silently computing the wrong answer", () => {
    const engine = new ExpressionEngine("en", false, {
      validation: { maxExpressionLength: 100000, maxComplexity: 100000, maxNestingDepth: 50, autoBalanceParens: false },
    });
    const nums = Array.from({ length: 300 }, (_, i) => i + 1); // 1..300, all distinct
    const expr = nums.join("+");
    expect(() => engine.evaluateExpression(expr)).toThrow(/numeric literals/i);
  });

  test("expression with exactly 256 distinct numeric literals still evaluates correctly", () => {
    const engine = new ExpressionEngine("en", false, {
      validation: { maxExpressionLength: 100000, maxComplexity: 100000, maxNestingDepth: 50, autoBalanceParens: false },
    });
    const nums = Array.from({ length: 256 }, (_, i) => i + 1); // 1..256, all distinct
    const expr = nums.join("+");
    const expectedSum = nums.reduce((a, b) => a + b, 0);
    const [value] = engine.evaluateExpression(expr);
    expect(value.toNumber()).toBe(expectedSum);
  });
});
