import { describe, expect, test, beforeEach, afterEach } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { ValueType } from "@solve-js/vm/Value";
import { sharedCurrencyExchange } from "@solve-js/uom/CurrencyExchange";
import { CurrencyAsyncResolver } from "@solve-js/uom/CurrencyResolver";
import { formatValue } from "@solve-js/format/FormatEngine";
import { createVM, executeBytecode, unwrapEvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { OpCode } from "@solve-js/parser/OpCode";

function bc(ops: number[], numbers: number[] = [], strings: string[] = []): { opcodes: Uint8Array; numbers: Float64Array; strings: string[] } {
  return { opcodes: new Uint8Array(ops), numbers: new Float64Array(numbers), strings };
}

/**
 * Bug (reported live): "0.01 BTC + 1 ETH" silently evaluated to a bare,
 * unitless "1.01" — the naive sum of the raw magnitudes with both
 * currencies' identity dropped — instead of either converting correctly
 * or surfacing an error. The user also expected (and didn't get) a
 * Pending -> Resolved async cycle, the same as any other currency lookup.
 *
 * Root causes (three separate, compounding bugs):
 *
 * 1. CurrencyExchangeService had no crypto price source at all — every
 *    getRate() call, crypto or fiat, went through Frankfurter (ECB fiat
 *    rates only, no BTC/ETH concept). Fixed by routing crypto codes
 *    through CoinGecko instead (see CurrencyExchange.spec.ts).
 *
 * 2. CurrencyAsyncResolver.preflight() only scanned the bytecode for
 *    UOM_CONVERT_IN/UOM_CONVERT_TO (the explicit "X to Y"/"X in Y"
 *    syntax) — arithmetic directly on two currency-denominated UOM
 *    literals ("0.01 BTC + 1 ETH") never triggered a preflight fetch at
 *    all, so the VM always ran with zero cached rate and no chance to go
 *    Pending first.
 *
 * 3. VMConversion.ts's binaryOp(), when unifyUom() couldn't reconcile two
 *    UOM operands (unit: undefined, sameMeasure: false — the exact state
 *    "no cached rate" produces), still unconditionally computed
 *    `uomValue(op(lv, rv), unit!)` — silently summing the raw numbers and
 *    wrapping them in a Uom Value with unit `undefined`, which read as a
 *    confident (wrong) result instead of the missing-data case it was.
 */
describe("Bug: crypto currency arithmetic silently produced a wrong unitless number", () => {
  let engine: ExpressionEngine;

  beforeEach(() => {
    engine = new ExpressionEngine("en", false);
  });

  afterEach(() => {
    engine.clear();
    sharedCurrencyExchange.clearRates();
  });

  test("with rates available, '0.01 BTC + 1 ETH' converts correctly instead of naively summing 0.01 + 1", () => {
    // Simulates the state *after* a successful async fetch — the fix's
    // happy path once CoinGecko has answered.
    sharedCurrencyExchange.primeRates("BTC", { ETH: 20 }); // 1 BTC = 20 ETH
    const [result] = engine.evaluateLine(1, "0.01 BTC + 1 ETH");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("BTC");
    // 0.01 BTC + (1 ETH -> BTC at 1/20) = 0.01 + 0.05 = 0.06 BTC — NOT 1.01.
    expect(result.toNumber()).toBeCloseTo(0.06, 10);
  });

  test("same-measure units still combine normally (regression guard)", () => {
    const [result] = engine.evaluateLine(1, "1 kg + 500 g");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.toNumber()).toBeCloseTo(1.5, 5);
  });
});

/**
 * Hand-crafted bytecode for `0.01 BTC + 1 ETH` / `5 kg + 3 m`, bypassing
 * ExpressionEngine's preflight (which now correctly intercepts any
 * mixed-currency arithmetic and returns Pending before the VM ever runs
 * — see the preflight describe block below). This isolates the exact
 * binaryOp() fallback branch that used to silently sum raw magnitudes.
 */
describe("VM surfaces incompatible/unresolved units as an Error value instead of silently combining them", () => {
  test("ADD of two currencies with no cached rate produces an Error, not a silent 1.01", () => {
    const vm = createVM(sharedOpRegistry);
    const result = executeBytecode(
      bc(
        [
          OpCode.PUSH_NUMBER, 0, OpCode.PUSH_STRING, 0, OpCode.UOM_CONVERT,
          OpCode.PUSH_NUMBER, 1, OpCode.PUSH_STRING, 1, OpCode.UOM_CONVERT,
          OpCode.ADD, OpCode.HALT,
        ],
        [0.01, 1],
        ["BTC", "ETH"],
      ),
      vm,
    );
    const value = unwrapEvalResult(result);
    expect(value.type).toBe(ValueType.Error);
    // The old bug: naively summing 0.01 + 1 and wrapping it as an
    // unlabeled Uom value (type Uom, unit undefined), which read as a
    // confident (wrong) answer instead of a real Error value.
    expect(value.type).not.toBe(ValueType.Uom);

    const displayed = formatValue(value);
    expect(displayed).not.toContain("INCOMPATIBLE_UNITS"); // raw code, not the message
    expect(displayed.toLowerCase()).toContain("incompatible units");
    expect(displayed).toContain("BTC");
    expect(displayed).toContain("ETH");
  });

  test("ADD of genuinely incompatible measures (kg + m) also produces an Error", () => {
    const vm = createVM(sharedOpRegistry);
    const result = executeBytecode(
      bc(
        [
          OpCode.PUSH_NUMBER, 0, OpCode.PUSH_STRING, 0, OpCode.UOM_CONVERT,
          OpCode.PUSH_NUMBER, 1, OpCode.PUSH_STRING, 1, OpCode.UOM_CONVERT,
          OpCode.ADD, OpCode.HALT,
        ],
        [5, 3],
        ["kg", "m"],
      ),
      vm,
    );
    const value = unwrapEvalResult(result);
    expect(value.type).toBe(ValueType.Error);
    expect(formatValue(value).toLowerCase()).toContain("incompatible units");
  });
});

describe("Bug: preflight never detected currency arithmetic, only explicit to/in conversions", () => {
  let engine: ExpressionEngine;
  let resolver: CurrencyAsyncResolver;
  let queryClient: { getQueryData: () => undefined; fetchQuery: () => Promise<unknown> };

  beforeEach(() => {
    engine = new ExpressionEngine("en", false);
    resolver = new CurrencyAsyncResolver();
    // preflight() only needs fetchQuery's SYNCHRONOUS return shape (a
    // thenable to stash as AsyncCheckResult.resolver) — it never awaits
    // it here. Deliberately NOT invoking the real queryFn: doing so
    // would fire a genuine network request to CoinGecko on every test
    // run, which previously crashed the process after tests completed
    // with an unhandled rejection once the API got rate-limited (429).
    queryClient = {
      getQueryData: () => undefined,
      fetchQuery: () => Promise.resolve(),
    };
  });

  afterEach(() => {
    engine.clear();
  });

  test("preflight fires for ADD between two different currencies (the reported bug)", () => {
    const debug = engine.evaluateLineWithDebug(1, "0.01 BTC + 1 ETH");
    expect(debug.program).toBeDefined();
    const check = resolver.preflight(debug.tokens ?? [], debug.program!, "currency", new AbortController().signal, queryClient as any);
    expect(check).not.toBeNull();
    expect(check!.queryKey).toContain("BTC");
    expect(check!.queryKey).toContain("ETH");
  });

  test("preflight fires for SUB/MUL/DIV between two different currencies too", () => {
    for (const expr of ["1 BTC - 1 ETH", "1 BTC * 2", "1 BTC / 1 ETH"]) {
      const debug = engine.evaluateLineWithDebug(1, expr);
      // Only the mixed-currency cases (SUB, DIV) must trigger preflight;
      // "1 BTC * 2" has no second currency operand and shouldn't.
      const check = resolver.preflight(debug.tokens ?? [], debug.program!, "currency", new AbortController().signal, queryClient as any);
      if (expr.includes("ETH")) {
        expect(check).not.toBeNull();
      }
    }
  });

  test("preflight does NOT fire for same-currency arithmetic (regression guard, no wasted fetch)", () => {
    const debug = engine.evaluateLineWithDebug(1, "10 USD + 20 USD");
    const check = resolver.preflight(debug.tokens ?? [], debug.program!, "currency", new AbortController().signal, queryClient as any);
    expect(check).toBeNull();
  });

  test("preflight still fires for the original explicit 'X to Y' case (no regression)", () => {
    const debug = engine.evaluateLineWithDebug(1, "100 EUR to USD");
    const check = resolver.preflight(debug.tokens ?? [], debug.program!, "currency", new AbortController().signal, queryClient as any);
    expect(check).not.toBeNull();
  });
});
