/**
 * Range-based matrix slicing — `a[rowRange, colRange]` where either/both
 * arguments use an explicit `min:max` bound. See MatrixIndexParselet's own
 * doc comment for why this is hand-parsed locally (not a general infix
 * operator on COLON): a general operator would break the shipped
 * "labeled-line fallback" feature (__tests__/engine/LabeledLine.spec.ts)
 * and collide with the Time package's clock-time/laptime/video-timecode
 * literals, which fuse ANY bare `NUMBER:NUMBER...` sequence pre-parse.
 * This file also carries the regression guards proving those two existing
 * features are unaffected by adding matrix range-slicing.
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

describe("Matrix range-slicing", () => {
  test("a=[1,2,3;4,5,6;7,8,9]; a[0:1,1:2]=>[2,3;5,6]", () => {
    const e = engine();
    e.evaluateLine(1, ":a = [1, 2, 3; 4, 5, 6; 7, 8, 9]");
    const v = e.evaluateLine(2, "a[0:1, 1:2]")[0];
    expect(v.isMatrix()).toBe(true);
    const m = v.value as MatrixData;
    expect(m.rows).toBe(2);
    expect(m.cols).toBe(2);
    expect(rowMajor(m)).toEqual([2, 3, 5, 6]);
  });

  test("a mixed point+range slice: a[0, 0:1] selects row 0, cols 0-1", () => {
    const e = engine();
    e.evaluateLine(1, ":a = [1, 2, 3; 4, 5, 6; 7, 8, 9]");
    const v = e.evaluateLine(2, "a[0, 0:1]")[0];
    const m = v.value as MatrixData;
    expect(m.rows).toBe(1);
    expect(m.cols).toBe(2);
    expect(rowMajor(m)).toEqual([1, 2]);
  });

  test("a single-cell slice a[0:0, 0:0] returns a 1x1 MATRIX, not a bare scalar", () => {
    const e = engine();
    e.evaluateLine(1, ":a = [1, 2; 3, 4]");
    const v = e.evaluateLine(2, "a[0:0, 0:0]")[0];
    expect(v.type).toBe(ValueType.Matrix);
    const m = v.value as MatrixData;
    expect(m.rows).toBe(1);
    expect(m.cols).toBe(1);
    expect(m.data).toEqual([1]);
  });

  test("plain point indexing a[0,0] is unaffected — still returns a bare scalar", () => {
    const e = engine();
    e.evaluateLine(1, ":a = [1, 2; 3, 4]");
    const v = e.evaluateLine(2, "a[0, 0]")[0];
    expect(v.type).toBe(ValueType.Number);
    expect(v.toNumber()).toBe(1);
  });

  test("slice out of bounds produces a clear error", () => {
    const e = engine();
    e.evaluateLine(1, ":a = [1, 2; 3, 4]");
    const v = e.evaluateLine(2, "a[0:5, 0:0]")[0];
    expect(v.type).toBe(ValueType.Error);
    expect(v.value).toBe("MATRIX_INDEX_OUT_OF_BOUNDS");
  });

  test("a descending range bound produces a clear error, not a silent swap", () => {
    const e = engine();
    e.evaluateLine(1, ":a = [1, 2; 3, 4]");
    const v = e.evaluateLine(2, "a[1:0, 0:0]")[0];
    expect(v.type).toBe(ValueType.Error);
    expect(v.value).toBe("DESCENDING_RANGE");
  });

  test("a 1-argument slice is a clear arity error, not silently accepted", () => {
    const e = engine();
    e.evaluateLine(1, ":a = [1, 2, 3]");
    expect(() => e.evaluateLine(2, "a[0:1]")).toThrow();
  });

  test("range bounds may be arbitrary variable expressions: a[x:y, 0:0]", () => {
    const e = engine();
    e.evaluateLine(1, ":a = [1, 2, 3; 4, 5, 6; 7, 8, 9]");
    e.evaluateLine(2, ":x = 0");
    e.evaluateLine(3, ":y = 1");
    const v = e.evaluateLine(4, "a[x:y, 0:0]")[0];
    const m = v.value as MatrixData;
    expect(m.rows).toBe(2);
    expect(m.cols).toBe(1);
    expect(rowMajor(m)).toEqual([1, 4]);
  });

  // ── Regression guards: pre-existing features must be unaffected ──

  test("regression guard: labeled-line fallback ('total: 5 + 3') is unaffected", () => {
    const [value] = engine().evaluateExpression("total: 5 + 3");
    expect(value.toNumber()).toBe(8);
  });

  test("regression guard: labeled-line fallback with a datetime phrase is unaffected", () => {
    const [value] = engine().evaluateExpression("age: years since 27/11/2010");
    expect(value.type).toBe(ValueType.Uom);
    expect(value.unit).toBe("years");
  });

  test("regression guard: a bare clock time is unaffected (still means time-of-day, not a range)", () => {
    const [labeled] = engine().evaluateExpression("meeting notes: 9:30 + 5");
    const [plain] = engine().evaluateExpression("9:30 + 5");
    expect(labeled.value).toBe(plain.value);
  });

  test("regression guard: a bare lap time is unaffected", () => {
    const [value] = engine().evaluateExpression("03:04:05");
    expect(value.toNumber()).toBe(11045);
  });

  test("regression guard: a clock time INSIDE a matrix literal is suppressed, reads as a range slice instead", () => {
    const e = engine();
    e.evaluateLine(1, ":a = [1, 2, 3]");
    // "0:2" inside the brackets must NOT fuse into a clock-time literal —
    // it must be read as a real range, selecting the whole row.
    const v = e.evaluateLine(2, "a[0:0, 0:2]")[0];
    const m = v.value as MatrixData;
    expect(rowMajor(m)).toEqual([1, 2, 3]);
  });
});
