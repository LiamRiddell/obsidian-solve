/**
 * The three "required, not optional" risks a rough audit sketch of
 * user-defined functions originally missed, each independently confirmed
 * during implementation: a recursion-safety gap (localInstructionCount is
 * per-executeBytecode-call, so it can't catch recursion), a VMCheckpointer
 * gap (function definitions live in a separate registry from `variables`,
 * so a naive checkpoint/restore silently drops them), and a DAG
 * parameter-shadowing gap (a function's own parameter names must not
 * register as document-level read/write dependencies). See
 * `parser/BytecodeBuilder.ts`'s `UserFunctionDef` doc comment and
 * `vm/VMCheckpoints.ts`'s `VMCheckpoint.functions` doc comment for the
 * full reasoning behind each fix.
 */
import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { extractReadsAndWrites } from "@solve-js/engine/ExpressionEngineSafety";
import { DocumentModel } from "@solve-js/engine/DocumentModel";
import { ThreeTierEvaluator } from "@solve-js/engine/ThreeTierEvaluator";
import { VMCheckpointer } from "@solve-js/vm/VMCheckpoints";
import { ValueType } from "@solve-js/vm/Value";
import type { Token } from "@solve-js/lexer/Token";

/**
 * Tokenizes via the real engine pipeline, matching what extractReadsAndWrites
 * receives in production. `predefine`, if given, is evaluated first on the
 * SAME engine instance — needed for a CALL expression (`f(5)`), since
 * evaluateLineWithDebug only populates `.diagnostic` on a successful
 * execution, and calling an undefined function throws before that point.
 */
function tokensFor(expr: string, predefine?: string): Token[] {
  const engine = new ExpressionEngine("en", true);
  if (predefine) engine.evaluateExpression(predefine);
  const result = engine.evaluateLineWithDebug(1, expr);
  const tokens = result.diagnostic!.tokens;
  engine.clear();
  return tokens;
}

describe("recursion-depth guard", () => {
  test("self-recursion throws a clean, controlled error, not a native stack overflow or hang", () => {
    const engine = new ExpressionEngine("en");
    engine.evaluateExpression("f(x) = f(x)");
    expect(() => engine.evaluateExpression("f(1)")).toThrow(/recursion|depth/i);
  });

  test("nested (non-recursive) calls well under the limit still succeed", () => {
    const engine = new ExpressionEngine("en");
    engine.evaluateExpression("inc(x) = x + 1");
    const nestedCall = "inc(".repeat(10) + "0" + ")".repeat(10);
    const [value] = engine.evaluateExpression(nestedCall);
    expect(value.toNumber()).toBe(10);
  });
});

describe("DAG parameter-shadowing exclusion", () => {
  test("a function definition's parameter name is excluded from reads and writes", () => {
    const { reads, writes } = extractReadsAndWrites(tokensFor("f(x) = 2*x + 1"));
    expect(reads).not.toContain("x");
    expect(writes).not.toContain("x");
  });

  test("the function's own name IS registered as both a read and a write (mirrors :name = value)", () => {
    const { reads, writes } = extractReadsAndWrites(tokensFor("f(x) = 2*x + 1"));
    expect(reads).toContain("f");
    expect(writes).toContain("f");
  });

  test("a multi-parameter definition excludes every parameter name", () => {
    const { reads, writes } = extractReadsAndWrites(tokensFor("vol(l, w, h) = l * w * h"));
    for (const p of ["l", "w", "h"]) {
      expect(reads).not.toContain(p);
      expect(writes).not.toContain(p);
    }
    expect(reads).toContain("vol");
  });

  test("a function CALL's own name is a read (so it re-evaluates when the definition changes) but not a write", () => {
    const { reads, writes } = extractReadsAndWrites(tokensFor("f(5)", "f(x) = x"));
    expect(reads).toContain("f");
    expect(writes).not.toContain("f");
  });

  test("a genuinely unrelated document-level variable of the same name as a parameter is NOT shadowed on its OWN line", () => {
    // extractReadsAndWrites is called per-line -- an unrelated ":x = 100" on
    // its own line has no function-definition shape in ITS OWN tokens, so
    // the exclusion (scoped to lines that actually declare params) must not
    // leak across lines.
    const { reads, writes } = extractReadsAndWrites(tokensFor(":x = 100"));
    expect(reads).toContain("x");
    expect(writes).toContain("x");
  });

  test("end-to-end: an unrelated :x is unaffected by a same-named function parameter (no spurious DAG re-evaluation)", () => {
    const engine = new ExpressionEngine("en");
    engine.evaluateExpression(":x = 100");
    engine.evaluateExpression("f(x) = x * 2");
    const [callResult] = engine.evaluateExpression("f(5)");
    expect(callResult.toNumber()).toBe(10);
    const [outerX] = engine.evaluateExpression(":x + 1");
    expect(outerX.toNumber()).toBe(101);
  });
});

describe("v1 scope restriction: async function bodies are rejected at definition time", () => {
  test("a body containing any CALL_PLUGIN-flagged opcode (async or not) is rejected with a clear error", () => {
    // `prev` (packages/lines) is itself fully synchronous, but BytecodeBuilder's
    // hasAsync flag is conservatively set for ANY CALL_PLUGIN opcode, not just
    // genuinely-async ones -- the same blanket flag the engine already uses
    // elsewhere (e.g. skipping the O(n) resolver preflight for purely
    // synchronous expressions). A body that trips it is rejected rather than
    // silently risking the async-body gap the plan explicitly scoped out.
    const engine = new ExpressionEngine("en");
    expect(() => engine.evaluateExpression("f(x) = x + prev")).toThrow(/synchronous/i);
  });

  test("a synchronous body defines and calls normally (no false positive)", () => {
    const engine = new ExpressionEngine("en");
    engine.evaluateExpression("f(x) = x + 1");
    const [value] = engine.evaluateExpression("f(4)");
    expect(value.toNumber()).toBe(5);
  });
});

describe("VMCheckpointer scroll survival", () => {
  function createDoc(lines: string[]): DocumentModel {
    const doc = new DocumentModel();
    doc.setDocument(lines.join("\n"));
    return doc;
  }

  test("a function defined above the viewport is still callable after scrolling past its definition", () => {
    const doc = createDoc([
      "double(x) = 2 * x", // line 1: definition
      "1",                  // line 2
      "2",                  // line 3
      "3",                  // line 4
      "4",                  // line 5
      "double(10)",         // line 6: call, scrolled away from the definition
    ]);
    const engine = new ExpressionEngine("en");
    const checkpointer = new VMCheckpointer(engine.getVM());
    const evaluator = new ThreeTierEvaluator(doc, engine, checkpointer);

    // Full evaluation first (establishes checkpoints), then scroll the
    // viewport away from line 1 -- this is what triggers
    // VMCheckpointer.restoreTo(), which resets the VM and replays only the
    // checkpointed state. Before the fix, restoreTo() only replayed
    // `variables`, silently dropping `double`'s definition.
    evaluator.evaluateAll();
    evaluator.setViewport({ startLine: 4, endLine: 6 });

    const result = doc.getLineAt(6)!.result!;
    expect(result.type).not.toBe(ValueType.Error);
    expect(result.toNumber()).toBe(20);
  });

  test("redefining a function across a checkpoint boundary still replays the LATEST definition after scroll", () => {
    const doc = createDoc([
      "f(x) = x + 1",  // line 1
      "0",             // line 2
      "f(x) = x * 10", // line 3: redefinition
      "0",             // line 4
      "0",             // line 5
      "f(5)",          // line 6
    ]);
    const engine = new ExpressionEngine("en");
    const checkpointer = new VMCheckpointer(engine.getVM());
    const evaluator = new ThreeTierEvaluator(doc, engine, checkpointer);

    evaluator.evaluateAll();
    evaluator.setViewport({ startLine: 4, endLine: 6 });

    expect(doc.getLineAt(6)!.result!.toNumber()).toBe(50);
  });
});
