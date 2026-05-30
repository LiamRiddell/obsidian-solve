/**
 * RecursiveDescentParser Correctness Test
 *
 * Creates two ExpressionEngine instances — one with the Pratt parser (default)
 * and one with the Recursive Descent parser — and compares their output across
 * a comprehensive set of expressions spanning all provider packages.
 */
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

function prattEngine(): ExpressionEngine {
  return new ExpressionEngine("en", false);
}

function rdEngine(): ExpressionEngine {
  return new ExpressionEngine("en", false, {
    parser: { useRecursiveDescent: true },
  });
}

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
          prattResult.type === "number" &&
          rdResult.type === "number"
        ) {
          results[name] = {
            pratt: prattResult.value as number,
            rd: rdResult.value as number,
            match:
              Math.abs(
                (prattResult.value as number) -
                  (rdResult.value as number)
              ) < 1e-9,
          };
        } else if (
          prattResult.type === "uom" &&
          rdResult.type === "uom"
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
