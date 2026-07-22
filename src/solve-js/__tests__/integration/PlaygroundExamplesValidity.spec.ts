import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { sharedCurrencyExchange } from "@solve-js/uom/CurrencyExchange";
import { ValueType } from "@solve-js/vm/Value";
import { exampleData, fullDocumentExamples } from "../../../../playground/src/examples";

/**
 * Validates every example the playground ships (the single-line snippet
 * library and the multi-line "full document" examples) against the real
 * engine. This is exactly the gap that let broken content ship silently:
 * nothing exercised these strings through ExpressionEngine before a human
 * clicked them in the browser. Found and fixed via this suite:
 *   - "135lbs to kg" (Workout Tracker) — "lbs" isn't a recognized unit
 *     (only "lb" is, per the project's no-aliases policy); fixed the
 *     example content to say "lb".
 *   - The entire CryptoCurrency category (12 examples, "1 BTC to USD" etc.)
 *     — see Issue_CryptoUnitsUnrecognized.spec.ts for the underlying
 *     lexer fix.
 *   - "Fitness Body Measurements" lines using "to in" — see
 *     Issue_ToConversionOfVariable.spec.ts for the underlying parser fix.
 *
 * Currency/crypto rates are primed so these run deterministically offline
 * (no network) instead of resolving Pending — a real fetch is exercised
 * by the live OSRS/currency integration paths elsewhere, not here.
 */
function primeAllRates(): void {
  sharedCurrencyExchange.primeRates("USD", { EUR: 0.92, GBP: 0.79, JPY: 150 });
  sharedCurrencyExchange.primeRates("EUR", { USD: 1.08, GBP: 0.85, JPY: 163 });
  sharedCurrencyExchange.primeRates("GBP", { USD: 1.27, EUR: 1.17 });
  sharedCurrencyExchange.primeRates("BTC", { USD: 60000, ETH: 20, EUR: 55000 });
  sharedCurrencyExchange.primeRates("ETH", { USD: 3000, BTC: 0.05 });
  sharedCurrencyExchange.primeRates("SOL", { USD: 140 });
  sharedCurrencyExchange.primeRates("DOGE", { USD: 0.12 });
}

/**
 * Examples that are intentionally NOT self-contained: they demonstrate a
 * concept assuming state from a DIFFERENT example (e.g. "Variable in
 * expression" reads :myVar, defined by the separate "Simple variable"
 * example). Clicking either individually replaces the whole editor, so
 * this one throws in isolation by design — it's meant to be read as a
 * two-step tutorial pair, not run standalone.
 */
const KNOWN_STATEFUL_SNIPPETS = new Set(["Variable in expression"]);

describe("Playground example content is valid against the real engine", () => {
  test("every single-line example evaluates without throwing", () => {
    primeAllRates();
    const failures: string[] = [];
    for (const category of exampleData) {
      for (const ex of category.examples) {
        if (KNOWN_STATEFUL_SNIPPETS.has(ex.name)) continue;
        const engine = new ExpressionEngine("en", false);
        try {
          const [result] = engine.evaluateLine(1, ex.expression);
          if (result.type === ValueType.Error) {
            failures.push(`[${category.name} / ${ex.name}] "${ex.expression}" -> Error value`);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          failures.push(`[${category.name} / ${ex.name}] "${ex.expression}" THREW: ${msg}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  test("every full-document example evaluates every line without throwing", () => {
    primeAllRates();
    const failures: string[] = [];
    for (const doc of fullDocumentExamples) {
      const engine = new ExpressionEngine("en", false);
      const lines = doc.content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed) continue;
        try {
          const [result] = engine.evaluateLine(i + 1, trimmed);
          if (result.type === ValueType.Error) {
            failures.push(`[${doc.name}] line ${i + 1} "${trimmed}" -> Error value`);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          failures.push(`[${doc.name}] line ${i + 1} "${trimmed}" THREW: ${msg}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
