import { describe, expect, test } from "@jest/globals";
import { checkPackageCompatibility } from "@solve-js/api/PackageCompatibility";
import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { BUILTIN_PACKAGES } from "@solve-js/packages/builtins";
import { PrefixParselet } from "@solve-js/parser/Parselet";

class NoopParselet implements PrefixParselet {
  readonly category = "Test";
  parse(): void { /* no-op — only used to exercise collision detection */ }
}

describe("checkPackageCompatibility", () => {
  test("two unrelated packages produce no conflicts", () => {
    const a: IEnginePackage = { name: "pkg-a", prefixParselets: [{ tokenType: "FOO", parselet: new NoopParselet() }] };
    const b: IEnginePackage = { name: "pkg-b", prefixParselets: [{ tokenType: "BAR", parselet: new NoopParselet() }] };
    const report = checkPackageCompatibility(b, [a]);
    expect(report.compatible).toBe(true);
    expect(report.conflicts).toHaveLength(0);
  });

  test("a package is never flagged against itself (by identity or by name)", () => {
    const a: IEnginePackage = { name: "pkg-a", prefixParselets: [{ tokenType: "FOO", parselet: new NoopParselet() }] };
    expect(checkPackageCompatibility(a, [a]).conflicts).toHaveLength(0);
    const aAgain: IEnginePackage = { name: "pkg-a", prefixParselets: [{ tokenType: "FOO", parselet: new NoopParselet() }] };
    expect(checkPackageCompatibility(aAgain, [a]).conflicts).toHaveLength(0);
  });

  test("colliding prefixParselets token type -> warning, still compatible", () => {
    const a: IEnginePackage = { name: "pkg-a", prefixParselets: [{ tokenType: "FOO", parselet: new NoopParselet() }] };
    const b: IEnginePackage = { name: "pkg-b", prefixParselets: [{ tokenType: "FOO", parselet: new NoopParselet() }] };
    const report = checkPackageCompatibility(b, [a]);
    expect(report.compatible).toBe(true);
    expect(report.conflicts).toEqual([
      expect.objectContaining({ kind: "prefixParseletTokenType", severity: "warning", packages: ["pkg-a", "pkg-b"] }),
    ]);
  });

  test("colliding infixParselets token type -> warning", () => {
    const a: IEnginePackage = { name: "pkg-a", infixParselets: [{ tokenType: "FOO", parselet: new NoopParselet() as any }] };
    const b: IEnginePackage = { name: "pkg-b", infixParselets: [{ tokenType: "FOO", parselet: new NoopParselet() as any }] };
    const report = checkPackageCompatibility(b, [a]);
    expect(report.conflicts[0]).toMatchObject({ kind: "infixParseletTokenType", severity: "warning" });
  });

  test("colliding phrase mapped to different token types -> warning", () => {
    const a: IEnginePackage = { name: "pkg-a", phrases: { "total of": "TOTAL_OF" } };
    const b: IEnginePackage = { name: "pkg-b", phrases: { "total of": "SUM_OF" } };
    const report = checkPackageCompatibility(b, [a]);
    expect(report.conflicts[0]).toMatchObject({ kind: "phrase", severity: "warning" });
  });

  test("identical phrase mapped to the SAME token type is not a conflict", () => {
    const a: IEnginePackage = { name: "pkg-a", phrases: { "total of": "TOTAL_OF" } };
    const b: IEnginePackage = { name: "pkg-b", phrases: { "total of": "TOTAL_OF" } };
    expect(checkPackageCompatibility(b, [a]).conflicts).toHaveLength(0);
  });

  test("colliding asConverters name (case-insensitive) -> warning", () => {
    const a: IEnginePackage = { name: "pkg-a", asConverters: { roman: (v) => v } };
    const b: IEnginePackage = { name: "pkg-b", asConverters: { Roman: (v) => v } };
    const report = checkPackageCompatibility(b, [a]);
    expect(report.conflicts[0]).toMatchObject({ kind: "converterName", severity: "warning" });
  });

  test("colliding pluginFunctions index -> error, NOT compatible", () => {
    const a: IEnginePackage = { name: "pkg-a", pluginFunctions: [{ index: 200, handler: (args) => args[0] }] };
    const b: IEnginePackage = { name: "pkg-b", pluginFunctions: [{ index: 200, handler: (args) => args[0] }] };
    const report = checkPackageCompatibility(b, [a]);
    expect(report.compatible).toBe(false);
    expect(report.conflicts[0]).toMatchObject({ kind: "pluginFunctionIndex", severity: "error" });
  });

  test("colliding lexer keyword mapped to different token types -> error, NOT compatible", () => {
    const a: IEnginePackage = { name: "pkg-a", lexerVocabulary: { keywords: { widget: "WIDGET" } } };
    const b: IEnginePackage = { name: "pkg-b", lexerVocabulary: { keywords: { widget: "GADGET" } } };
    const report = checkPackageCompatibility(b, [a]);
    expect(report.compatible).toBe(false);
    expect(report.conflicts[0]).toMatchObject({ kind: "lexerKeyword", severity: "error" });
  });

  test("colliding lexer operator mapped to different token types -> error", () => {
    const a: IEnginePackage = { name: "pkg-a", lexerVocabulary: { operators: { "~>": "SQUIGGLE" } } };
    const b: IEnginePackage = { name: "pkg-b", lexerVocabulary: { operators: { "~>": "TILDE_ARROW" } } };
    const report = checkPackageCompatibility(b, [a]);
    expect(report.conflicts[0]).toMatchObject({ kind: "lexerOperator", severity: "error" });
  });

  test("shared lexer unit word is NOT flagged (idempotent, no ambiguity)", () => {
    const a: IEnginePackage = { name: "pkg-a", lexerVocabulary: { units: ["gp"] } };
    const b: IEnginePackage = { name: "pkg-b", lexerVocabulary: { units: ["gp"] } };
    expect(checkPackageCompatibility(b, [a]).conflicts).toHaveLength(0);
  });

  test("colliding async resolver namespace -> error", () => {
    const resolver = { namespace: "weather", preflight: () => null } as any;
    const a: IEnginePackage = { name: "pkg-a", asyncResolvers: [resolver] };
    const b: IEnginePackage = { name: "pkg-b", asyncResolvers: [{ ...resolver }] };
    const report = checkPackageCompatibility(b, [a]);
    expect(report.compatible).toBe(false);
    expect(report.conflicts[0]).toMatchObject({ kind: "asyncResolverNamespace", severity: "error" });
  });

  test("colliding tokenCategories for the same token type -> info only, still compatible", () => {
    const a: IEnginePackage = { name: "pkg-a", tokenCategories: { WIDGET: "keyword" } };
    const b: IEnginePackage = { name: "pkg-b", tokenCategories: { WIDGET: "operator" } };
    const report = checkPackageCompatibility(b, [a]);
    expect(report.compatible).toBe(true);
    expect(report.conflicts[0]).toMatchObject({ kind: "tokenCategory", severity: "info" });
  });

  // Regression guard against the REAL shipped package set — if two actual
  // built-in packages ever started colliding, this test catches it
  // immediately rather than relying on someone noticing a console.warn.
  test("BUILTIN_PACKAGES have zero error-severity conflicts among each other", () => {
    for (let i = 0; i < BUILTIN_PACKAGES.length; i++) {
      const candidate = BUILTIN_PACKAGES[i];
      const others = BUILTIN_PACKAGES.filter((_, j) => j !== i);
      const report = checkPackageCompatibility(candidate, others);
      const errors = report.conflicts.filter((c) => c.severity === "error");
      expect(errors).toEqual([]);
    }
  });
});
