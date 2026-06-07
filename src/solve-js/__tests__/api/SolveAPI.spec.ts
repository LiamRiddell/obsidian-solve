/**
 * SolveAPI — Integration Tests
 *
 * Tests the user-facing ISolve API:
 * - Package registration (prefix/infix parselets, opcode handlers, variable sources)
 * - LexerPlugin integration (keywords, operators, units, phrases)
 * - Combined lexer+parselet packages
 * - GrammarDSL DSL helpers for defining parselets programmatically
 */

import { describe, expect, it } from "@jest/globals";
import { solve } from "@solve-js/api/SolveAPI";
import type { ISolvePackage, ISolve } from "@solve-js/api/SolveAPI";
import { OpCode } from "@solve-js/parser/OpCode";
import { PrefixParselet, InfixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { Token } from "@solve-js/lexer/Token";
import { createGrammarDSL, GrammarDSL } from "@solve-js/compiler/GrammarDSL";
import { sharedLexer } from "@solve-js/lexer/Lexer";

describe("Solve ISolvePackage", () => {
  it("exports ISolve interface", () => {
    const api: ISolve = solve;
    expect(api.registerPrefixParselet).toBeDefined();
    expect(api.registerInfixParselet).toBeDefined();
    expect(api.registerOpcodeHandler).toBeDefined();
    expect(api.registerVariableSource).toBeDefined();
    expect(api.registerPackage).toBeDefined();
  });

it("supports registerPackage with prefix parselets", () => {
     const testParselet: PrefixParselet = {
       category: "Test",
       parse(_parser: Parser, _token: Token, _builder: BytecodeBuilder): void {}
     };
     const pkg: ISolvePackage = {
       name: "test-package",
       prefixParselets: [{ tokenType: "TEST_PREFIX", parselet: testParselet }],
     };
     expect(() => solve.registerPackage(pkg)).not.toThrow();
   });

   it("supports registerPackage with infix parselets", () => {
     const testParselet: InfixParselet = {
       category: "Test",
       parse(_parser: Parser, _left: Token, _token: Token, _builder: BytecodeBuilder): void {},
       bindingPower: 10,
     };
    const pkg: ISolvePackage = {
      name: "test-package",
      infixParselets: [{ tokenType: "TEST_INFIX", parselet: testParselet }],
    };
    expect(() => solve.registerPackage(pkg)).not.toThrow();
  });

  it("supports registerPackage with opcode handlers", () => {
    const pkg: ISolvePackage = {
      name: "test-package",
      opcodeHandlers: [{
        opcode: OpCode.CALL_PLUGIN,
        handler: () => 0,
        pluginName: "test",
      }],
    };
    expect(() => solve.registerPackage(pkg)).not.toThrow();
  });

  it("supports registerPackage with variable sources", () => {
    const pkg: ISolvePackage = {
      name: "test-package",
      variableSources: [{
        name: "test-source",
        priority: 1,
        get: async () => 42,
        set: async () => {},
      }],
    };
    expect(() => solve.registerPackage(pkg)).not.toThrow();
  });

  it("handles empty package gracefully", () => {
    const pkg: ISolvePackage = { name: "empty-package" };
    expect(() => solve.registerPackage(pkg)).not.toThrow();
  });

  it("supports registerPackage with lexerPlugin keywords", () => {
    const testKeyword = "__test_custom_ns__";
    const pkg: ISolvePackage = {
      name: "test-lexer-package",
      lexerPlugin: {
        keywords: { [testKeyword]: "TEST_CUSTOM_NS" },
      },
    };

    expect(() => solve.registerPackage(pkg)).not.toThrow();

    sharedLexer.reset(testKeyword);
    const tokens = Array.from(sharedLexer);
    expect(tokens.length).toBeGreaterThanOrEqual(1);
    expect(tokens[0].type).toBe("TEST_CUSTOM_NS");
    expect(tokens[0].value).toBe(testKeyword);
  });

  it("supports registerPackage with lexerPlugin two-char operators", () => {
    const pkg: ISolvePackage = {
      name: "test-lexer-op-package",
      lexerPlugin: {
        operators: { "::": "DOUBLE_COLON" },
      },
    };

    expect(() => solve.registerPackage(pkg)).not.toThrow();

    sharedLexer.reset("a::b");
    const tokens = Array.from(sharedLexer);
    const doubleColonToken = tokens.find(t => t.type === "DOUBLE_COLON");
    expect(doubleColonToken).toBeDefined();
    expect(doubleColonToken!.value).toBe("::");
  });

  it("supports registerPackage with lexerPlugin units", () => {
    const pkg: ISolvePackage = {
      name: "test-lexer-unit-package",
      lexerPlugin: {
        units: ["tile"],
      },
    };

    expect(() => solve.registerPackage(pkg)).not.toThrow();

    sharedLexer.reset("tile");
    const tokens = Array.from(sharedLexer);
    expect(tokens.length).toBeGreaterThanOrEqual(1);
    expect(tokens[0].type).toBe("UNIT");
    expect(tokens[0].value).toBe("tile");
  });

  it("supports registerPackage with normalizer rules", () => {
    const pkg: ISolvePackage = {
      name: "test-normalizer-package",
      normalizerRules: [{
        name: "test-rule",
        priority: 100,
        match: (_tokens: Token[], _pos: number) => null,
      }],
    };

    expect(() => solve.registerPackage(pkg)).not.toThrow();
  });

  it("combines lexerPlugin with prefix parselets in one package", () => {
    const testKeyword = "__test_combined__";
    const testParselet: PrefixParselet = {
      category: "Test",
      parse(_parser: Parser, _token: Token, _builder: BytecodeBuilder): void {},
    };
    const pkg: ISolvePackage = {
      name: "test-combined-package",
      lexerPlugin: {
        keywords: { [testKeyword]: "COMBINED_TEST" },
      },
      prefixParselets: [{ tokenType: "COMBINED_TEST", parselet: testParselet }],
    };

    expect(() => solve.registerPackage(pkg)).not.toThrow();

    // Verify lexer plugin took effect
    sharedLexer.reset(testKeyword);
    const tokens = Array.from(sharedLexer);
    expect(tokens[0].type).toBe("COMBINED_TEST");
  });
});

describe("GrammarDSL", () => {
  it("can be created from a registry", () => {
    const registry = new ParseletRegistry();
    const dsl = createGrammarDSL(registry);
    expect(dsl).toBeInstanceOf(GrammarDSL);
  });

  it("can define an infix parselet", () => {
    const registry = new ParseletRegistry();
    const dsl = createGrammarDSL(registry);
    dsl.defineInfix("PLUS", 10, OpCode.ADD);
    expect(registry.hasInfix("PLUS")).toBe(true);
  });

  it("can define a prefix parselet from rule", () => {
    const registry = new ParseletRegistry();
    const dsl = createGrammarDSL(registry);
    dsl.definePrefixFromRule(
      "NEGATE",
      () => {},
      "MINUS"
    );
    expect(registry.hasPrefix("MINUS")).toBe(true);
  });

  it("can register token op mapping", () => {
    const registry = new ParseletRegistry();
    const dsl = createGrammarDSL(registry);
    dsl.registerTokenOp("CUSTOM_OP", OpCode.ADD);
    dsl.defineInfix("CUSTOM_OP", 20);
    expect(registry.hasInfix("CUSTOM_OP")).toBe(true);
  });
});
