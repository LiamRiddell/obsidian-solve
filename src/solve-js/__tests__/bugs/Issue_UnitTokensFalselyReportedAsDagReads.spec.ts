import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { extractReadsAndWrites } from "@solve-js/engine/ExpressionEngineSafety";
import type { Token } from "@solve-js/lexer/Token";

/**
 * Bug: any bare quantity/conversion expression using a unit or currency
 * code — e.g. "500 EUR to JPY" — reported "EUR" and "JPY" as DAG variable
 * reads in the Read/Write and DAG Registration pipeline stages, even
 * though the compiled bytecode never loads any such variable (both unit
 * names compile to PUSH_STRING for UOM_CONVERT_TO, confirmed via the
 * Bytecode tab). Found live in the playground's Pipeline tab: DAG
 * Registration showed "Reads: EUR, JPY" for a plain currency conversion
 * with zero actual variables anywhere in the document.
 *
 * Root cause: extractReadsAndWrites() (ExpressionEngineSafety.ts) flagged
 * every UNIT-typed token as a variable read, using only the token's TYPE
 * (a UNIT token can legitimately be a variable name that collides with a
 * known unit, e.g. "b" for bits) without checking whether the token was
 * actually in variable position. UomLiteralParselet/ConvertParselet/
 * PercentageChangeParselet all consume a UNIT token as a unit-of-measure
 * literal (PUSH_STRING) whenever it directly follows a NUMBER, RPAREN, or
 * a TO/IN conversion keyword — extractReadsAndWrites had no equivalent
 * check, so it flagged these unconditionally.
 *
 * Fix: skip a UNIT token when the immediately preceding token is NUMBER,
 * RPAREN, TO, or IN — the same positions the real parselets treat as
 * unit-literal context — while still flagging a bare UNIT token as a read
 * everywhere else, preserving the legitimate "variable name collides with
 * a unit" case (e.g. `b + 1` where `:b` was defined earlier).
 */
describe("Bug: unit tokens in quantity/conversion position falsely reported as DAG reads", () => {
  /** Tokenizes via the real engine pipeline (lexer + normalizer), matching exactly what extractReadsAndWrites receives in production. */
  function tokensFor(expr: string): Token[] {
    const engine = new ExpressionEngine("en", true);
    const result = engine.evaluateLineWithDebug(1, expr);
    const tokens = result.diagnostic!.tokens;
    engine.clear();
    return tokens;
  }

  test("extractReadsAndWrites: '500 EUR to JPY' reports no reads", () => {
    const { reads, writes } = extractReadsAndWrites(tokensFor("500 EUR to JPY"));
    expect(reads).toEqual([]);
    expect(writes).toEqual([]);
  });

  test("extractReadsAndWrites: '100cm to m' (literal unit conversion) reports no reads", () => {
    const { reads } = extractReadsAndWrites(tokensFor("100cm to m"));
    expect(reads).toEqual([]);
  });

  test("extractReadsAndWrites: '(3 + 4) km' (parenthesized quantity) reports no reads", () => {
    const { reads } = extractReadsAndWrites(tokensFor("(3 + 4) km"));
    expect(reads).toEqual([]);
  });

  test("extractReadsAndWrites: still reports a bare unit-colliding token as a read outside unit-literal position", () => {
    // "b" collides with the "bits" unit but is used here as a bare
    // standalone operand (not preceded by a number/paren/to/in), so it's
    // legitimately a variable reference and must still be tracked. Defined
    // first via ":b = 5" so evaluating the bare reference afterward doesn't
    // throw "Undefined variable: b" (which would short-circuit before the
    // diagnostic pipeline reaches the readwrite/dag_registration stages).
    const engine = new ExpressionEngine("en", true);
    engine.evaluateLineWithDebug(1, ":b = 5");
    const { reads } = extractReadsAndWrites(engine.evaluateLineWithDebug(2, "b + 1").diagnostic!.tokens);
    engine.clear();
    expect(reads).toContain("b");
  });

  test("extractReadsAndWrites: colon-prefixed variable reads/writes are unaffected", () => {
    const { reads, writes } = extractReadsAndWrites(tokensFor(":total = 5"));
    expect(reads).toContain("total");
    expect(writes).toContain("total");
  });

  // Uses a plain physical-unit conversion rather than a currency pair — a
  // currency conversion goes through the async resolver, so unless a rate
  // is already cached the pipeline halts at async_preflight (pending) and
  // never reaches dag_registration at all, which would make this test
  // depend on live network access. "500 km to mi" hits the exact same
  // UNIT-token code path in extractReadsAndWrites without any async hop.

  test("end-to-end: DAG Registration stage reports no reads/writes for '500 km to mi'", () => {
    const engine = new ExpressionEngine("en", true);
    const result = engine.evaluateLineWithDebug(1, "500 km to mi");
    const dagStage = result.diagnostic!.stages.find((s) => s.stage === "dag_registration");
    expect(dagStage).toBeDefined();
    const output = dagStage!.output as { readsRegistered: string[]; writesRegistered: string[] };
    expect(output.readsRegistered).toEqual([]);
    expect(output.writesRegistered).toEqual([]);
    engine.clear();
  });

  test("end-to-end: Read/Write stage reports no reads/writes for '500 km to mi'", () => {
    const engine = new ExpressionEngine("en", true);
    const result = engine.evaluateLineWithDebug(1, "500 km to mi");
    const rwStage = result.diagnostic!.stages.find((s) => s.stage === "readwrite");
    expect(rwStage).toBeDefined();
    const output = rwStage!.output as { reads: string[]; writes: string[] };
    expect(output.reads).toEqual([]);
    expect(output.writes).toEqual([]);
    engine.clear();
  });
});
