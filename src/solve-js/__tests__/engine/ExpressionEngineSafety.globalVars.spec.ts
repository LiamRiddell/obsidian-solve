import { describe, expect, test, afterEach } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { extractReadsAndWrites } from "@solve-js/engine/ExpressionEngineSafety";
import { sharedGlobalVariableStore, globalDagKey } from "@solve-js/vm/GlobalVariableStore";
import { numberValue } from "@solve-js/vm/Value";
import type { Token } from "@solve-js/lexer/Token";

/**
 * extractReadsAndWrites() feeds DependencyGraph.registerLine() — this is
 * the DAG-bookkeeping half of global variables (distinct from the VM
 * opcode/parselet wiring covered in GlobalVariableParselets.spec.ts). The
 * key correctness property under test: `global :name` must be tracked
 * under globalDagKey(name) ("global:name"), never under the plain `name`
 * key a local `:name` would use — otherwise a document with both would
 * have its local and global dependency edges silently merged.
 *
 * tokensFor() below evaluates the expression via the real engine pipeline
 * (matching what extractReadsAndWrites receives in production) — so any
 * global it READS must already be seeded into sharedGlobalVariableStore
 * first (GlobalVariableAsyncResolver, which handles the "not yet declared"
 * pending case, is covered separately and isn't wired into these
 * particular assertions — they're purely about DAG key extraction).
 */
describe("extractReadsAndWrites — global variable tracking", () => {
  afterEach(() => {
    sharedGlobalVariableStore.clear();
  });

  /** Tokenizes via the real engine pipeline, matching what extractReadsAndWrites receives in production. */
  function tokensFor(expr: string): Token[] {
    const engine = new ExpressionEngine("en", true);
    const result = engine.evaluateLineWithDebug(1, expr);
    const tokens = result.diagnostic!.tokens;
    engine.clear();
    return tokens;
  }

  test("a bare global read is tracked under globalDagKey(name), not the plain name", () => {
    sharedGlobalVariableStore.set("widgetCost", numberValue(1));
    const { reads } = extractReadsAndWrites(tokensFor("global :widgetCost"));
    expect(reads).toContain(globalDagKey("widgetCost"));
    expect(reads).not.toContain("widgetCost");
  });

  test("a global write is tracked as both a read and a write under globalDagKey(name)", () => {
    const { reads, writes } = extractReadsAndWrites(tokensFor("global :widgetCost = 100"));
    expect(reads).toContain(globalDagKey("widgetCost"));
    expect(writes).toContain(globalDagKey("widgetCost"));
  });

  test("a global read (no assignment) is a read but NOT a write", () => {
    sharedGlobalVariableStore.set("widgetCost", numberValue(1));
    const { reads, writes } = extractReadsAndWrites(tokensFor("global :widgetCost + 1"));
    expect(reads).toContain(globalDagKey("widgetCost"));
    expect(writes).not.toContain(globalDagKey("widgetCost"));
  });

  test("a local :name and a global :name of the same identifier produce distinct DAG keys on the same line", () => {
    // Two expressions can't share one line in the real grammar, but the
    // extraction function itself is line-agnostic — feed it the
    // concatenated token stream to prove no cross-contamination between
    // the two branches within a single extractReadsAndWrites() call.
    const localTokens = tokensFor(":x = 1");
    const globalTokens = tokensFor("global :x = 2");
    const { reads, writes } = extractReadsAndWrites([...localTokens, ...globalTokens]);

    expect(reads).toContain("x");
    expect(reads).toContain(globalDagKey("x"));
    expect(writes).toContain("x");
    expect(writes).toContain(globalDagKey("x"));
    // Exactly one of each — no double-counting from the guard logic.
    expect(reads.filter(r => r === "x").length).toBe(1);
    expect(reads.filter(r => r === globalDagKey("x")).length).toBe(1);
  });

  test("a global reference doesn't also register as a plain local read (no double-count from the bare-COLON branch)", () => {
    sharedGlobalVariableStore.set("hello", numberValue(1));
    const { reads } = extractReadsAndWrites(tokensFor("global :hello"));
    expect(reads).toEqual([globalDagKey("hello")]);
  });

  test("a global variable named after a known unit (UNIT token) is still tracked correctly", () => {
    const { reads, writes } = extractReadsAndWrites(tokensFor("global :b = 5"));
    expect(reads).toContain(globalDagKey("b"));
    expect(writes).toContain(globalDagKey("b"));
  });

  test("a document with only local variables is unaffected — no global: keys appear", () => {
    const { reads, writes } = extractReadsAndWrites(tokensFor(":x = 1 + 2"));
    expect(reads.every(r => !r.startsWith("global:"))).toBe(true);
    expect(writes.every(w => !w.startsWith("global:"))).toBe(true);
  });

  test("multiple distinct globals on a compound expression are all tracked", () => {
    sharedGlobalVariableStore.set("a", numberValue(1));
    sharedGlobalVariableStore.set("b", numberValue(2));
    const { reads } = extractReadsAndWrites(tokensFor("global :a + global :b"));
    expect(reads).toContain(globalDagKey("a"));
    expect(reads).toContain(globalDagKey("b"));
  });
});
