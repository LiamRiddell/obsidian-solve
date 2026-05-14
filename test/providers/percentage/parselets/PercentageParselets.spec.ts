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
import { ValueType } from "@/engine/vm/Value";

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
  expect(result!.type).toBe(ValueType.Number);
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

  test("percentage increase: increase 100 by 10% = 110", () => {
    expect(parseAndExecute("increase 100 by 10%")).toBeCloseTo(110);
  });

  test("percentage decrease: decrease 100 by 10% = 90", () => {
    expect(parseAndExecute("decrease 100 by 10%")).toBeCloseTo(90);
  });

  test("percentage increase by 50%: increase 200 by 50% = 300", () => {
    expect(parseAndExecute("increase 200 by 50%")).toBeCloseTo(300);
  });

  test("percentage decrease by 25%: decrease 80 by 25% = 60", () => {
    expect(parseAndExecute("decrease 80 by 25%")).toBeCloseTo(60);
  });

  test("increase by phrase keyword: increase 100 by 10%", () => {
    expect(parseAndExecute("increase 100 by 10%")).toBeCloseTo(110);
  });

  test("decrease by phrase keyword: decrease 100 by 10%", () => {
    expect(parseAndExecute("decrease 100 by 10%")).toBeCloseTo(90);
  });

  test("percentage of with expression: 50% of (40 + 60) = 50", () => {
    expect(parseAndExecute("50% of (40 + 60)")).toBe(50);
  });

  test("percentage combined with arithmetic: 10% of 200 + 5 = 25", () => {
    expect(parseAndExecute("10% of 200 + 5")).toBe(25);
  });

  test("BODMAS with percentage: 50% of 200 + 10% of 100 = 110", () => {
    expect(parseAndExecute("50% of 200 + 10% of 100")).toBe(110);
  });

  test("percentage change: 800 to 1000 = 0.25 (25% increase)", () => {
    expect(parseAndExecute("800 to 1000")).toBeCloseTo(0.25, 10);
  });

  test("percentage change: 800 to 400 = -0.5 (-50% decrease)", () => {
    expect(parseAndExecute("800 to 400")).toBeCloseTo(-0.5, 10);
  });

  test("percentage change: 50 to 75 = 0.5 (50% increase)", () => {
    expect(parseAndExecute("50 to 75")).toBeCloseTo(0.5, 10);
  });

  test("percentage change: 200 to 100 = -0.5 (-50% decrease)", () => {
    expect(parseAndExecute("200 to 100")).toBeCloseTo(-0.5, 10);
  });
});