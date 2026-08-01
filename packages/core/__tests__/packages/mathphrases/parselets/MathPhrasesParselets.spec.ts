/**
 * MathPhrases package — phrase-grammar math functions, plus the
 * gcd/lcm/permutation/combination FUNCTION_PACKAGE additions.
 *
 * Most forms here ("average of ...", "total of ...", "half of ...",
 * "midpoint between ...", "random number between ...", "A is to B as C
 * is to what") depend on phrase fusion (see MathPhrasesPackage.ts's
 * `phrases` field), which only happens inside a real, fully-constructed
 * ExpressionEngine — TokenNormalizer/PhraseTrie aren't wired into the
 * lightweight tokenize+parse harness this file also uses for
 * gcd/lcm/permutation/combination and "clamp" (a bare keyword, unaffected
 * by phrase fusion). Real-engine tests use `evalReal()`.
 */

import { registerPackageForTesting } from "@tools/testUtils";
import { ARITHMETIC_PACKAGE, FUNCTION_PACKAGE, MATHPHRASES_PACKAGE } from "@solve-js/packages";
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
  registerPackageForTesting(FUNCTION_PACKAGE, registry);
  registerPackageForTesting(MATHPHRASES_PACKAGE, registry);
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

function evalReal(expr: string): Value {
  const engine = new ExpressionEngine("en");
  const [value] = engine.evaluateExpression(expr);
  return value;
}

describe("gcd / lcm / permutation / combination (FUNCTION_PACKAGE)", () => {
  test("gcd(12, 18) -> 6", () => {
    expect(parseAndExecute("gcd(12, 18)").toNumber()).toBe(6);
  });

  test("gcd(17, 5) -> 1 (coprime)", () => {
    expect(parseAndExecute("gcd(17, 5)").toNumber()).toBe(1);
  });

  test("lcm(4, 6) -> 12", () => {
    expect(parseAndExecute("lcm(4, 6)").toNumber()).toBe(12);
  });

  test("permutation(5, 2) -> 20", () => {
    expect(parseAndExecute("permutation(5, 2)").toNumber()).toBe(20);
  });

  test("combination(5, 2) -> 10", () => {
    expect(parseAndExecute("combination(5, 2)").toNumber()).toBe(10);
  });

  test("combination(52, 5) -> 2598960 (stays exact for larger n)", () => {
    expect(parseAndExecute("combination(52, 5)").toNumber()).toBe(2598960);
  });

  test("permutation(5, 6) -> Error (r > n)", () => {
    expect(parseAndExecute("permutation(5, 6)").type).toBe(ValueType.Error);
  });
});

describe("average / median / total / count of X, Y, Z (phrase-fused, real engine)", () => {
  test("average of 2, 4, 6 -> 4", () => {
    expect(evalReal("average of 2, 4, 6").toNumber()).toBe(4);
  });

  test("median of 1, 3, 100 -> 3 (odd count)", () => {
    expect(evalReal("median of 1, 3, 100").toNumber()).toBe(3);
  });

  test("median of 1, 2, 3, 4 -> 2.5 (even count, averages the middle two)", () => {
    expect(evalReal("median of 1, 2, 3, 4").toNumber()).toBe(2.5);
  });

  test("total of 10, 20, 30 -> 60", () => {
    expect(evalReal("total of 10, 20, 30").toNumber()).toBe(60);
  });

  test("count of 10, 20, 30, 40 -> 4", () => {
    expect(evalReal("count of 10, 20, 30, 40").toNumber()).toBe(4);
  });

  test("average of a single value: average of 7 -> 7", () => {
    expect(evalReal("average of 7").toNumber()).toBe(7);
  });

  test("arguments can be full expressions: total of 1 + 1, 2 * 3 -> 8", () => {
    expect(evalReal("total of 1 + 1, 2 * 3").toNumber()).toBe(8);
  });
});

describe("larger / smaller of X and Y (phrase-fused, real engine)", () => {
  test("larger of 3 and 7 -> 7", () => {
    expect(evalReal("larger of 3 and 7").toNumber()).toBe(7);
  });

  test("smaller of 3 and 7 -> 3", () => {
    expect(evalReal("smaller of 3 and 7").toNumber()).toBe(3);
  });

  test("larger of (2 + 2) and (3 * 1) -> 4 (operands can be expressions; parens needed since a literal '+' is indistinguishable from the word 'and' — both lex as PLUS, see ConditionalsPackage.ts's doc comment)", () => {
    expect(evalReal("larger of (2 + 2) and (3 * 1)").toNumber()).toBe(4);
  });
});

describe("half of X (phrase-fused, real engine)", () => {
  test("half of 10 -> 5", () => {
    expect(evalReal("half of 10").toNumber()).toBe(5);
  });

  test("half of 4 + 6 -> 5", () => {
    expect(evalReal("half of 4 + 6").toNumber()).toBe(5);
  });
});

describe("midpoint between X and Y (phrase-fused, real engine)", () => {
  test("midpoint between 10 and 20 -> 15", () => {
    expect(evalReal("midpoint between 10 and 20").toNumber()).toBe(15);
  });

  test("midpoint between 0 and 100 -> 50", () => {
    expect(evalReal("midpoint between 0 and 100").toNumber()).toBe(50);
  });
});

describe("clamp X between Y and Z / clamp X from Y to Z (bare keyword)", () => {
  test("clamp 15 between 0 and 10 -> 10 (above range)", () => {
    expect(parseAndExecute("clamp 15 between 0 and 10").toNumber()).toBe(10);
  });

  test("clamp -5 between 0 and 10 -> 0 (below range)", () => {
    expect(parseAndExecute("clamp -5 between 0 and 10").toNumber()).toBe(0);
  });

  test("clamp 5 between 0 and 10 -> 5 (already in range)", () => {
    expect(parseAndExecute("clamp 5 between 0 and 10").toNumber()).toBe(5);
  });

  test("clamp 15 from 0 to 10 -> 10 ('from...to' alternative phrasing)", () => {
    expect(parseAndExecute("clamp 15 from 0 to 10").toNumber()).toBe(10);
  });

  test("clamp 5 between 10 and 0 -> Error (invalid range, lo > hi)", () => {
    expect(parseAndExecute("clamp 5 between 10 and 0").type).toBe(ValueType.Error);
  });
});

describe("random number between X and Y / A is to B as C is to what (phrase-fused, real engine)", () => {
  test("random number between 1 and 1 -> 1 (degenerate range, deterministic)", () => {
    expect(evalReal("random number between 1 and 1").toNumber()).toBe(1);
  });

  test("random number between 5 and 10 stays in range", () => {
    const value = evalReal("random number between 5 and 10");
    expect(value.toNumber()).toBeGreaterThanOrEqual(5);
    expect(value.toNumber()).toBeLessThanOrEqual(10);
  });

  test("5 km is to 500m as 5 cm is to what -> 0.5cm (unit-aware proportion)", () => {
    const value = evalReal("5 km is to 500m as 5 cm is to what");
    expect(value.type).toBe(ValueType.Uom);
    expect(value.unit).toBe("cm");
    expect(value.toNumber()).toBeCloseTo(0.5);
  });

  test("2 is to 4 as 10 is to what -> 20 (plain-number proportion)", () => {
    expect(evalReal("2 is to 4 as 10 is to what").toNumber()).toBe(20);
  });
});

describe("MATHPHRASES_PACKAGE — real engine wiring", () => {
  test("average of X, Y, Z works via the real, default-constructed ExpressionEngine", () => {
    expect(evalReal("average of 2, 4, 6").toNumber()).toBe(4);
  });

  test("clamp works via the real engine", () => {
    expect(evalReal("clamp 15 between 0 and 10").toNumber()).toBe(10);
  });

  test("regression guard: ':total = ...' still works as a variable — phrase fusion for MathPhrases must not claim bare 'total' as a keyword (see MathPhrasesPackage.ts's design note)", () => {
    const engine = new ExpressionEngine("en");
    engine.evaluateExpression(":subtotal = 100");
    engine.evaluateExpression(":tax = 8");
    const [value] = engine.evaluateExpression(":total = :subtotal + :tax");
    expect(value.toNumber()).toBe(108);
  });

  test("regression guard: bare 'average'/'half'/'count' still work as variable names too", () => {
    const engine = new ExpressionEngine("en");
    engine.evaluateExpression(":average = 42");
    engine.evaluateExpression(":half = 21");
    engine.evaluateExpression(":count = 3");
    const [value] = engine.evaluateExpression(":average + :half + :count");
    expect(value.toNumber()).toBe(66);
  });
});
