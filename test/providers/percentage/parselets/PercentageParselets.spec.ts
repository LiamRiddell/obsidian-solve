import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@/engine/lexer/Lexer";
import { TokenTypes } from "@/engine/lexer/Token";
import { Parser } from "@/engine/parser/Parser";
import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { registerArithmeticParselets } from "@/providers/arithmetic/parselets/index";
import { registerPercentageParselets } from "@/providers/percentage/parselets/index";
import { createVM, executeBytecode } from "@/engine/vm/VM";
import { sharedOpRegistry } from "@/engine/vm/OpRegistry";

function tokenize(lexer: Lexer, input: string) {
  lexer.reset(input);
  const tokens = [];
  for (const t of lexer) {
    if (t.type === TokenTypes.WS) continue;
    tokens.push(t);
  }
  return tokens;
}

function parseAndExecute(input: string): number {
  const lexer = new Lexer();
  const tokens = tokenize(lexer, input);
  const registry = new ParseletRegistry();
  registerArithmeticParselets(registry);
  registerPercentageParselets(registry);
  const parser = new Parser(registry);
  const builder = new BytecodeBuilder();
  parser.load(tokens);
  parser.parseExpression(0, builder);
  const program = builder.build();
  const vmUint8 = new Uint8Array(program.opcodes);
  const vmFloat64 = new Float64Array(program.numbers);
  const vm = createVM(sharedOpRegistry);
  const result = executeBytecode(
    { opcodes: vmUint8, numbers: vmFloat64, strings: program.strings },
    vm
  );
  return result!.toNumber();
}

describe("Percentage Parselets", () => {
  test("standalone percentage: 50% = 0.5", () => {
    expect(parseAndExecute("50%")).toBe(0.5);
  });

  test("standalone percentage: 10% = 0.1", () => {
    expect(parseAndExecute("10%")).toBe(0.1);
  });

  test("integer percentage: 100% = 1", () => {
    expect(parseAndExecute("100%")).toBe(1);
  });

  test("percentage addition: 50% + 10%", () => {
    expect(parseAndExecute("50% + 10%")).toBe(0.6);
  });

  test("percentage in expression: 50 + 20%", () => {
    expect(parseAndExecute("50 + 20%")).toBe(50.2);
  });

  test("percentage of: 10% of 20", () => {
    expect(parseAndExecute("10% of 20")).toBe(2);
  });

  test("percentage of: 50% of 200", () => {
    expect(parseAndExecute("50% of 200")).toBe(100);
  });

  test("percentage multiplication: 50% * 100", () => {
    expect(parseAndExecute("50% * 100")).toBe(50);
  });

  test("percentage division: 50% / 25%", () => {
    expect(parseAndExecute("50% / 25%")).toBe(2);
  });
});