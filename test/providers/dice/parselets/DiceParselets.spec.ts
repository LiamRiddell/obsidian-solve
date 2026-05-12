import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@/engine/lexer/Lexer";
import { TokenTypes } from "@/engine/lexer/Token";
import { Parser } from "@/engine/parser/Parser";
import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { registerArithmeticParselets } from "@/providers/arithmetic/parselets/index";
import { registerDiceParselets } from "@/providers/dice/parselets/index";
import { createVM, executeBytecode } from "@/engine/vm/VM";
import { sharedOpRegistry } from "@/engine/vm/OpRegistry";
import { Value, ValueType } from "@/engine/vm/Value";

function tokenize(lexer: Lexer, input: string) {
  lexer.reset(input);
  const tokens = [];
  for (const t of lexer) {
    if (t.type === TokenTypes.WS || t.type === "NEWLINE") continue;
    tokens.push(t);
  }
  return tokens;
}

function parseAndExecute(input: string): Value {
  const lexer = new Lexer();
  const tokens = tokenize(lexer, input);
  const registry = new ParseletRegistry();
  registerArithmeticParselets(registry);
  registerDiceParselets(registry);
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
  return result!;
}

describe("Dice Parselets", () => {
  test("roll(1, 6) returns a number between 1 and 6", () => {
    for (let i = 0; i < 20; i++) {
      const result = parseAndExecute("roll(1, 6)");
      expect(result.type).toBe(ValueType.Number);
      const val = result.toNumber();
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(6);
    }
  });

  test("roll(0, 10) returns a number between 0 and 10", () => {
    for (let i = 0; i < 20; i++) {
      const result = parseAndExecute("roll(0, 10)");
      const val = result.toNumber();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(10);
    }
  });

  test("roll(5, 5) always returns 5", () => {
    const result = parseAndExecute("roll(5, 5)");
    expect(result.toNumber()).toBe(5);
  });

  test("roll(1, 6) + 10 uses dice in expression", () => {
    for (let i = 0; i < 10; i++) {
      const result = parseAndExecute("roll(1, 6) + 10");
      const val = result.toNumber();
      expect(val).toBeGreaterThanOrEqual(11);
      expect(val).toBeLessThanOrEqual(16);
    }
  });

  test("roll in expression: roll(2, 5) * 2", () => {
    for (let i = 0; i < 10; i++) {
      const result = parseAndExecute("roll(2, 5) * 2");
      const val = result.toNumber();
      expect(val % 2).toBe(0);
      expect(val).toBeGreaterThanOrEqual(4);
      expect(val).toBeLessThanOrEqual(10);
    }
  });

  test("roll with exponential: roll(1, 2) ^ 3", () => {
    for (let i = 0; i < 10; i++) {
      const result = parseAndExecute("roll(1, 2) ^ 3");
      const val = result.toNumber();
      expect(val === 1 || val === 8).toBe(true);
    }
  });

  test("from keyword: from parselet registration", () => {
    const lexer = new Lexer();
    lexer.reset("from 1 to 10");
    const types: string[] = [];
    for (const t of lexer) {
      if (t.type === "WS") continue;
      types.push(t.type);
    }
    expect(types).toContain("FROM");
  });

  test("between keyword: between parselet registration", () => {
    const lexer = new Lexer();
    lexer.reset("between 1 and 10");
    const types: string[] = [];
    for (const t of lexer) {
      if (t.type === "WS") continue;
      types.push(t.type);
    }
    expect(types).toContain("BETWEEN");
  });
});