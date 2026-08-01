/**
 * PackageRegistry — Integration Tests
 *
 * Tests the user-facing IPackageRegistry API:
 * - Package registration (prefix/infix parselets, variable sources)
 * - LexerVocabulary integration (keywords, operators, units, phrases)
 * - Combined lexer+parselet packages
 */

import { describe, expect, it } from "@jest/globals";
import { packageRegistry } from "@solve-js/api/PackageRegistry";
import type { IEnginePackage, IPackageRegistry } from "@solve-js/api/PackageRegistry";
import { PrefixParselet, InfixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { Token } from "@solve-js/lexer/Token";
import { sharedLexer } from "@solve-js/lexer/Lexer";

describe("PackageRegistry IEnginePackage", () => {
  it("exports IPackageRegistry interface", () => {
    const api: IPackageRegistry = packageRegistry;
    expect(api.registerPrefixParselet).toBeDefined();
    expect(api.registerInfixParselet).toBeDefined();
    expect(api.registerVariableSource).toBeDefined();
    expect(api.registerPackage).toBeDefined();
  });

it("supports registerPackage with prefix parselets", () => {
     const testParselet: PrefixParselet = {
       category: "Test",
       parse(_parser: Parser, _token: Token, _builder: BytecodeBuilder): void {}
     };
     const pkg: IEnginePackage = {
       name: "test-package",
       prefixParselets: [{ tokenType: "TEST_PREFIX", parselet: testParselet }],
     };
     expect(() => packageRegistry.registerPackage(pkg)).not.toThrow();
   });

   it("supports registerPackage with infix parselets", () => {
     const testParselet: InfixParselet = {
       category: "Test",
       parse(_parser: Parser, _left: Token, _token: Token, _builder: BytecodeBuilder): void {},
       bindingPower: 10,
     };
    const pkg: IEnginePackage = {
      name: "test-package",
      infixParselets: [{ tokenType: "TEST_INFIX", parselet: testParselet }],
    };
    expect(() => packageRegistry.registerPackage(pkg)).not.toThrow();
  });

  it("supports registerPackage with variable sources", () => {
    const pkg: IEnginePackage = {
      name: "test-package",
      variableSources: [{
        name: "test-source",
        priority: 1,
        get: async () => 42,
        set: async () => {},
      }],
    };
    expect(() => packageRegistry.registerPackage(pkg)).not.toThrow();
  });

  it("handles empty package gracefully", () => {
    const pkg: IEnginePackage = { name: "empty-package" };
    expect(() => packageRegistry.registerPackage(pkg)).not.toThrow();
  });

  it("supports registerPackage with lexerVocabulary keywords", () => {
    const testKeyword = "__test_custom_ns__";
    const pkg: IEnginePackage = {
      name: "test-lexer-package",
      lexerVocabulary: {
        keywords: { [testKeyword]: "TEST_CUSTOM_NS" },
      },
    };

    expect(() => packageRegistry.registerPackage(pkg)).not.toThrow();

    sharedLexer.reset(testKeyword);
    const tokens = Array.from(sharedLexer);
    expect(tokens.length).toBeGreaterThanOrEqual(1);
    expect(tokens[0].type).toBe("TEST_CUSTOM_NS");
    expect(tokens[0].value).toBe(testKeyword);
  });

  it("supports registerPackage with lexerVocabulary two-char operators", () => {
    const pkg: IEnginePackage = {
      name: "test-lexer-op-package",
      lexerVocabulary: {
        operators: { "::": "DOUBLE_COLON" },
      },
    };

    expect(() => packageRegistry.registerPackage(pkg)).not.toThrow();

    sharedLexer.reset("a::b");
    const tokens = Array.from(sharedLexer);
    const doubleColonToken = tokens.find(t => t.type === "DOUBLE_COLON");
    expect(doubleColonToken).toBeDefined();
    expect(doubleColonToken!.value).toBe("::");
  });

  it("supports registerPackage with lexerVocabulary units", () => {
    const pkg: IEnginePackage = {
      name: "test-lexer-unit-package",
      lexerVocabulary: {
        units: ["tile"],
      },
    };

    expect(() => packageRegistry.registerPackage(pkg)).not.toThrow();

    sharedLexer.reset("tile");
    const tokens = Array.from(sharedLexer);
    expect(tokens.length).toBeGreaterThanOrEqual(1);
    expect(tokens[0].type).toBe("UNIT");
    expect(tokens[0].value).toBe("tile");
  });

  it("supports registerPackage with normalizer rules", () => {
    const pkg: IEnginePackage = {
      name: "test-normalizer-package",
      normalizerRules: [{
        name: "test-rule",
        priority: 100,
        match: (_tokens: Token[], _pos: number) => null,
      }],
    };

    expect(() => packageRegistry.registerPackage(pkg)).not.toThrow();
  });

  it("combines lexerVocabulary with prefix parselets in one package", () => {
    const testKeyword = "__test_combined__";
    const testParselet: PrefixParselet = {
      category: "Test",
      parse(_parser: Parser, _token: Token, _builder: BytecodeBuilder): void {},
    };
    const pkg: IEnginePackage = {
      name: "test-combined-package",
      lexerVocabulary: {
        keywords: { [testKeyword]: "COMBINED_TEST" },
      },
      prefixParselets: [{ tokenType: "COMBINED_TEST", parselet: testParselet }],
    };

    expect(() => packageRegistry.registerPackage(pkg)).not.toThrow();

    // Verify lexer plugin took effect
    sharedLexer.reset(testKeyword);
    const tokens = Array.from(sharedLexer);
    expect(tokens[0].type).toBe("COMBINED_TEST");
  });

  // This shared-singleton path had NO compatibility checking of any kind
  // before the engine-version gate was added (see api/EngineVersionCompatibility.ts)
  // — proving it's gated here too closes what would otherwise be a trivial
  // bypass of ExpressionEngine.registerPackage()'s equivalent gate.
  it("rejects a package whose declared engineVersion the running engine doesn't satisfy", () => {
    const pkg: IEnginePackage = { name: "too-old-or-new-package", engineVersion: "^99.0.0" };
    expect(() => packageRegistry.registerPackage(pkg)).toThrow();
  });

  it("still registers a package with no declared engineVersion (backward compatible default)", () => {
    const pkg: IEnginePackage = { name: "no-version-declared-package" };
    expect(() => packageRegistry.registerPackage(pkg)).not.toThrow();
  });
});
