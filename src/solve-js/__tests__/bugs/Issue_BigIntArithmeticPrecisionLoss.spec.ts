import { describe, expect, test, beforeEach } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { ValueType } from "@solve-js/vm/Value";

/**
 * Bug: any arithmetic on a BigInt value silently truncated it to Number
 * (IEEE754 double) precision — defeating the entire purpose of the BigInt
 * type. A bare literal alone was exact (`12345678901234567890n` ->
 * 12345678901234567890n), but the moment ANY operator touched it — even
 * `+ 0` — the result was corrupted (12345678901234567890n + 0 ->
 * 12345678901234567168n, the nearest representable double).
 *
 * Root cause: VMConversion.ts's binaryOp() converted BOTH operands via
 * `BigInt(value.toNumber())` unconditionally whenever either side was
 * BigInt-typed. For an operand that was ALREADY a bigint, this round-
 * tripped it through a 64-bit float first, discarding everything beyond
 * ~2^53. Fixed by reading an already-BigInt operand's raw `.value` field
 * directly instead of going through `.toNumber()`.
 *
 * Found live in the playground: "BigInt addition" example
 * (12345678901234567890 + 1) displayed 12,345,678,901,234,567,000 instead
 * of the correct ...891 — which also revealed the example itself never
 * used the required `n` suffix, so it was demonstrating lossy Number
 * arithmetic, not BigInt at all (fixed separately in playground/examples.ts).
 */
describe("Bug: BigInt arithmetic silently truncated to Number precision", () => {
  let engine: ExpressionEngine;

  beforeEach(() => {
    engine = new ExpressionEngine("en", false);
  });

  test("adding zero must not corrupt a BigInt beyond Number.MAX_SAFE_INTEGER", () => {
    const [result] = engine.evaluateLine(1, "12345678901234567890n + 0");
    expect(result.type).toBe(ValueType.BigInt);
    expect(result.value).toBe(12345678901234567890n);
  });

  test("BigInt + BigInt addition preserves exact precision", () => {
    const [result] = engine.evaluateLine(1, "12345678901234567890n + 1n");
    expect(result.value).toBe(12345678901234567891n);
  });

  test("BigInt - BigInt subtraction preserves exact precision", () => {
    const [result] = engine.evaluateLine(1, "12345678901234567890n - 1n");
    expect(result.value).toBe(12345678901234567889n);
  });

  test("BigInt * BigInt multiplication preserves exact precision", () => {
    const [result] = engine.evaluateLine(1, "12345678901234567890n * 2n");
    expect(result.value).toBe(24691357802469135780n);
  });

  test("classic overflow torture case: 99999999999999999999n + 1n = 100000000000000000000n", () => {
    const [result] = engine.evaluateLine(1, "99999999999999999999n + 1n");
    expect(result.value).toBe(100000000000000000000n);
  });

  test("mixing BigInt with a plain Number literal still works (Number side has no extra precision to preserve)", () => {
    const [result] = engine.evaluateLine(1, "12345678901234567890n + 1");
    expect(result.type).toBe(ValueType.BigInt);
    expect(result.value).toBe(12345678901234567891n);
  });

  test("regression guard: small BigInt values unaffected", () => {
    const [result] = engine.evaluateLine(1, "50n + 30n");
    expect(result.value).toBe(80n);
  });

  test("regression guard: a bare integer literal without the 'n' suffix is still a plain Number (by design, matches JS's own BigInt literal syntax)", () => {
    const [result] = engine.evaluateLine(1, "12345678901234567890");
    expect(result.type).toBe(ValueType.Number);
  });
});
