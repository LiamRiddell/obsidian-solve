/**
 * User-defined, parameterized, reusable functions (`f(x) = 2*x + 1`, then
 * `f(5)` -> `11`). See `packages/core/OTHER_APPS_FEATURE_AUDIT.md`'s Calca
 * section, `parser/BytecodeBuilder.ts`'s `UserFunctionDef` doc comment, and
 * `parser/PrecedenceParser.ts`'s `parseUserFunctionDefOrCall` for the full
 * design.
 */
import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

describe("User-defined functions — via a real, default-constructed ExpressionEngine", () => {
  test("f(x) = 2*x + 1, then f(5) = 11", () => {
    const engine = new ExpressionEngine("en");
    engine.evaluateExpression("f(x) = 2*x + 1");
    const [value] = engine.evaluateExpression("f(5)");
    expect(value.toNumber()).toBe(11);
  });

  test("f(10) = 21 -- calling the same function again with a different argument", () => {
    const engine = new ExpressionEngine("en");
    engine.evaluateExpression("f(x) = 2*x + 1");
    const [value] = engine.evaluateExpression("f(10)");
    expect(value.toNumber()).toBe(21);
  });

  test("multi-parameter: area(w, h) = w * h, then area(3, 4) = 12", () => {
    const engine = new ExpressionEngine("en");
    engine.evaluateExpression("area(w, h) = w * h");
    const [value] = engine.evaluateExpression("area(3, 4)");
    expect(value.toNumber()).toBe(12);
  });

  test("three parameters: vol(l, w, h) = l * w * h, then vol(2, 3, 4) = 24", () => {
    const engine = new ExpressionEngine("en");
    engine.evaluateExpression("vol(l, w, h) = l * w * h");
    const [value] = engine.evaluateExpression("vol(2, 3, 4)");
    expect(value.toNumber()).toBe(24);
  });

  test("composed calls: double(x) = 2 * x, then double(5) + 1 = 11", () => {
    const engine = new ExpressionEngine("en");
    engine.evaluateExpression("double(x) = 2 * x");
    const [value] = engine.evaluateExpression("double(5) + 1");
    expect(value.toNumber()).toBe(11);
  });

  test("nested/recursive-shaped calls: double(double(5)) = 20", () => {
    const engine = new ExpressionEngine("en");
    engine.evaluateExpression("double(x) = 2 * x");
    const [value] = engine.evaluateExpression("double(double(5))");
    expect(value.toNumber()).toBe(20);
  });

  test("using a built-in function inside the body: hyp(a, b) = sqrt(a*a + b*b)", () => {
    const engine = new ExpressionEngine("en");
    engine.evaluateExpression("hyp(a, b) = sqrt(a*a + b*b)");
    const [value] = engine.evaluateExpression("hyp(3, 4)");
    expect(value.toNumber()).toBe(5);
  });

  test("using a constant inside the body: circle(r) = pi * r * r", () => {
    const engine = new ExpressionEngine("en");
    engine.evaluateExpression("circle(r) = pi * r * r");
    const [value] = engine.evaluateExpression("circle(2)");
    expect(value.toNumber()).toBeCloseTo(Math.PI * 4);
  });

  test("redefining a function overwrites the previous definition", () => {
    const engine = new ExpressionEngine("en");
    engine.evaluateExpression("f(x) = x + 1");
    engine.evaluateExpression("f(x) = x * 10");
    const [value] = engine.evaluateExpression("f(5)");
    expect(value.toNumber()).toBe(50);
  });

  test("calling an undefined function throws a clear error", () => {
    const engine = new ExpressionEngine("en");
    expect(() => engine.evaluateExpression("undefinedFn(5)")).toThrow();
  });

  test("wrong arity throws a clear error", () => {
    const engine = new ExpressionEngine("en");
    engine.evaluateExpression("f(x, y) = x + y");
    expect(() => engine.evaluateExpression("f(5)")).toThrow();
  });

  // "IDENT immediately followed by (...)" was NEVER valid pre-existing
  // syntax (BuiltinNormalizerRules.ts's implicitMultiplyRule() only fires
  // for NUMBER/RPAREN before IDENT/LPAREN, never for a bare IDENT before
  // LPAREN) -- confirmed by reading that rule directly, not assumed. So
  // there's no legacy behavior to preserve here; this is a strict
  // improvement (a clear "Undefined function" error) over the confusing
  // generic "Unexpected token" parse error this shape produced before.
  test("an unregistered identifier immediately followed by (...) gives a clear 'undefined function' error, not a confusing parse error", () => {
    const engine = new ExpressionEngine("en");
    engine.evaluateExpression(":notAFunction = 5");
    expect(() => engine.evaluateExpression("notAFunction (2 + 3)")).toThrow(/undefined function/i);
  });

  // Common short parameter names collide with unit abbreviations (h=hour,
  // l=liter, b=bits, ...) and lex as UNIT, not IDENT -- both the
  // definition's parameter list AND any reference to that parameter inside
  // the body must accept/resolve it the same as a plain IDENT would.
  test("a parameter name that collides with a unit abbreviation (h = hour) still works", () => {
    const engine = new ExpressionEngine("en");
    engine.evaluateExpression("area(w, h) = w * h");
    const [value] = engine.evaluateExpression("area(3, 4)");
    expect(value.toNumber()).toBe(12);
  });

  // Regression guard: defining a function must not interfere with plain
  // ":name = value" variables that happen to share a parameter's name.
  test("regression guard: a function's parameter name does not leak into or clobber an outer variable of the same name", () => {
    const engine = new ExpressionEngine("en");
    engine.evaluateExpression(":x = 100");
    engine.evaluateExpression("f(x) = x * 2");
    const [callResult] = engine.evaluateExpression("f(5)");
    expect(callResult.toNumber()).toBe(10);
    const [outerX] = engine.evaluateExpression(":x + 1");
    expect(outerX.toNumber()).toBe(101); // the outer :x = 100 must be unaffected by f's own param x
  });
});
