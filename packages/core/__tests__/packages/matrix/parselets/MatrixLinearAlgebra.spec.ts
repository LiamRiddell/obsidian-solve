/**
 * Transpose, inverse, and determinant — real-engine tests against the
 * Calca reference spec. `^T`/`^-1` are parse-time special-cases on CARET
 * (PrecedenceParser.ts), `det`/`inv`/`transpose`/`dot` are also reachable
 * via ordinary function-call syntax, and `|a|` is abs()'s Matrix branch.
 *
 * Note: this file's `a^-1` expected values were independently re-derived
 * from the standard 2x2 inverse formula (1/det * [[d,-b],[-c,a]]) and
 * verified by matrix-multiplying back to the identity — NOT copied
 * verbatim from the original planning doc, which had a transcription
 * error in its own worked example.
 */
import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { ValueType, type MatrixData } from "@solve-js/vm/Value";

function engine() {
  return new ExpressionEngine("en");
}

function evalOne(expr: string) {
  const e = engine();
  const [v] = e.evaluateExpression(expr);
  return v;
}

function rowMajor(m: MatrixData): (number | boolean)[] {
  const out: (number | boolean)[] = [];
  for (let r = 0; r < m.rows; r++) {
    for (let c = 0; c < m.cols; c++) out.push(m.data[r + c * m.rows]);
  }
  return out;
}

describe("Matrix transpose", () => {
  test("[1,2,3;4,5,6]^T => [1,4;2,5;3,6]", () => {
    const v = evalOne("[1,2,3;4,5,6]^T");
    const m = v.value as MatrixData;
    expect(m.rows).toBe(3);
    expect(m.cols).toBe(2);
    expect(rowMajor(m)).toEqual([1, 4, 2, 5, 3, 6]);
  });

  test("transpose(a) function-call form matches ^T", () => {
    const e = engine();
    e.evaluateLine(1, ":a = [1,2;3,4]");
    const [caretResult] = e.evaluateLine(2, "a^T");
    const [fnResult] = e.evaluateLine(3, "transpose(a)");
    expect(rowMajor(fnResult.value as MatrixData)).toEqual(rowMajor(caretResult.value as MatrixData));
  });

  test("transpose of a plain number is itself", () => {
    expect(evalOne("5^T").toNumber()).toBe(5);
  });
});

describe("Matrix determinant", () => {
  test("det([1,2;3,4]) => -2", () => {
    expect(evalOne("det([1,2;3,4])").toNumber()).toBe(-2);
  });

  test("|a| (abs alias) matches det(a)", () => {
    const e = engine();
    e.evaluateLine(1, ":a = [1,2;3,4]");
    const [detResult] = e.evaluateLine(2, "det(a)");
    const [absResult] = e.evaluateLine(3, "abs(a)");
    expect(absResult.toNumber()).toBe(detResult.toNumber());
  });

  test("a singular matrix has determinant 0, not an error", () => {
    expect(evalOne("det([1,2;2,4])").toNumber()).toBe(0);
  });

  test("det of a non-square matrix is a clear error", () => {
    const v = evalOne("det([1,2,3;4,5,6])");
    expect(v.type).toBe(ValueType.Error);
    expect(v.value).toBe("DETERMINANT_REQUIRES_SQUARE_MATRIX");
  });

  test("regression guard: plain-number abs() is unaffected", () => {
    expect(evalOne("abs(-7)").toNumber()).toBe(7);
  });
});

describe("Matrix inverse", () => {
  test("[1,2;3,4]^-1 multiplied back gives the identity", () => {
    const e = engine();
    e.evaluateLine(1, ":a = [1, 2; 3, 4]");
    e.evaluateLine(2, ":ainv = a^-1");
    const [identity] = e.evaluateLine(3, "a * ainv");
    const m = identity.value as MatrixData;
    const rm = rowMajor(m).map((n) => Math.round((n as number) * 1e10) / 1e10 + 0);
    expect(rm).toEqual([1, 0, 0, 1]);
  });

  test("inv(a) function-call form matches a^-1", () => {
    const e = engine();
    e.evaluateLine(1, ":a = [1,2;3,4]");
    const [caretResult] = e.evaluateLine(2, "a^-1");
    const [fnResult] = e.evaluateLine(3, "inv(a)");
    expect(rowMajor(fnResult.value as MatrixData)).toEqual(rowMajor(caretResult.value as MatrixData));
  });

  test("a singular matrix has no inverse — a clear error", () => {
    const v = evalOne("[1,2;2,4]^-1");
    expect(v.type).toBe(ValueType.Error);
    expect(v.value).toBe("SINGULAR_MATRIX");
  });

  test("inv() of a non-square matrix is a clear error", () => {
    const v = evalOne("inv([1,2,3;4,5,6])");
    expect(v.type).toBe(ValueType.Error);
    expect(v.value).toBe("INVERSE_REQUIRES_SQUARE_MATRIX");
  });

  // ── Regression guards: plain-number CARET behavior must be unaffected ──

  test("regression guard: 5^-1 === 0.2 (ordinary exponentiation, unaffected)", () => {
    expect(evalOne("5^-1").toNumber()).toBeCloseTo(0.2);
  });

  test("regression guard: 5^-2 (not a special-case) still means ordinary exponentiation", () => {
    expect(evalOne("5^-2").toNumber()).toBeCloseTo(0.04);
  });

  test("regression guard: 2^10 (ordinary positive exponent) is unaffected", () => {
    expect(evalOne("2^10").toNumber()).toBe(1024);
  });

  test("regression guard: bitwise OR (5|3) is unaffected", () => {
    expect(evalOne("5|3").toNumber()).toBe(7);
  });
});

describe("Matrix dot()", () => {
  test("dot(a, b) matches a * b for two matrices", () => {
    const e = engine();
    e.evaluateLine(1, ":a = [1,2,3]");
    e.evaluateLine(2, ":b = [1;2;3]");
    const [mulResult] = e.evaluateLine(3, "a * b");
    const [dotResult] = e.evaluateLine(4, "dot(a, b)");
    expect(dotResult.toNumber()).toBe(mulResult.toNumber());
  });

  test("dot(a, b) for two plain numbers is their product", () => {
    expect(evalOne("dot(6, 7)").toNumber()).toBe(42);
  });
});
