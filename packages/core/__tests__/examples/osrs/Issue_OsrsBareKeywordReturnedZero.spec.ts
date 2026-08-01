import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { ValueType } from "@solve-js/vm/Value";
import { BUILTIN_PACKAGES } from "@solve-js/packages/builtins";
import { OSRS_PACKAGE } from "@solve-js-examples/osrs/OsrsPackage";

/**
 * Bug: typing the bare word "osrs" (or "osrs" followed by anything that
 * isn't a recognized item name) silently evaluated to the number 0 —
 * indistinguishable from a genuine "this item costs 0 gp" result, and with
 * "No errors" shown in the playground. Reported live: "just typing osrs = 0?
 * why? it didn't match any pattern."
 *
 * Root cause: OsrsKeywordParselet.parse() (src/solve-js/examples/osrs/
 * OsrsParselet.ts) had three fallback branches — bare keyword with nothing
 * following, keyword followed by a non-item word, and osrs.ge(...)/
 * osrs.price(...) with an unrecognized argument — that all silently emitted
 * `PUSH_NUMBER 0` instead of reporting that the input didn't match any
 * supported OSRS syntax. Fixed by throwing a parse error (matching the
 * established convention elsewhere in the parser, e.g. VariableParselet)
 * so malformed OSRS syntax surfaces as an actual error instead of a fake
 * zero-gp price.
 *
 * OSRS is an example package, not a built-in, so every engine here must
 * explicitly register it alongside the built-ins.
 */
function createEngineWithOsrs(): ExpressionEngine {
  return new ExpressionEngine("en", false, undefined, undefined, [...BUILTIN_PACKAGES, OSRS_PACKAGE]);
}

describe("Bug: bare 'osrs' keyword silently evaluated to 0 instead of erroring", () => {
  test("'osrs' alone reports a parse error, not 0", () => {
    const engine = createEngineWithOsrs();
    const result = engine.evaluateLineWithDebug(1, "osrs");
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/Expected an OSRS item name/);
  });

  test("'osrs' followed by a non-item word reports a parse error, not 0", () => {
    const engine = createEngineWithOsrs();
    const result = engine.evaluateLineWithDebug(1, "osrs Blarg");
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/Expected an OSRS item name/);
  });

  test("'osrs.ge()' with no argument reports a parse error, not 0", () => {
    const engine = createEngineWithOsrs();
    const result = engine.evaluateLineWithDebug(1, "osrs.ge()");
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/Expected a quoted item name/);
  });

  test("regression guard: a genuine item name still evaluates normally, no error", () => {
    const engine = createEngineWithOsrs();
    const result = engine.evaluateLineWithDebug(1, "osrs Iron Axe");
    // Either resolves synchronously or goes Pending awaiting the price
    // fetch — either way it must NOT be a parse error.
    expect(result.error).toBeUndefined();
    expect([ValueType.Uom, ValueType.Pending]).toContain(result.value.type);
  });
});
