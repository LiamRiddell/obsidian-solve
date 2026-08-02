import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { ValueType, type MatrixData } from "@solve-js/vm/Value";

/**
 * A batch of confirmed bugs found via adversarial QA probing: each one
 * produced a plausible-looking but silently WRONG numeric result instead
 * of an error, so a user would have no reason to suspect anything was off.
 */
describe("Bugs: plausible-but-silently-wrong results found via adversarial probing", () => {
  test("DIV between incompatible unit dimensions constructs a Rate, not a mislabeled result", () => {
    // "5kg / 3m" used to bypass binaryOp()'s INCOMPATIBLE_UNITS check (DIV
    // had its own inline Uom-Uom handling) and return "1.67 kg" — silently
    // discarding the denominator's unit. The intermediate fix was to error
    // instead, since at the time this codebase had no derived-unit
    // representation. It now does (see vm/Value.ts's rateValue()/
    // isRateUnit() — added for SoulverCore-style rate support, "$99/week",
    // "90 km / 3 day" -> "30 km/day"), so DIV between genuinely different
    // measures now correctly constructs "kg/m" rather than either
    // mislabeling or refusing to compute at all.
    const engine = new ExpressionEngine("en", false);
    const [result] = engine.evaluateLine(1, "5kg / 3m");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("kg/m");
    expect(result.toNumber()).toBeCloseTo(5 / 3);
  });

  // Currency-pair DIV with no cached rate is covered directly at the VM
  // level in vm/Rate.spec.ts ("two currencies with no live rate still
  // error honestly via DIV") — going through the full ExpressionEngine
  // here instead confounds the assertion with the async-preflight/Pending
  // path (CurrencyAsyncResolver kicks off a fetch and evaluateLine()
  // returns a Pending result synchronously, not an Error), which tests a
  // different layer than the DIV opcode logic this file is about.

  test("DIV between the same unit dimension still works (regression guard)", () => {
    const engine = new ExpressionEngine("en", false);
    const [result] = engine.evaluateLine(1, "10kg / 2kg");
    expect(result.type).toBe(ValueType.Number);
    expect(result.toNumber()).toBe(5);
  });

  test("vector addition with mismatched dimensions errors instead of truncating", () => {
    // "vec2(1,2) + vec3(1,2,3)" used to silently drop the third component
    // via Math.min(lv.length, rv.length), returning "[2,4]".
    const engine = new ExpressionEngine("en", false);
    const [result] = engine.evaluateLine(1, "vec2(1,2) + vec3(1,2,3)");
    expect(result.type).toBe(ValueType.Error);
  });

  test("vector addition with matching dimensions still works (regression guard)", () => {
    const engine = new ExpressionEngine("en", false);
    const [result] = engine.evaluateLine(1, "vec2(1,2) + vec2(3,4)");
    expect(result.type).toBe(ValueType.Matrix);
    expect((result.value as MatrixData).data).toEqual([4, 6]);
  });

  test("roll() with a reversed range errors instead of returning values outside the range", () => {
    // "roll(6, 1)" used to compute Math.random() * (1 - 6 + 1) = a
    // negative spread, silently producing values like 2-5 — plausible
    // small integers, but never 1 or 6, and not the [1,6] range implied
    // by the call.
    const engine = new ExpressionEngine("en", false);
    const [result] = engine.evaluateLine(1, "roll(6, 1)");
    expect(result.type).toBe(ValueType.Error);
  });

  test("roll() with a normal range still works (regression guard)", () => {
    const engine = new ExpressionEngine("en", false);
    for (let i = 0; i < 20; i++) {
      const [result] = engine.evaluateLine(1, "roll(1, 6)");
      expect(result.toNumber()).toBeGreaterThanOrEqual(1);
      expect(result.toNumber()).toBeLessThanOrEqual(6);
    }
  });

  test("subtracting two datetimes produces a duration, not a nonsense near-epoch datetime", () => {
    // "now - now" used to unconditionally re-wrap the difference as ANOTHER
    // Datetime (e.g. "01/01/1970, 01:00:00" for a near-zero difference)
    // instead of a duration.
    const engine = new ExpressionEngine("en", false);
    const [result] = engine.evaluateLine(1, "now - now");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("ms");
    expect(Math.abs(result.toNumber())).toBeLessThan(1000);
  });

  test("adding two datetimes errors instead of producing a nonsense far-future datetime", () => {
    const engine = new ExpressionEngine("en", false);
    const [result] = engine.evaluateLine(1, "now + now");
    expect(result.type).toBe(ValueType.Error);
  });

  test.each([["0x"], ["0b"], ["0X"], ["0B"]])(
    "%s (hex/binary prefix with no digits) throws instead of silently evaluating to NaN",
    (literal) => {
      const engine = new ExpressionEngine("en", false);
      expect(() => engine.evaluateLine(1, literal)).toThrow();
    }
  );

  test("well-formed hex/binary literals still work (regression guard)", () => {
    const engine = new ExpressionEngine("en", false);
    expect(engine.evaluateLine(1, "0xFF")[0].toNumber()).toBe(255);
    engine.clear();
    expect(engine.evaluateLine(1, "0b101")[0].toNumber()).toBe(5);
  });
});
