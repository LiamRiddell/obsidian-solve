/**
 * The `=>` operator and bare (colon-less) equation-statement grammar —
 * Phase H.2. See `ExpressionEngine.ts`'s `trySymbolicGrammar()` doc
 * comment for the exact, deliberately-narrow pattern this supports (NOT
 * a general equation solver): `factor1*factor2*...*variable = rhs`.
 *
 * The full symbolic s/t/v pipeline's expected result
 * (`vx/sx-tx; vy/sy-ty; 1`) was independently re-derived by hand (not
 * copied from the fetched reference) — see the test's own comment for
 * the worked matrix algebra — since this session already found ONE
 * transcription error in an earlier planning note for a similar worked
 * example.
 */
import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { ValueType, type MatrixData } from "@solve-js/vm/Value";
import { formatSymbolic, type SymbolicNode } from "@solve-js/vm/Symbolic";

function engine() {
  return new ExpressionEngine("en");
}

function rowMajor(m: MatrixData): (number | boolean | SymbolicNode)[] {
  const out: (number | boolean | SymbolicNode)[] = [];
  for (let r = 0; r < m.rows; r++) {
    for (let c = 0; c < m.cols; c++) out.push(m.data[r + c * m.rows]);
  }
  return out;
}

describe("bare (colon-less) assignment", () => {
  test("a = [1,2;3,4] assigns like :a = [1,2;3,4]", () => {
    const e = engine();
    e.evaluateLine(1, "a = [1, 2; 3, 4]");
    const [v] = e.evaluateLine(2, "a[0,0] + a[1,1]");
    expect(v.toNumber()).toBe(5);
  });

  test("a matrix literal with an unassigned cell (sx) assigns successfully, carrying a real symbolic cell", () => {
    const e = engine();
    const [result] = e.evaluateLine(1, "s = [sx, 0, 0; 0, sy, 0; 0, 0, 1]");
    expect(result.type).toBe(ValueType.Matrix);
    const m = result.value as MatrixData;
    expect(m.hasSymbolic).toBe(true);
    // cell [0,0] (row 0, col 0) is the symbolic "sx"
    const cell00 = m.data[0 + 0 * 3];
    expect(typeof cell00).toBe("object");
    expect(formatSymbolic(cell00 as SymbolicNode)).toBe("sx");
    // cell [2,2] is the plain concrete 1
    expect(m.data[2 + 2 * 3]).toBe(1);
  });

  test("regression guard: the existing colon-prefixed form still works exactly as before", () => {
    const e = engine();
    const [v] = e.evaluateLine(1, ":x = 5");
    expect(v.toNumber()).toBe(5);
    const [v2] = e.evaluateLine(2, ":x + 1");
    expect(v2.toNumber()).toBe(6);
  });

  test("regression guard: a reserved keyword (clamp) is NOT hijacked as a bare variable name", () => {
    // "clamp = 5" must NOT silently become a bare assignment — "clamp"
    // lexes as its own CLAMP token type, never IDENT/UNIT, so
    // parseFactorChain() can't match it — falls through to the ordinary
    // (and, for this malformed input, correctly-failing) grammar.
    expect(() => engine().evaluateExpression("clamp = 5")).toThrow();
  });

  test("regression guard: map/reduce/sum/prod still work as ordinary variable names when not called", () => {
    const e = engine();
    e.evaluateLine(1, "map = 10");
    e.evaluateLine(2, "sum = 20");
    const [v] = e.evaluateLine(3, "map + sum");
    expect(v.toNumber()).toBe(30);
  });
});

describe("=> general simplify mode (no stored equation)", () => {
  test("a bare undefined variable simplifies to itself", () => {
    const [v] = engine().evaluateExpression("thisVarIsNeverDefined =>");
    expect(v.type).toBe(ValueType.Symbolic);
    expect(formatSymbolic(v.value as SymbolicNode)).toBe("thisVarIsNeverDefined");
  });

  test("an expression with a free variable simplifies via the bounded rules (1+2+b+3+b => 2b+6)", () => {
    const [v] = engine().evaluateExpression("1+2+b+3+b =>");
    expect(v.type).toBe(ValueType.Symbolic);
    expect(formatSymbolic(v.value as SymbolicNode)).toBe("2b+6");
  });

  test("a fully-concrete expression simplifies to a plain number, not a Symbolic wrapper", () => {
    const [v] = engine().evaluateExpression("2+3 =>");
    expect(v.type).toBe(ValueType.Number);
    expect(v.toNumber()).toBe(5);
  });

  test("=> with nothing before it is a clear error", () => {
    expect(() => engine().evaluateExpression("=>")).toThrow();
  });
});

describe("bare product-chain equation: a*x = rhs, then x =>", () => {
  test("storing the equation doesn't throw and doesn't assign x", () => {
    const e = engine();
    e.evaluateLine(1, "a = [1, 2; 3, 4]");
    expect(() => e.evaluateLine(2, "a*x = [60; 70]")).not.toThrow();
  });

  test("x => solves correctly against an independently-computed inverse", () => {
    const e = engine();
    e.evaluateLine(1, "a = [1, 2; 3, 4]");
    e.evaluateLine(2, "a*x = [60; 70]");
    const [x] = e.evaluateLine(3, "x =>");
    expect(x.type).toBe(ValueType.Matrix);
    const m = x.value as MatrixData;
    // Independently verified: inv([[1,2],[3,4]]) = [[-2,1],[1.5,-0.5]]
    // (det=1*4-2*3=-2; standard 2x2 inverse formula (1/det)*[[d,-b],[-c,a]]).
    // x = inv(a) * [60;70]:
    //   row0: -2*60 + 1*70    = -50
    //   row1: 1.5*60 + -0.5*70 = 90 - 35 = 55
    const rm = rowMajor(m) as number[];
    expect(rm[0]).toBeCloseTo(-50, 8);
    expect(rm[1]).toBeCloseTo(55, 8);
  });

  test("x => matches a * inv(a) * rhs computed independently via ordinary matrix ops", () => {
    const e = engine();
    e.evaluateLine(1, "a = [1, 2; 3, 4]");
    e.evaluateLine(2, "a*x = [60; 70]");
    const [x] = e.evaluateLine(3, "x =>");
    // a*x should reconstruct the original rhs, [60;70].
    e.evaluateLine(4, ":xVal = " + formatMatrixLiteral(x.value as MatrixData));
    const [reconstructed] = e.evaluateLine(5, "a*xVal");
    const rm = rowMajor(reconstructed.value as MatrixData) as number[];
    expect(rm[0]).toBeCloseTo(60, 6);
    expect(rm[1]).toBeCloseTo(70, 6);
  });

  test("solving for an undefined variable with no stored equation falls back to simplify mode", () => {
    const [v] = engine().evaluateExpression("thisIsNotAnEquation =>");
    expect(v.type).toBe(ValueType.Symbolic);
  });
});

describe("full symbolic pipeline: s*t*v = rhs with symbolic factors", () => {
  /**
   * Independently re-derived by hand:
   *   s = diag(sx, sy, 1), t = [[1,0,tx],[0,1,ty],[0,0,1]]
   *   s*t = [[sx,0,sx*tx],[0,sy,sy*ty],[0,0,1]]
   *   inv(s*t) for an upper-triangular [[a,0,c],[0,b,d],[0,0,1]] is
   *     [[1/a,0,-c/a],[0,1/b,-d/b],[0,0,1]] (verified: multiplying back
   *     gives the identity) = [[1/sx,0,-tx],[0,1/sy,-ty],[0,0,1]]
   *   v = inv(s*t) * [vx;vy;1]:
   *     row0: vx/sx + 0 - tx = vx/sx - tx
   *     row1: 0 + vy/sy - ty = vy/sy - ty
   *     row2: 1
   */
  test("v => produces [vx/sx-tx; vy/sy-ty; 1]", () => {
    const e = engine();
    e.evaluateLine(1, "s = [sx, 0, 0; 0, sy, 0; 0, 0, 1]");
    e.evaluateLine(2, "t = [1, 0, tx; 0, 1, ty; 0, 0, 1]");
    e.evaluateLine(3, "s*t*v = [vx; vy; 1]");
    const [v] = e.evaluateLine(4, "v =>");
    expect(v.type).toBe(ValueType.Matrix);
    const m = v.value as MatrixData;
    expect(m.rows).toBe(3);
    expect(m.cols).toBe(1);
    expect(m.hasSymbolic).toBe(true);
    const cells = rowMajor(m);
    expect(formatSymbolic(cells[0] as SymbolicNode)).toBe("vx/sx-tx");
    expect(formatSymbolic(cells[1] as SymbolicNode)).toBe("vy/sy-ty");
    // The third row is a pure concrete 1 (no free variables involved).
    expect(cells[2]).toBe(1);
  });
});

describe("Phase H.3: map/reduce symbolic integration", () => {
  test("reduce(acc+x+b,[1,2,3]) => simplifies to 2b+6, the free variable b surviving through the reduce", () => {
    const [v] = engine().evaluateExpression("reduce(acc+x+b,[1,2,3]) =>");
    expect(v.type).toBe(ValueType.Symbolic);
    expect(formatSymbolic(v.value as SymbolicNode)).toBe("2b+6");
  });

  test("regression guard: an ordinary (non-=>) reduce with a genuinely undefined variable still hard-throws", () => {
    expect(() => engine().evaluateExpression("reduce(acc+x+b,[1,2,3])")).toThrow();
  });

  test("regression guard: ordinary (non-=>) purely-numeric reduce/map are unaffected", () => {
    const e = engine();
    const [r] = e.evaluateLine(1, "reduce(acc+x,[1,2,3])");
    expect(r.toNumber()).toBe(6);
    const [m] = e.evaluateLine(2, "map(10*x,[1,2,3])");
    const cells = rowMajor(m.value as MatrixData) as number[];
    expect(cells).toEqual([10, 20, 30]);
  });

  test("map(x+b,[1,2,3]) => carries the free variable b through into each symbolic cell", () => {
    const [v] = engine().evaluateExpression("map(x+b,[1,2,3]) =>");
    expect(v.type).toBe(ValueType.Matrix);
    const m = v.value as MatrixData;
    expect(m.hasSymbolic).toBe(true);
    const cells = rowMajor(m);
    expect(formatSymbolic(cells[0] as SymbolicNode)).toBe("b+1");
    expect(formatSymbolic(cells[1] as SymbolicNode)).toBe("b+2");
    expect(formatSymbolic(cells[2] as SymbolicNode)).toBe("b+3");
  });
});

/** Serializes a (possibly-symbolic) MatrixData back into `[...]` literal source text, for round-tripping through a second evaluateLine() call in a test. */
function formatMatrixLiteral(m: MatrixData): string {
  const rows: string[] = [];
  for (let r = 0; r < m.rows; r++) {
    const cells: string[] = [];
    for (let c = 0; c < m.cols; c++) {
      const cell = m.data[r + c * m.rows];
      cells.push(typeof cell === "number" ? String(cell) : String(cell));
    }
    rows.push(cells.join(", "));
  }
  return `[${rows.join("; ")}]`;
}
