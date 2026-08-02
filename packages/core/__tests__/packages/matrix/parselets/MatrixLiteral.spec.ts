/**
 * Matrix literal + arithmetic — real-engine tests against the Calca
 * reference spec (matrix literals, scalar vs. real matrix multiplication,
 * element-wise ops, formatted display). Indexing/slicing, transpose/
 * inverse/determinant, ranges, map/reduce, and symbolic algebra each have
 * their own dedicated spec files (later phases).
 */
import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { ValueType, type MatrixData } from "@solve-js/vm/Value";
import { formatValue } from "@solve-js/format/FormatEngine";

function engine() {
  return new ExpressionEngine("en");
}

function evalOne(expr: string) {
  const e = engine();
  const [v] = e.evaluateExpression(expr);
  return v;
}

describe("Matrix literal", () => {
  test("[1, 2; 3, 4] is a 2x2 matrix", () => {
    const v = evalOne("[1, 2; 3, 4]");
    expect(v.isMatrix()).toBe(true);
    const m = v.value as MatrixData;
    expect(m.rows).toBe(2);
    expect(m.cols).toBe(2);
    // column-major: col0=[1,3], col1=[2,4]
    expect(m.data).toEqual([1, 3, 2, 4]);
  });

  test("[1, 2, 3] is a 1x3 row vector", () => {
    const v = evalOne("[1, 2, 3]");
    const m = v.value as MatrixData;
    expect(m.rows).toBe(1);
    expect(m.cols).toBe(3);
    expect(m.data).toEqual([1, 2, 3]);
  });

  test("[1; 2; 3] is a 3x1 column vector", () => {
    const v = evalOne("[1; 2; 3]");
    const m = v.value as MatrixData;
    expect(m.rows).toBe(3);
    expect(m.cols).toBe(1);
    expect(m.data).toEqual([1, 2, 3]);
  });

  test("cells may be arbitrary expressions: [foo, bar] * 2", () => {
    const e = engine();
    e.evaluateLine(1, ":foo = 2");
    e.evaluateLine(2, ":bar = 3");
    const [v] = e.evaluateLine(3, "[foo, bar] * 2");
    const m = v.value as MatrixData;
    expect(m.data).toEqual([4, 6]);
  });

  test("ragged rows are rejected with a clear parse error", () => {
    expect(() => evalOne("[1, 2; 3]")).toThrow();
  });

  test("an empty matrix literal is rejected", () => {
    expect(() => evalOne("[]")).toThrow();
  });

  test("formats as its own literal syntax: [1, 2; 3, 4]", () => {
    expect(formatValue(evalOne("[1, 2; 3, 4]"))).toBe("= [1, 2; 3, 4]");
  });

  test("formats a row vector as [a, b, c]", () => {
    expect(formatValue(evalOne("[1, 2, 3]"))).toBe("= [1, 2, 3]");
  });

  test("formats a column vector as [a; b; c]", () => {
    expect(formatValue(evalOne("[1; 2; 3]"))).toBe("= [1; 2; 3]");
  });
});

describe("Matrix arithmetic — spec examples", () => {
  test("[1, 2, 3] * 10 => [10, 20, 30] (scalar broadcast)", () => {
    const m = evalOne("[1, 2, 3] * 10").value as MatrixData;
    expect(m.data).toEqual([10, 20, 30]);
  });

  test("[1, 2, 3] / 10 => [0.1, 0.2, 0.3]", () => {
    const m = evalOne("[1, 2, 3] / 10").value as MatrixData;
    expect((m.data as number[]).map(n => Math.round(n * 10) / 10)).toEqual([0.1, 0.2, 0.3]);
  });

  test("[1, 2, 3] * [1; 2; 3] => [14] (real matrix product, row x column)", () => {
    const v = evalOne("[1, 2, 3] * [1; 2; 3]");
    const m = v.value as MatrixData;
    expect(m.rows).toBe(1);
    expect(m.cols).toBe(1);
    expect(m.data).toEqual([14]);
  });

  test("[1; 2; 3] * [1, 2, 3] => [1,2,3; 2,4,6; 3,6,9] (real matrix product, column x row = outer product)", () => {
    const v = evalOne("[1; 2; 3] * [1, 2, 3]");
    const m = v.value as MatrixData;
    expect(m.rows).toBe(3);
    expect(m.cols).toBe(3);
    // Row-major reading: [1,2,3; 2,4,6; 3,6,9]
    const rowMajor: number[] = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) rowMajor.push(m.data[r + c * 3] as number);
    expect(rowMajor).toEqual([1, 2, 3, 2, 4, 6, 3, 6, 9]);
  });

  test("[1, 6; 3, 8] + [5, 2; 7, 4] => [6, 8; 10, 12] (element-wise)", () => {
    const v = evalOne("[1, 6; 3, 8] + [5, 2; 7, 4]");
    const m = v.value as MatrixData;
    const rowMajor: number[] = [];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) rowMajor.push(m.data[r + c * 2] as number);
    expect(rowMajor).toEqual([6, 8, 10, 12]);
  });

  test("[1, 6; 3, 8] < [5, 2; 7, 4] => [true, false; true, false] (element-wise comparison)", () => {
    const v = evalOne("[1, 6; 3, 8] < [5, 2; 7, 4]");
    expect(v.type).toBe(ValueType.Matrix);
    const m = v.value as MatrixData;
    const rowMajor: boolean[] = [];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) rowMajor.push(m.data[r + c * 2] as boolean);
    expect(rowMajor).toEqual([true, false, true, false]);
  });

  test("a real matrix-multiply dimension mismatch produces a clear error, not a silent wrong answer", () => {
    const v = evalOne("[1, 2] * [1, 2]"); // both 1x2 — inner dims 2 and 1 don't match
    expect(v.type).toBe(ValueType.Error);
    expect(v.value).toBe("DIMENSION_MISMATCH");
  });

  test("element-wise add/sub still requires matching shape", () => {
    const v = evalOne("[1, 2] + [1, 2, 3]");
    expect(v.type).toBe(ValueType.Error);
    expect(v.value).toBe("DIMENSION_MISMATCH");
  });
});
