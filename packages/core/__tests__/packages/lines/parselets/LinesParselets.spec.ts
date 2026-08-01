/**
 * Cross-line data access — `prev`, `line<N>`, `sum(line X : line Y)`/
 * `total(...)`/`average(...)`, and `total above`/`sum above`/`average
 * above`. Every real-document test goes through the actual
 * ExpressionEngine + DocumentModel + ThreeTierEvaluator trio (not the
 * isolated parselet-registry harness) — this feature is fundamentally
 * about cross-line state, which the isolated harness has no way to
 * represent at all.
 */
import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { DocumentModel } from "@solve-js/engine/DocumentModel";
import { ThreeTierEvaluator } from "@solve-js/engine/ThreeTierEvaluator";
import { ValueType } from "@solve-js/vm/Value";
import { checkPackageCompatibility } from "@solve-js/api/PackageCompatibility";
import { LINES_PACKAGE } from "@solve-js/packages/lines";
import { BUILTIN_PACKAGES } from "@solve-js/packages/builtins";

function evalDoc(lines: string[]): DocumentModel {
  const engine = new ExpressionEngine();
  const doc = new DocumentModel();
  doc.setDocument(lines.join("\n"));
  const evaluator = new ThreeTierEvaluator(doc, engine);
  evaluator.evaluate({ startLine: 1, endLine: lines.length });
  return doc;
}

describe("prev", () => {
  test("prev on line 1 (no preceding line) is a clear error, not 0", () => {
    const doc = evalDoc(["prev"]);
    const result = doc.getLineAt(1)!.result!;
    expect(result.type).toBe(ValueType.Error);
  });

  test("prev references the immediately-preceding line's result", () => {
    const doc = evalDoc(["10 + 5", "prev + 1"]);
    expect(doc.getLineAt(2)!.result!.toNumber()).toBe(16);
  });

  test("prev works after a variable-definition line", () => {
    const doc = evalDoc([":x = 100", "prev * 2"]);
    expect(doc.getLineAt(2)!.result!.toNumber()).toBe(200);
  });

  test("prev outside a document (evaluateExpression) errors cleanly, not a crash or silent 0", () => {
    const engine = new ExpressionEngine();
    const [value] = engine.evaluateExpression("prev");
    expect(value.type).toBe(ValueType.Error);
  });
});

describe("line<N>", () => {
  test("line1 (glued) references line 1's result", () => {
    const doc = evalDoc(["42", "line1 + 8"]);
    expect(doc.getLineAt(2)!.result!.toNumber()).toBe(50);
  });

  test("line 1 (spaced) references line 1's result the same way", () => {
    const doc = evalDoc(["42", "line 1 + 8"]);
    expect(doc.getLineAt(2)!.result!.toNumber()).toBe(50);
  });

  test("forward reference (line 1 refers to line 3, not yet meaningfully evaluated) errors cleanly", () => {
    // line3's own text ("99") IS in the doc, but per this engine's
    // ascending-order evaluation (ARCHITECTURE.md §7), line 1 evaluates
    // BEFORE line 3 within the same pass — its result isn't stored yet
    // when line 1 runs.
    const doc = evalDoc(["line3 + 1", "0", "99"]);
    expect(doc.getLineAt(1)!.result!.type).toBe(ValueType.Error);
  });

  test("line<N> referencing an out-of-range line number errors cleanly", () => {
    const doc = evalDoc(["line99"]);
    expect(doc.getLineAt(1)!.result!.type).toBe(ValueType.Error);
  });

  test("regression guard: :line1 stays usable as a variable name", () => {
    const engine = new ExpressionEngine();
    engine.evaluateExpression(":line1 = 42");
    const [value] = engine.evaluateExpression(":line1 + 1");
    expect(value.toNumber()).toBe(43);
  });

  test("regression guard: :line stays usable as a variable name", () => {
    const engine = new ExpressionEngine();
    engine.evaluateExpression(":line = 7");
    const [value] = engine.evaluateExpression(":line + 1");
    expect(value.toNumber()).toBe(8);
  });
});

describe("sum/total/average range aggregation", () => {
  test("sum(line 1 : line 4) adds four lines", () => {
    const doc = evalDoc(["1", "2", "3", "4", "sum(line 1 : line 4)"]);
    expect(doc.getLineAt(5)!.result!.toNumber()).toBe(10);
  });

  test("total(line 1 : line 4) is a synonym for sum", () => {
    const doc = evalDoc(["1", "2", "3", "4", "total(line 1 : line 4)"]);
    expect(doc.getLineAt(5)!.result!.toNumber()).toBe(10);
  });

  test("average(line 1 : line 4) computes the mean", () => {
    const doc = evalDoc(["10", "20", "30", "40", "average(line 1 : line 4)"]);
    expect(doc.getLineAt(5)!.result!.toNumber()).toBe(25);
  });

  test("mixed units in a range error instead of silently coercing", () => {
    const doc = evalDoc(["1 kg", "1 m", "sum(line 1 : line 2)"]);
    expect(doc.getLineAt(3)!.result!.type).toBe(ValueType.Error);
  });

  test("regression guard: :sum stays usable as a variable name (no paren follows)", () => {
    const engine = new ExpressionEngine();
    engine.evaluateExpression(":sum = 5");
    const [value] = engine.evaluateExpression(":sum + 1");
    expect(value.toNumber()).toBe(6);
  });

  test("regression guard: MathPhrases' 'total of X, Y' is unaffected by the sum( fusion", () => {
    const engine = new ExpressionEngine();
    const [value] = engine.evaluateExpression("total of 1, 2, 3");
    expect(value.toNumber()).toBe(6);
  });
});

describe("total above / sum above / average above", () => {
  test("total above sums everything back to the top of the document", () => {
    const doc = evalDoc(["1", "2", "3", "total above"]);
    expect(doc.getLineAt(4)!.result!.toNumber()).toBe(6);
  });

  test("total above stops at a blank line", () => {
    const doc = evalDoc(["100", "", "1", "2", "total above"]);
    expect(doc.getLineAt(5)!.result!.toNumber()).toBe(3);
  });

  test("total above stops at a # heading", () => {
    const doc = evalDoc(["100", "# Section", "1", "2", "total above"]);
    expect(doc.getLineAt(5)!.result!.toNumber()).toBe(3);
  });

  test("average above computes the mean of the same range", () => {
    const doc = evalDoc(["10", "20", "average above"]);
    expect(doc.getLineAt(3)!.result!.toNumber()).toBe(15);
  });

  test("sum above with nothing above (immediately after a heading) errors cleanly", () => {
    const doc = evalDoc(["# Section", "sum above"]);
    expect(doc.getLineAt(2)!.result!.type).toBe(ValueType.Error);
  });
});

describe("Pending/Error short-circuiting (the P0-interaction guard)", () => {
  test("referencing a line whose result is an Error propagates a clear error, not 0", () => {
    // "1/0/0..." isn't a parse error, so use an actually-erroring line: an
    // undefined variable reference.
    const doc = evalDoc([":undefinedVar123", "prev + 1"]);
    expect(doc.getLineAt(1)!.result!.type).toBe(ValueType.Error);
    expect(doc.getLineAt(2)!.result!.type).toBe(ValueType.Error);
  });
});

describe("checkPackageCompatibility — LINES_PACKAGE vs BUILTIN_PACKAGES", () => {
  test("zero error-severity conflicts against the real shipped package set", () => {
    const others = BUILTIN_PACKAGES.filter((p) => p.name !== LINES_PACKAGE.name);
    const report = checkPackageCompatibility(LINES_PACKAGE, others);
    const errors = report.conflicts.filter((c) => c.severity === "error");
    expect(errors).toEqual([]);
  });
});

describe("package register/unregister round-trip", () => {
  test("prev still evaluates after unregister + re-register", () => {
    const engine = new ExpressionEngine();
    engine.unregisterPackage(LINES_PACKAGE.name);
    engine.registerPackage(LINES_PACKAGE);
    const doc = new DocumentModel();
    doc.setDocument("5\nprev + 1");
    const evaluator = new ThreeTierEvaluator(doc, engine);
    evaluator.evaluate({ startLine: 1, endLine: 2 });
    expect(doc.getLineAt(2)!.result!.toNumber()).toBe(6);
  });
});
