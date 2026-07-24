import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { ValueType } from "@solve-js/vm/Value";
import { sharedCurrencyExchange } from "@solve-js/uom/CurrencyExchange";

/**
 * Bug (found via a full audit of every playground example): "0.0001 BTC
 * to USD" evaluated to a bare "0" (type Number) instead of "6.00 USD"
 * (type Uom) — silently wrong, with no error.
 *
 * Root cause: ExpressionLexer's thousands-separator heuristic treats a
 * "." followed by exactly 3 digits as a grouping separator (so "1.234"
 * tokenizes as one NUMBER "1.234", matching a European-style grouped
 * integer). It didn't check what came AFTER those 3 digits — for
 * "0.0001", it consumed ".000" as a fake group and left the trailing "1"
 * to tokenize as a second, unrelated NUMBER token. The parser then
 * silently evaluated only the first token ("0.000" == 0) and dropped
 * everything after it, rather than erroring. Fixed in ExpressionLexer.ts.
 *
 * A second, related bug surfaced while writing this file's regression
 * guard for the multi-group case ("1.234.567"): that one tokenizes
 * correctly as a single NUMBER, but its VALUE came out as 1.234, not
 * 1234567. PrecedenceParser.ts's inline NUMBER_ID fast path (the code
 * path real evaluation actually uses — NumberParselet.parse(), which has
 * a near-identical implementation, is registered but dead for real
 * evaluation; see its own doc comment) only strips the ACTIVE locale's
 * configured thousandsSeparator character — "," for the default "en"
 * locale — so a chained "." grouped literal fell through to
 * `parseFloat()` untouched, which stops at the second "." and silently
 * truncated the rest. Fixed in PrecedenceParser.ts (mirrored in
 * NumberParselet.ts for consistency, even though it's unreachable in
 * practice).
 *
 * See ExpressionLexer.numbers-operators.spec.ts for the token-level
 * regression tests; this file verifies both fixes at the full
 * evaluation level.
 */
describe("Bug: '0.0001 BTC to USD' evaluated to a bare 0 instead of a real quantity", () => {
  test("0.0001 BTC to USD converts correctly", () => {
    sharedCurrencyExchange.primeRates("BTC", { USD: 60000 });
    const engine = new ExpressionEngine("en", false);
    const [result] = engine.evaluateLine(1, "0.0001 BTC to USD");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("USD");
    expect(result.toNumber()).toBeCloseTo(6, 10);
    engine.clear();
    sharedCurrencyExchange.clearRates();
  });

  test("small decimals with 4+ fractional digits evaluate as a single number in plain arithmetic too", () => {
    const engine = new ExpressionEngine("en", false);
    const [result] = engine.evaluateLine(1, "0.0001 + 1");
    expect(result.type).toBe(ValueType.Number);
    expect(result.toNumber()).toBeCloseTo(1.0001, 10);
    engine.clear();
  });

  test("chained dot thousands-groups (2+) evaluate to the real grouped integer, not a truncated decimal", () => {
    const engine = new ExpressionEngine("en", false);
    const [result] = engine.evaluateLine(1, "1.234.567");
    expect(result.type).toBe(ValueType.Number);
    expect(result.toNumber()).toBe(1234567);
    engine.clear();
  });

  test("a single dot group (ambiguous case) is deliberately left as a decimal, unchanged", () => {
    // "1.234" alone could mean 1234 (grouped) or 1.234 (three-decimal
    // fraction) — this fix intentionally only targets the unambiguous
    // 2+-group case above; existing behavior here is unchanged.
    const engine = new ExpressionEngine("en", false);
    const [result] = engine.evaluateLine(1, "1.234");
    expect(result.type).toBe(ValueType.Number);
    expect(result.toNumber()).toBeCloseTo(1.234, 10);
    engine.clear();
  });
});
