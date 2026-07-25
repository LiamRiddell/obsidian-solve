import { describe, expect, test } from "@jest/globals";
import { builtinFunctions } from "@solve-js/vm/VMBuiltins";
import { numberValue } from "@solve-js/vm/Value";

/**
 * Direct unit coverage for builtinFunctions[9] (min) and [10] (max) — these
 * were rewritten from Math.min(...args.map(...))/Math.max(...) to a manual
 * loop to avoid an intermediate array allocation on every call. These tests
 * lock in that the manual loop reproduces Math.min/Math.max's exact
 * semantics, including the edge cases a naive reimplementation could get
 * wrong: NaN poisoning regardless of position, and the empty-args identity
 * values.
 */
describe("builtinFunctions min/max — manual-loop rewrite matches Math.min/Math.max exactly", () => {
  const min = builtinFunctions[9];
  const max = builtinFunctions[10];
  const v = (...nums: number[]) => nums.map(numberValue);

  test("min/max of a normal set of values", () => {
    expect(min(v(9, 3, 7)).toNumber()).toBe(Math.min(9, 3, 7));
    expect(max(v(9, 3, 7)).toNumber()).toBe(Math.max(9, 3, 7));
  });

  test("min/max with a single argument returns that argument", () => {
    expect(min(v(42)).toNumber()).toBe(42);
    expect(max(v(42)).toNumber()).toBe(42);
  });

  test("min/max with no arguments matches Math.min()/Math.max()'s identity values", () => {
    expect(min([]).toNumber()).toBe(Math.min());
    expect(max([]).toNumber()).toBe(Math.max());
    expect(min([]).toNumber()).toBe(Infinity);
    expect(max([]).toNumber()).toBe(-Infinity);
  });

  test("a NaN anywhere in the arguments poisons the result to NaN, regardless of position", () => {
    expect(min(v(1, NaN, 3)).toNumber()).toBeNaN();
    expect(max(v(1, NaN, 3)).toNumber()).toBeNaN();
    expect(min(v(NaN, 1, 3)).toNumber()).toBeNaN();
    expect(min(v(1, 3, NaN)).toNumber()).toBeNaN();
  });

  test("negative numbers and zero are handled correctly", () => {
    expect(min(v(-5, 0, 5)).toNumber()).toBe(-5);
    expect(max(v(-5, 0, 5)).toNumber()).toBe(5);
    expect(min(v(-1, -2, -3)).toNumber()).toBe(-3);
  });

  test("Infinity arguments behave like Math.min/Math.max", () => {
    expect(min(v(1, Infinity, -Infinity)).toNumber()).toBe(-Infinity);
    expect(max(v(1, Infinity, -Infinity)).toNumber()).toBe(Infinity);
  });

  test("matches Math.min/Math.max across a range of random inputs", () => {
    for (let trial = 0; trial < 50; trial++) {
      const nums = Array.from({ length: 5 }, () => Math.random() * 200 - 100);
      expect(min(v(...nums)).toNumber()).toBe(Math.min(...nums));
      expect(max(v(...nums)).toNumber()).toBe(Math.max(...nums));
    }
  });
});
