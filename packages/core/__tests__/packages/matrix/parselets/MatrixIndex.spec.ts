/**
 * Matrix indexing — real-engine tests against the Calca reference spec's
 * `a[i]` (column-major single index) and `a[row, col]` (two-arg) forms.
 * Range-based slicing (`a[0:1, 1:2]`) is covered once Phase E (Ranges)
 * lands — see MatrixLiteral.spec.ts's own header comment for the full
 * phase breakdown.
 */
import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { ValueType } from "@solve-js/vm/Value";

function engine() {
  return new ExpressionEngine("en");
}

function evalOne(expr: string) {
  const e = engine();
  const [v] = e.evaluateExpression(expr);
  return v;
}

describe("Matrix indexing", () => {
  test("a=[0,1;2,3]; a[0,0]=>0, a[1,1]=>3, a[1,0]=>2 (row, col)", () => {
    const e = engine();
    e.evaluateLine(1, ":a = [0, 1; 2, 3]");
    expect(e.evaluateLine(2, "a[0, 0]")[0].toNumber()).toBe(0);
    expect(e.evaluateLine(3, "a[1, 1]")[0].toNumber()).toBe(3);
    expect(e.evaluateLine(4, "a[1, 0]")[0].toNumber()).toBe(2);
    expect(e.evaluateLine(5, "a[0, 1]")[0].toNumber()).toBe(1);
  });

  test("a=[0,1;2,3]; a[0]=>0, a[1]=>2, a[2]=>1 (column-major single index)", () => {
    const e = engine();
    e.evaluateLine(1, ":a = [0, 1; 2, 3]");
    expect(e.evaluateLine(2, "a[0]")[0].toNumber()).toBe(0);
    expect(e.evaluateLine(3, "a[1]")[0].toNumber()).toBe(2);
    expect(e.evaluateLine(4, "a[2]")[0].toNumber()).toBe(1);
    expect(e.evaluateLine(5, "a[3]")[0].toNumber()).toBe(3);
  });

  test("indexing a row vector: [10,20,30][1]=>20", () => {
    const v = evalOne("[10, 20, 30][1]");
    expect(v.toNumber()).toBe(20);
  });

  test("indexing supports arbitrary index expressions: a[1+1]", () => {
    const e = engine();
    e.evaluateLine(1, ":a = [10, 20, 30]");
    expect(e.evaluateLine(2, "a[1 + 1]")[0].toNumber()).toBe(30);
  });

  test("indexing a boolean-comparison matrix returns a real boolean cell", () => {
    const e = engine();
    e.evaluateLine(1, ":a = [1, 6; 3, 8] < [5, 2; 7, 4]");
    const v = e.evaluateLine(2, "a[0, 0]")[0];
    expect(v.type).toBe(ValueType.Boolean);
    expect(v.value).toBe(true);
  });

  test("single-index out of bounds produces a clear error, not a silent wrong value", () => {
    const v = evalOne("[1, 2, 3][5]");
    expect(v.type).toBe(ValueType.Error);
    expect(v.value).toBe("MATRIX_INDEX_OUT_OF_BOUNDS");
  });

  test("[row,col] out of bounds produces a clear error", () => {
    const v = evalOne("[1, 2; 3, 4][2, 0]");
    expect(v.type).toBe(ValueType.Error);
    expect(v.value).toBe("MATRIX_INDEX_OUT_OF_BOUNDS");
  });

  test("indexing a non-matrix value produces a clear error", () => {
    const v = evalOne("5[0]");
    expect(v.type).toBe(ValueType.Error);
    expect(v.value).toBe("MATRIX_INDEX_NOT_A_MATRIX");
  });

  test("three-argument index is a clear parse error, not silently truncated", () => {
    expect(() => evalOne("[1, 2; 3, 4][0, 0, 0]")).toThrow();
  });
});
