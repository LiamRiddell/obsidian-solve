import { registerPackageForTesting } from "@tools/testUtils";
import { ARITHMETIC_PACKAGE, DICE_PACKAGE } from "@solve-js/packages";
import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@solve-js/lexer/Lexer";
import { TokenTypes } from "@solve-js/lexer/Token";
import { Parser } from "@solve-js/parser/Parser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";


import { createVM, executeBytecode, unwrapEvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { Value, ValueType } from "@solve-js/vm/Value";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

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
  registerPackageForTesting(ARITHMETIC_PACKAGE, registry);
  registerPackageForTesting(DICE_PACKAGE, registry);
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
  return unwrapEvalResult(result);
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

  test("roll between 1 and 6 returns a number between 1 and 6", () => {
    for (let i = 0; i < 20; i++) {
      const result = parseAndExecute("roll between 1 and 6");
      expect(result.type).toBe(ValueType.Number);
      const val = result.toNumber();
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(6);
    }
  });

  test("roll from 2 to 6 returns a number between 2 and 6", () => {
    for (let i = 0; i < 20; i++) {
      const result = parseAndExecute("roll from 2 to 6");
      expect(result.type).toBe(ValueType.Number);
      const val = result.toNumber();
      expect(val).toBeGreaterThanOrEqual(2);
      expect(val).toBeLessThanOrEqual(6);
    }
  });

  test("roll between 1 and 1 always returns 1", () => {
    const result = parseAndExecute("roll between 1 and 1");
    expect(result.toNumber()).toBe(1);
  });

  // ── Bare hyphen range: "roll 4-8" (wiki: Dice — no keyword, no parens) ──
  // Previously unsupported: DiceRollParselet only recognized BETWEEN/FROM
  // keywords or a leading LPAREN, so "roll 4-8" threw a parse error
  // ("Expected token type LPAREN but got NUMBER").

  test("roll 4-8 returns a number between 4 and 8", () => {
    for (let i = 0; i < 20; i++) {
      const result = parseAndExecute("roll 4-8");
      expect(result.type).toBe(ValueType.Number);
      const val = result.toNumber();
      expect(val).toBeGreaterThanOrEqual(4);
      expect(val).toBeLessThanOrEqual(8);
    }
  });

  test("roll 0-7 returns a number between 0 and 7", () => {
    for (let i = 0; i < 20; i++) {
      const result = parseAndExecute("roll 0-7");
      const val = result.toNumber();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(7);
    }
  });

  test("roll 5-5 always returns 5", () => {
    const result = parseAndExecute("roll 5-5");
    expect(result.toNumber()).toBe(5);
  });

  test("roll 4-8 in expression: roll 4-8 + 10", () => {
    for (let i = 0; i < 10; i++) {
      const result = parseAndExecute("roll 4-8 + 10");
      const val = result.toNumber();
      expect(val).toBeGreaterThanOrEqual(14);
      expect(val).toBeLessThanOrEqual(18);
    }
  });
});

describe("DICE_PACKAGE — real engine wiring", () => {
  test("roll 4-8 works via the real, default-constructed ExpressionEngine", () => {
    const engine = new ExpressionEngine("en");
    for (let i = 0; i < 10; i++) {
      const [value] = engine.evaluateExpression("roll 4-8");
      const val = value.toNumber();
      expect(val).toBeGreaterThanOrEqual(4);
      expect(val).toBeLessThanOrEqual(8);
    }
  });

  test("roll(1, 6) and roll between 1 and 6 still work via the real engine", () => {
    const engine = new ExpressionEngine("en");
    const [a] = engine.evaluateExpression("roll(1, 6)");
    expect(a.toNumber()).toBeGreaterThanOrEqual(1);
    expect(a.toNumber()).toBeLessThanOrEqual(6);
    const [b] = engine.evaluateExpression("roll between 1 and 6");
    expect(b.toNumber()).toBeGreaterThanOrEqual(1);
    expect(b.toNumber()).toBeLessThanOrEqual(6);
  });
});
