import { describe, expect, it } from "@jest/globals";
import { solveAPI, SolveAPI } from "@/engine/api/SolveAPI";
import type { ISolvePackage, ISolveAPI } from "@/engine/api/SolveAPI";
import { OpCode } from "@/engine/parser/OpCode";
import { PrefixParselet, InfixParselet } from "@/engine/parser/Parselet";
import { Parser } from "@/engine/parser/Parser";
import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { Token } from "@/engine/lexer/Token";
import { createGrammarDSL, GrammarDSL } from "@/engine/compiler/GrammarDSL";

describe("SolveAPI ISolvePackage", () => {
  it("exports ISolveAPI interface", () => {
    const api: ISolveAPI = solveAPI;
    expect(api.registerPrefixParselet).toBeDefined();
    expect(api.registerInfixParselet).toBeDefined();
    expect(api.registerOpcodeHandler).toBeDefined();
    expect(api.registerVariableSource).toBeDefined();
    expect(api.registerPackage).toBeDefined();
  });

  it("supports registerPackage with prefix parselets", () => {
    const testParselet: PrefixParselet = {
      parse(_parser: Parser, _token: Token, _builder: BytecodeBuilder): void {}
    };
    const pkg: ISolvePackage = {
      name: "test-package",
      prefixParselets: [{ tokenType: "TEST_PREFIX", parselet: testParselet }],
    };
    expect(() => solveAPI.registerPackage(pkg)).not.toThrow();
  });

  it("supports registerPackage with infix parselets", () => {
    const testParselet: InfixParselet = {
      parse(_parser: Parser, _left: Token, _token: Token, _builder: BytecodeBuilder): void {},
      getBindingPower(): number { return 10; },
    };
    const pkg: ISolvePackage = {
      name: "test-package",
      infixParselets: [{ tokenType: "TEST_INFIX", parselet: testParselet }],
    };
    expect(() => solveAPI.registerPackage(pkg)).not.toThrow();
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
    expect(() => solveAPI.registerPackage(pkg)).not.toThrow();
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
    expect(() => solveAPI.registerPackage(pkg)).not.toThrow();
  });

  it("handles empty package gracefully", () => {
    const pkg: ISolvePackage = { name: "empty-package" };
    expect(() => solveAPI.registerPackage(pkg)).not.toThrow();
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