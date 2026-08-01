import { describe, expect, test, afterEach } from "@jest/globals";
import { CurrencyExchangeService } from "@solve-js/uom/CurrencyExchange";
import { createVM, executeBytecode, unwrapEvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { OpCode } from "@solve-js/parser/OpCode";
import { ValueType } from "@solve-js/vm/Value";

function bc(ops: number[], numbers: number[] = [], strings: string[] = []): { opcodes: Uint8Array; numbers: Float64Array; strings: string[] } {
  return { opcodes: new Uint8Array(ops), numbers: new Float64Array(numbers), strings };
}

/**
 * Bug: currency conversion never worked at all — not for edge cases, for
 * EVERY pair, every time.
 *
 * Root cause: CurrencyExchangeService.getRate() parsed the exchange-rate
 * API response as `data.rates[code]`, assuming the classic Frankfurter v1
 * shape `{ base, date, rates: { CODE: rate, ... } }`. The actual live
 * endpoint this code calls (api.frankfurter.dev/v2/rates) returns a flat
 * ARRAY of `{ date, base, quote, rate }` entries instead — so `data.rates`
 * was always `undefined`, and getRate() always threw "Unknown currency: X"
 * regardless of which currencies were requested. The existing test suite
 * didn't catch this because its fetch mock used the old object shape,
 * which was never validated against the real API.
 *
 * Compounding bug: when convertSync() found no cached rate (which, given
 * the above, was always), VM.ts's UOM_CONVERT_TO/UOM_CONVERT_IN handlers
 * silently pushed the ORIGINAL unconverted value under its ORIGINAL unit
 * instead of surfacing an error — so "450 EUR to USD" displayed as
 * "450.00 EUR", reading as a successful no-op conversion rather than a
 * missing-data failure. Found live in the playground: a multi-line document
 * chaining `:subtotalUSD = :subtotalEUR to USD` through several dependent
 * lines silently carried the EUR unit through the entire rest of the chain,
 * including a variable literally named `:totalCostUSD`.
 *
 * Traced end-to-end with a live network call (see the Jest run this was
 * diagnosed with): preflight() and the async batcher's event stream both
 * behave correctly — the "two-way bind" from async resolution back to the
 * line result works — the data layer was just always failing.
 */
describe("Bug: currency conversion always failed due to API response shape mismatch", () => {
  describe("CurrencyExchangeService parses the real v2 array response shape", () => {
    let fx: CurrencyExchangeService;
    let originalFetch: typeof global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    test("getRate succeeds against the actual API response shape (array of {date, base, quote, rate})", async () => {
      fx = new CurrencyExchangeService();
      originalFetch = global.fetch;
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { date: "2026-07-22", base: "EUR", quote: "AED", rate: 4.1967 },
            { date: "2026-07-22", base: "EUR", quote: "USD", rate: 1.0842 },
            { date: "2026-07-22", base: "EUR", quote: "GBP", rate: 0.8623 },
          ]),
        } as Response),
      );

      const rate = await fx.getRate("EUR", "USD");
      expect(rate).toBe(1.0842);
    });

    test("getRateSync serves the array-parsed table synchronously after a fetch", async () => {
      fx = new CurrencyExchangeService();
      originalFetch = global.fetch;
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { date: "2026-07-22", base: "EUR", quote: "USD", rate: 1.0842 },
          ]),
        } as Response),
      );

      expect(fx.getRateSync("EUR", "USD")).toBeNull();
      await fx.getRate("EUR", "USD");
      expect(fx.getRateSync("EUR", "USD")).toBe(1.0842);
    });

    test("still accepts the legacy object shape ({ rates: { CODE: rate } }) if the API ever reverts", async () => {
      fx = new CurrencyExchangeService();
      originalFetch = global.fetch;
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ base: "EUR", date: "2026-07-22", rates: { USD: 1.0842 } }),
        } as Response),
      );

      const rate = await fx.getRate("EUR", "USD");
      expect(rate).toBe(1.0842);
    });
  });

  describe("VM surfaces a missing rate as an Error value instead of a silent wrong-unit passthrough", () => {
    // Hand-crafted bytecode for `450 EUR to USD`, bypassing ExpressionEngine's
    // preflight (which would otherwise intercept this and return Pending
    // before the VM ever runs). This isolates the exact VM.ts fallback
    // branch that used to silently push the unconverted value.
    test("UOM_CONVERT_TO with no cached rate produces an Error, not an unconverted EUR value", () => {
      const vm = createVM(sharedOpRegistry);
      const result = executeBytecode(
        bc(
          [OpCode.PUSH_NUMBER, 0, OpCode.PUSH_STRING, 0, OpCode.PUSH_STRING, 1, OpCode.UOM_CONVERT_TO, OpCode.HALT],
          [450],
          ["EUR", "USD"],
        ),
        vm,
      );
      const value = unwrapEvalResult(result);
      expect(value.type).toBe(ValueType.Error);
      // Must NOT be the old silent-fallback behavior (val unchanged, unit unchanged).
      expect(value.unit).not.toBe("EUR");
    });

    test("UOM_CONVERT_IN with no cached rate produces an Error, not an unconverted EUR value", () => {
      const vm = createVM(sharedOpRegistry);
      const result = executeBytecode(
        bc(
          [OpCode.PUSH_NUMBER, 0, OpCode.PUSH_STRING, 0, OpCode.UOM_CONVERT, OpCode.PUSH_STRING, 1, OpCode.UOM_CONVERT_IN, OpCode.HALT],
          [450],
          ["EUR", "USD"],
        ),
        vm,
      );
      const value = unwrapEvalResult(result);
      expect(value.type).toBe(ValueType.Error);
    });
  });
});
