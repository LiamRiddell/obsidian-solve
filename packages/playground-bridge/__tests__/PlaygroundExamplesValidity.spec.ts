import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { DocumentModel } from "@solve-js/engine/DocumentModel";
import { sharedCurrencyExchange } from "@solve-js/uom/CurrencyExchange";
import { ValueType } from "@solve-js/vm/Value";
import { sharedGlobalVariableStore } from "@solve-js/vm/GlobalVariableStore";
import { exampleData, fullDocumentExamples, multiDocumentExamples } from "@bridge/examples";
import { PLAYGROUND_PACKAGES, runEngine } from "@bridge/engine";

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
 * Examples that are intentionally NOT self-contained. Empty for now: the
 * one entry that used to live here ("Variable in expression", which read
 * :myVar without defining it — clicking it standalone threw "Undefined
 * variable: myVar" since insertExample() replaces the whole editor) was
 * fixed by making the example content itself self-contained
 * (":myVar = 10\n:myVar + 5") instead of documenting the gap here.
 * Left as an escape hatch for any future example that's genuinely meant
 * to be read as part of a multi-example tutorial sequence.
 */
const KNOWN_STATEFUL_SNIPPETS = new Set<string>([]);

describe("Playground example content is valid against the real engine", () => {
  test("every single-line example evaluates without throwing", () => {
    primeAllRates();
    const failures: string[] = [];
    for (const category of exampleData) {
      for (const ex of category.examples) {
        if (KNOWN_STATEFUL_SNIPPETS.has(ex.name)) continue;
        const engine = new ExpressionEngine("en", false, undefined, undefined, PLAYGROUND_PACKAGES);
        // Example content may itself be multi-line (e.g. a variable defined
        // on one line and used on the next, to stay self-contained when
        // insertExample() replaces the whole editor) — evaluate line by
        // line like the full-document examples below, instead of passing
        // the whole string (with embedded newlines) to a single
        // evaluateLine() call.
        //
        // A DocumentModel is wired in (mirroring runEngine()'s own fix in
        // engine.ts) so cross-line data access (packages/lines: prev,
        // line<N>, sum/total/average ranges, total above) can actually read
        // a preceding line's result instead of every reference erroring
        // with "no document" — this loop DOES evaluate a real multi-line
        // document, just without the incremental-caching machinery
        // (ThreeTierEvaluator) that normally owns DocumentModel updates.
        const doc = new DocumentModel();
        doc.setDocument(ex.expression);
        engine.setDocumentModel(doc);
        const exampleLines = ex.expression.split("\n");
        for (let i = 0; i < exampleLines.length; i++) {
          const trimmed = exampleLines[i].trim();
          if (!trimmed) continue;
          const lineNum = i + 1;
          try {
            const [result] = engine.evaluateLine(lineNum, trimmed);
            const lineState = doc.getLineAt(lineNum);
            if (lineState) lineState.result = result;
            if (result.type === ValueType.Error) {
              failures.push(`[${category.name} / ${ex.name}] "${trimmed}" -> Error value`);
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            failures.push(`[${category.name} / ${ex.name}] "${trimmed}" THREW: ${msg}`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  /**
   * The test above deliberately bypasses runEngine()/shouldEvaluateLine()
   * and calls engine.evaluateLine() directly — it proves the engine CAN
   * evaluate this content, but not that a real playground/webapp session
   * would ever actually reach it. That gap is exactly what let
   * "weather in Tokyo" ship silently broken: shouldEvaluateLine()'s
   * prose-gate heuristic (no digit/symbol + multi-word => assumed prose)
   * rejected it before the engine ever saw it, and nothing in this file
   * would have caught that, since it never goes through the gate at all.
   * This test closes that gap by running every example through the real
   * runEngine() entry point instead, so any future example this specific
   * class of bug affects fails loudly here.
   */
  test("every single-line example also gets past the playground's line-classifier (shouldEvaluateLine), not silently skipped as prose", () => {
    primeAllRates();
    const failures: string[] = [];
    for (const category of exampleData) {
      for (const ex of category.examples) {
        if (KNOWN_STATEFUL_SNIPPETS.has(ex.name)) continue;
        const expectedLineCount = ex.expression
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 0).length;
        const { lineResults } = runEngine(ex.expression);
        if (lineResults.length !== expectedLineCount) {
          failures.push(
            `[${category.name} / ${ex.name}] "${ex.expression}" -> expected ${expectedLineCount} line result(s), got ${lineResults.length} (some line(s) were silently skipped by shouldEvaluateLine)`
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  test("every full-document example evaluates every line without throwing", () => {
    primeAllRates();
    const failures: string[] = [];
    for (const example of fullDocumentExamples) {
      const engine = new ExpressionEngine("en", false);
      // See the single-line test above for why a DocumentModel is wired in.
      const documentModel = new DocumentModel();
      documentModel.setDocument(example.content);
      engine.setDocumentModel(documentModel);
      const lines = example.content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed) continue;
        const lineNum = i + 1;
        try {
          const [result] = engine.evaluateLine(lineNum, trimmed);
          const lineState = documentModel.getLineAt(lineNum);
          if (lineState) lineState.result = result;
          if (result.type === ValueType.Error) {
            failures.push(`[${example.name}] line ${lineNum} "${trimmed}" -> Error value`);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          failures.push(`[${example.name}] line ${lineNum} "${trimmed}" THREW: ${msg}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  /**
   * Multi-document sets are the only examples whose correctness depends on
   * something OUTSIDE their own text: the `global :name` values published by
   * the sibling documents in the same set. Evaluating each document with its
   * own engine — but against the shared, process-wide global store — is what
   * the webapp actually does (one engine per tab, one store per process), so
   * this catches a set whose reader references a global no sibling declares,
   * or whose documents are listed reader-before-writer.
   *
   * Pending is a failure here, not a pass: a reader left Pending after every
   * document in the set has been evaluated means nothing ever declared the
   * global it is waiting on.
   */
  test("every multi-document example resolves — each document's globals are visible to its siblings", () => {
    sharedGlobalVariableStore.clear();
    const failures: string[] = [];
    for (const example of multiDocumentExamples) {
      // Isolate each set: a global left over from an earlier set must not be
      // what makes this one appear to work.
      sharedGlobalVariableStore.clear();
      for (const document of example.documents) {
        const engine = new ExpressionEngine("en", false);
        const documentModel = new DocumentModel();
        documentModel.setDocument(document.content);
        engine.setDocumentModel(documentModel);
        const lines = document.content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const trimmed = lines[i].trim();
          if (!trimmed) continue;
          const lineNum = i + 1;
          const where = `[${example.name} / ${document.title}] line ${lineNum} "${trimmed}"`;
          try {
            const [result] = engine.evaluateLine(lineNum, trimmed);
            const lineState = documentModel.getLineAt(lineNum);
            if (lineState) lineState.result = result;
            if (result.type === ValueType.Error) {
              failures.push(`${where} -> Error value`);
            } else if (result.type === ValueType.Pending) {
              failures.push(`${where} -> still Pending (no sibling document declares the global it reads)`);
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            failures.push(`${where} THREW: ${msg}`);
          }
        }
      }
    }
    sharedGlobalVariableStore.clear();
    expect(failures).toEqual([]);
  });

  test("every multi-document example is actually multi-document, with unique tab titles", () => {
    const failures: string[] = [];
    for (const example of multiDocumentExamples) {
      if (example.documents.length < 2) {
        failures.push(`[${example.name}] has ${example.documents.length} document(s) — use fullDocumentExamples instead`);
      }
      const titles = example.documents.map((d) => d.title);
      if (new Set(titles).size !== titles.length) {
        failures.push(`[${example.name}] has duplicate document titles: ${titles.join(", ")}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
