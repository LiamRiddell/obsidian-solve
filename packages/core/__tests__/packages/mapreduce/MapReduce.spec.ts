/**
 * map/reduce/sum/prod — real-engine tests against the Calca reference
 * spec. See MapReduceShared.ts's own doc comments for the disambiguation
 * rules and disclosed scope decisions.
 *
 * NOTE on one spec inconsistency: the fetched Calca reference itself uses
 * TWO different reserved-name conventions across its own examples —
 * "reduce (acc + x, [1, 2, 3]) => 6" alongside "reduce (x + y, c) => 60"
 * (implying x/y, not acc/x, for that one example). This engine picks ONE
 * consistent convention (acc/x, matching the more explicit example) rather
 * than inferring arbitrary free-variable names positionally — a
 * deliberate, disclosed scope decision (see MapReduceShared.ts), so this
 * suite tests `reduce(acc+x, c)`, not the inconsistent `reduce(x+y, c)`
 * form.
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

describe("map", () => {
  test("map(cos, [0, pi/4, pi/3]) => [1, 0.7071, 0.5] (bare builtin name)", () => {
    const v = evalOne("map(cos, [0, pi/4, pi/3])");
    const m = v.value as MatrixData;
    const data = rowMajor(m) as number[];
    expect(data[0]).toBeCloseTo(1, 4);
    expect(data[1]).toBeCloseTo(0.7071, 4);
    expect(data[2]).toBeCloseTo(0.5, 4);
  });

  test("map(10*x, [0, 1, 500]) => [0, 10, 5000] (inline single-var form)", () => {
    const v = evalOne("map(10*x, [0, 1, 500])");
    expect(rowMajor(v.value as MatrixData)).toEqual([0, 10, 5000]);
  });

  test("map(10*y+x, x=[1,2], y=[3,4]) => [31, 42] (explicit zipped form)", () => {
    const v = evalOne("map(10*y+x, x=[1,2], y=[3,4])");
    expect(rowMajor(v.value as MatrixData)).toEqual([31, 42]);
  });

  test("f(x)=10x; map(f, 0:3) => [0,10,20,30] (user-function name + bare Range collection)", () => {
    const e = engine();
    e.evaluateLine(1, "f(x)=10x");
    const v = e.evaluateLine(2, "map(f, 0:3)")[0];
    expect(rowMajor(v.value as MatrixData)).toEqual([0, 10, 20, 30]);
  });

  test("map result is always a 1xN row-vector Matrix", () => {
    const v = evalOne("map(10*x, [0, 1, 500])");
    expect(v.type).toBe(ValueType.Matrix);
    const m = v.value as MatrixData;
    expect(m.rows).toBe(1);
    expect(m.cols).toBe(3);
  });

  test("mismatched zipped-collection lengths produce a clear error", () => {
    const v = evalOne("map(10*y+x, x=[1,2,3], y=[3,4])");
    expect(v.type).toBe(ValueType.Error);
    expect(v.value).toBe("MAP_COLLECTION_LENGTH_MISMATCH");
  });

  test("an undefined function name produces a clear error, not a silent 0", () => {
    const v = evalOne("map(thisFunctionDoesNotExist, [1,2,3])");
    expect(v.type).toBe(ValueType.Error);
    expect(v.value).toBe("UNDEFINED_FUNCTION");
  });
});

describe("reduce", () => {
  test("reduce(acc+x, [1,2,3]) => 6 (inline acc/x form, no initial)", () => {
    expect(evalOne("reduce(acc+x, [1,2,3])").toNumber()).toBe(6);
  });

  test("reduce(f, [1,2,3]) equals f(f(1,2),3) for a bare 2-arg user function", () => {
    const e = engine();
    e.evaluateLine(1, "f(a,b)=a+b");
    const [reduceResult] = e.evaluateLine(2, "reduce(f, [1,2,3])");
    const [expected] = e.evaluateLine(3, "f(f(1,2),3)");
    expect(reduceResult.toNumber()).toBe(expected.toNumber());
  });

  test("reduce(f, [1,2,3], 1000) equals f(f(f(1000,1),2),3) with an explicit initial", () => {
    const e = engine();
    e.evaluateLine(1, "f(a,b)=a+b");
    const [reduceResult] = e.evaluateLine(2, "reduce(f, [1,2,3], 1000)");
    const [expected] = e.evaluateLine(3, "f(f(f(1000,1),2),3)");
    expect(reduceResult.toNumber()).toBe(expected.toNumber());
    expect(reduceResult.toNumber()).toBe(1006);
  });

  test("reduce over a bare Range collection: reduce(acc+x, 1:4) => 10", () => {
    expect(evalOne("reduce(acc+x, 1:4)").toNumber()).toBe(10);
  });

  test("reduce with an initial value works even for a single-element collection", () => {
    expect(evalOne("reduce(acc+x, [5], 100)").toNumber()).toBe(105);
  });
});

describe("sum/prod sugar", () => {
  test("sum(x, c) => 60 for c=[10,20,30]", () => {
    const e = engine();
    e.evaluateLine(1, ":c = [10, 20, 30]");
    const v = e.evaluateLine(2, "sum(x, c)")[0];
    expect(v.toNumber()).toBe(60);
  });

  test("sum(x,c) matches reduce(acc+x,c)", () => {
    const e = engine();
    e.evaluateLine(1, ":c = [10, 20, 30]");
    const [sumResult] = e.evaluateLine(2, "sum(x, c)");
    const [reduceResult] = e.evaluateLine(3, "reduce(acc+x, c)");
    expect(sumResult.toNumber()).toBe(reduceResult.toNumber());
  });

  test("prod(x, 1:3) => 6", () => {
    expect(evalOne("prod(x, 1:3)").toNumber()).toBe(6);
  });

  test("prod(x,c) matches reduce(acc*x,c)", () => {
    const e = engine();
    e.evaluateLine(1, ":c = [10, 20, 30]");
    const [prodResult] = e.evaluateLine(2, "prod(x, c)");
    const [reduceResult] = e.evaluateLine(3, "reduce(acc*x, c)");
    expect(prodResult.toNumber()).toBe(reduceResult.toNumber());
    expect(prodResult.toNumber()).toBe(6000);
  });
});

describe("regression guards", () => {
  test("a clock time inside an ORDINARY (non-map/reduce) paren is unaffected", () => {
    // Clock times anchor to TODAY's date (a real Datetime), so compare
    // against the identical unparenthesized expression rather than a
    // magic number (same convention as LabeledLine.spec.ts's own
    // "produces the identical result with or without a label" guards).
    const [parenthesized] = engine().evaluateExpression("(9:00) + 5");
    const [plain] = engine().evaluateExpression("9:00 + 5");
    expect(parenthesized.value).toBe(plain.value);
    expect(parenthesized.type).toBe(ValueType.Datetime);
  });

  test("a bare top-level clock time is unaffected by map/reduce existing", () => {
    expect(evalOne("9:30").type).toBe(ValueType.Datetime);
  });

  test("the labeled-line fallback is unaffected", () => {
    const [value] = engine().evaluateExpression("total: 5 + 3");
    expect(value.toNumber()).toBe(8);
  });
});
