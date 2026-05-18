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
       getBindingPower(): number { return 10; },
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
        opcode: OpCode.PLUGIN_CUSTOM,
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
