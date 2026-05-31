/**
 * RecursiveDescentParser Correctness Test
 *
 * Creates two ExpressionEngine instances — one with the Pratt parser (default)
 * and one with the Recursive Descent parser — and compares their output across
 * a comprehensive set of expressions spanning all provider packages.
 */
import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { ValueType } from "@solve-js/vm/Value";

function prattEngine(): ExpressionEngine {
  return new ExpressionEngine("en", false);
}

function rdEngine(): ExpressionEngine {
  return new ExpressionEngine("en", false, {
    parser: { useRecursiveDescent: true },
  });
}

/** Expressions whose results are non-deterministic (random).
 *  For these we verify both parsers produce values in the same expected range,
 *  rather than requiring exact equality. */
const diceExpressions = new Set(["dice_roll", "dice_between"]);

const expressions: Record<string, string> = {
  // ─── Arithmetic ──────────────────────────────────────────────────────
  literal: "42",
  negative: "-42",
  hex: "0xFF",
  binary: "0b1010",
  scientific: "1.5e3",
  decimal: "3.14",
  add: "2 + 3",
  sub: "10 - 4",
  mul: "6 * 7",
  div: "100 / 4",
  mod: "17 % 5",
  exp: "2 ^ 8",
  neg_add: "-5 + 3",
  parens: "(2 + 3) * 4",
  triple: "1 + 2 + 3",
  four_ops: "2 + 3 * 4 - 5",
  nested_parens: "((2 + 3) * (4 - 1))",
  float_result: "10 / 3",
  thousand_sep: "1,200 + 3,400",

  // ─── Bitwise ─────────────────────────────────────────────────────────
  bit_and: "5 & 3",
  bit_or: "5 | 3",
  bit_xor: "5 ^ 3",
  lshift: "1 << 3",
  rshift: "8 >> 1",

  // ─── Constants ───────────────────────────────────────────────────────
  pi: "pi",
  e: "e",
  pi_mul: "pi * 2",

  // ─── Percentage ──────────────────────────────────────────────────────
  percent_postfix: "50%",
  percent_of: "10% of 200",
  increase: "increase 100 by 10%",
  decrease: "decrease 100 by 20%",
  percent_change: "50 to 100",

  // ─── Functions ───────────────────────────────────────────────────────
  sqrt_fn: "sqrt(16)",
  abs_fn: "abs(-42)",
  sin_fn: "sin(0)",
  cos_fn: "cos(0)",
  log_fn: "log(1)",
  min_fn: "min(3, 7, 2)",
  max_fn: "max(3, 7, 2)",
  round_fn: "round(3.7)",
  floor_fn: "floor(3.7)",
  ceil_fn: "ceil(3.2)",
  pow_fn: "pow(2, 10)",

  // ─── Variables ───────────────────────────────────────────────────────
  var_def: ":x = 42",
  var_ref_simple: ":x",

  // ─── Datetime ────────────────────────────────────────────────────────
  // These produce Date values — skip numeric comparison, just verify no crash
  // now: "now",
  // today: "today",

  // ─── Dice ────────────────────────────────────────────────────────────
  dice_roll: "roll(1, 6)",
  dice_between: "roll between 1 and 6",

  // ─── Vectors ─────────────────────────────────────────────────────────
  vec2: "vec2(1, 2)",
  vec3: "vec3(1, 2, 3)",
  vec4: "vec4(1, 2, 3, 4)",

  // ─── Units of Measurement ────────────────────────────────────────────
  uom_km_m: "5 km to m",
  uom_kg_g: "2 kg to g",
  uom_in: "100 in m",

  // ─── Currency ────────────────────────────────────────────────────────
  currency_usd: "$100",
  currency_gbp: "£50",
  currency_eur: "€75",

  // ─── Multipliers ─────────────────────────────────────────────────────
  times_by: "5 times 3",
  multiply_by: "5 multiplied by 3",
  divide_by: "10 divided by 2",

  // ─── Complex ─────────────────────────────────────────────────────────
  complex_mixed: "(2 + 3) * 4 - 10 / 2",
  percent_complex: "20% of (100 + 50)",
};

describe("Recursive Descent Parser — Deterministic Dice Rolls", () => {
  // ── Helpers ────────────────────────────────────────────────────────────
  let originalRandom: () => number;

  beforeAll(() => {
    originalRandom = Math.random;
  });

  afterAll(() => {
    Math.random = originalRandom;
  });

  /** Seed Math.random to return a fixed value.
   *  `roll(1, 6)` = `Math.floor(random * (6 - 1 + 1)) + 1`
   *               = `Math.floor(random * 6) + 1`
   *  So random = 0.5 → 4, random = 0.0 → 1, random = 0.25 → 2 */
  function seedRandom(value: number) {
    Math.random = () => value;
  }

  test("roll(1, 6) returns identical result when Math.random is seeded", () => {
    seedRandom(0.5);
    const pratt = prattEngine();
    const rd = rdEngine();

    const prattResult = pratt.evaluateExpression("roll(1, 6)");
    const rdResult = rd.evaluateExpression("roll(1, 6)");

    expect(prattResult.type).toBe(ValueType.Number);
    expect(rdResult.type).toBe(ValueType.Number);
    expect(prattResult.value).toBe(4);  // floor(0.5 * 6) + 1 = 4
    expect(rdResult.value).toBe(4);
  });

  test("roll between 1 and 6 returns identical result when Math.random is seeded", () => {
    // Use a different seed than the roll(1, 6) test so they aren't duplicates.
    // 0.25 → floor(0.25 * 6) + 1 = 1 + 1 = 2
    seedRandom(0.25);
    const pratt = prattEngine();
    const rd = rdEngine();

    const prattResult = pratt.evaluateExpression("roll between 1 and 6");
    const rdResult = rd.evaluateExpression("roll between 1 and 6");

    expect(prattResult.type).toBe(ValueType.Number);
    expect(rdResult.type).toBe(ValueType.Number);
    expect(prattResult.value).toBe(2);
    expect(rdResult.value).toBe(2);
  });

  test("roll(1, 6) covers full range [1, 6] when Math.random is re-seeded per call", () => {
    // Each engine gets two calls to Math.random (one for Pratt, one for RD).
    // Provide enough values so every call gets a deterministic result.
    // 0.0 → 1, 0.2 → 2, 0.4 → 3, 0.6 → 4, 0.8 → 5, 0.999 → 6
    const seeds = [0.0, 0.2, 0.4, 0.6, 0.8, 0.999];
    const results = new Set<number>();

    for (const seed of seeds) {
      seedRandom(seed);
      const pratt = prattEngine();
      const prattResult = pratt.evaluateExpression("roll(1, 6)");
      expect(prattResult.type).toBe(ValueType.Number);
      results.add(prattResult.value as number);

      seedRandom(seed);
      const rd = rdEngine();
      const rdResult = rd.evaluateExpression("roll(1, 6)");
      expect(rdResult.type).toBe(ValueType.Number);
      expect(rdResult.value).toBe(prattResult.value);
    }

    // Verify we covered the full [1, 6] range.
    // Expected values: floor(0*6)+1=1, floor(0.2*6)+1=2, floor(0.4*6)+1=3,
    //                   floor(0.6*6)+1=4, floor(0.8*6)+1=5, floor(0.999*6)+1=6
    expect(results.size).toBe(6);
    for (let i = 1; i <= 6; i++) {
      expect(results.has(i)).toBe(true);
    }
  });

  test("roll(3, 8) returns identical result and within [3, 8] when seeded", () => {
    seedRandom(0.5);
    const pratt = prattEngine();
    const rd = rdEngine();

    const prattResult = pratt.evaluateExpression("roll(3, 8)");
    const rdResult = rd.evaluateExpression("roll(3, 8)");

    // floor(0.5 * (8 - 3 + 1)) + 3 = floor(0.5 * 6) + 3 = 3 + 3 = 6
    expect(prattResult.type).toBe(ValueType.Number);
    expect(rdResult.type).toBe(ValueType.Number);
    expect(prattResult.value).toBe(6);
    expect(rdResult.value).toBe(6);
  });
});

describe("Recursive Descent Parser — Correctness", () => {
  const pratt = prattEngine();
  const rd = rdEngine();

  // Evaluate all expressions on both engines, collect results
  const results: Record<
    string,
    { pratt: number | string; rd: number | string; match: boolean }
  > = {};

  beforeAll(() => {
    for (const [name, expr] of Object.entries(expressions)) {
      try {
        const prattResult = pratt.evaluateExpression(expr);
        const rdResult = rd.evaluateExpression(expr);

        if (
          prattResult.type === ValueType.Number &&
          rdResult.type === ValueType.Number
        ) {
          const pv = prattResult.value as number;
          const rv = rdResult.value as number;
          let match: boolean;
          if (diceExpressions.has(name)) {
            // Dice rolls are non-deterministic. Verify both values are
            // integers in [1, 6] (1d6) and both are finite.
            match =
              Number.isInteger(pv) &&
              Number.isInteger(rv) &&
              pv >= 1 &&
              pv <= 6 &&
              rv >= 1 &&
              rv <= 6;
          } else {
            match = Math.abs(pv - rv) < 1e-9;
          }
          results[name] = {
            pratt: pv,
            rd: rv,
            match,
          };
        } else if (
          prattResult.type === ValueType.Uom &&
          rdResult.type === ValueType.Uom
        ) {
          results[name] = {
            pratt: `${prattResult.value} ${prattResult.unit}`,
            rd: `${rdResult.value} ${rdResult.unit}`,
            match:
              prattResult.value === rdResult.value &&
              prattResult.unit === rdResult.unit,
          };
        } else {
          results[name] = {
            pratt: prattResult.type,
            rd: rdResult.type,
            match: prattResult.type === rdResult.type,
          };
        }
      } catch (e) {
        results[name] = {
          pratt: `ERROR: ${(e as Error).message}`,
          rd: "not evaluated",
          match: false,
        };
      }
    }
  });

  for (const [name, expr] of Object.entries(expressions)) {
    test(`${name}: ${expr}`, () => {
      const r = results[name];
      if (!r) throw new Error(`No result for ${name}`);
      if (!r.match) {
        throw new Error(
          `Mismatch for "${name}" (${expr}):\n` +
            `  Pratt: ${r.pratt}\n` +
            `  RD:    ${r.rd}`
        );
      }
    });
  }
});
