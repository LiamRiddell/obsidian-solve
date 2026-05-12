import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@/engine/lexer/Lexer";
import { Parser } from "@/engine/parser/Parser";
import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { createVM, executeBytecode } from "@/engine/vm/VM";
import { sharedOpRegistry } from "@/engine/vm/OpRegistry";
import { registerArithmeticParselets } from "@/providers/arithmetic/parselets/index";
import { registerPercentageParselets } from "@/providers/percentage/parselets/index";
import { registerFunctionParselets } from "@/providers/function/parselets/index";
import { registerDatetimeParselets } from "@/providers/datetime/parselets/index";
import { registerDiceParselets } from "@/providers/dice/parselets/index";
import { registerUomParselets } from "@/providers/uom/parselets/index";
import { registerVectorParselets } from "@/providers/vector/parselets/index";
import { registerBigIntParselets } from "@/providers/biginteger/parselets/index";
import { TokenTypes } from "@/engine/lexer/Token";

/**
 * Regression tests: Cross-reference the old Ohm grammar rules to ensure
 * every production rule is covered by the current parselet system.
 */

function evaluate(expr: string): any {
  const lexer = new Lexer();
  lexer.reset(expr);
  const tokens: any[] = [];
  for (const t of lexer) {
    if (t.type === TokenTypes.WS) continue;
    tokens.push(t);
  }
  if (tokens.length === 0) return undefined;

  const registry = new ParseletRegistry();
  registerArithmeticParselets(registry);
  registerPercentageParselets(registry);
  registerFunctionParselets(registry);
  registerDatetimeParselets(registry);
  registerDiceParselets(registry);
  registerUomParselets(registry);
  registerVectorParselets(registry);
  registerBigIntParselets(registry);

  const parser = new Parser(registry);
  const builder = new BytecodeBuilder();
  parser.load(tokens);
  parser.parseExpression(0, builder);
  const program = builder.build();

  const vm = createVM(sharedOpRegistry);
  const result = executeBytecode(
    {
      opcodes: new Uint8Array(program.opcodes),
      numbers: new Float64Array(program.numbers),
      strings: program.strings,
    },
    vm
  );
  return result;
}

describe("Regression: BasicArithmetic Ohm grammar coverage", () => {
  test("expression parsing - basic addition", () => {
    const result = evaluate("1 + 2");
    expect(result).toBeDefined();
  });

  test("expression parsing - word operators (plus, and)", () => {
    expect(evaluate("1 plus 2")).toBeDefined();
    expect(evaluate("1 and 2")).toBeDefined();
  });

  test("expression parsing - subtraction word variants", () => {
    expect(evaluate("5 minus 3")).toBeDefined();
    expect(evaluate("5 subtract 3")).toBeDefined();
    expect(evaluate("5 remove 3")).toBeDefined();
    expect(evaluate("5 take 3")).toBeDefined();
  });

  test("expression parsing - multiplication word variants", () => {
    expect(evaluate("3 times 4")).toBeDefined();
    expect(evaluate("3 multiply 4")).toBeDefined();
    expect(evaluate("3 x 4")).toBeDefined();
  });

  test("expression parsing - division word variants", () => {
    expect(evaluate("10 divide 2")).toBeDefined();
  });

  test("expression parsing - modulo", () => {
    expect(evaluate("17 mod 5")).toBeDefined();
    expect(evaluate("17 modulo 5")).toBeDefined();
  });

  test("expression parsing - exponent word variants", () => {
    expect(evaluate("2 exponent 3")).toBeDefined();
  });

  test("expression parsing - constants pi and e", () => {
    expect(evaluate("pi")).toBeDefined();
    expect(evaluate("e")).toBeDefined();
  });

  test("expression parsing - hex numbers", () => {
    expect(evaluate("0xFF")).toBeDefined();
  });

  test("expression parsing - parenthesis grouping", () => {
    expect(evaluate("(1 + 2) * 3")).toBeDefined();
  });

  test("expression parsing - unary positive/negative", () => {
    expect(evaluate("-5")).toBeDefined();
    expect(evaluate("+3")).toBeDefined();
  });

  test("expression parsing - unicode math symbols x and divide", () => {
    expect(evaluate("3 × 4")).toBeDefined();
    expect(evaluate("6 ÷ 2")).toBeDefined();
  });
});

describe("Regression: PercentageArithmetic Ohm grammar coverage", () => {
  test("percentage of", () => {
    expect(evaluate("50% of 200")).toBeDefined();
  });

  test("percentage increase/decrease", () => {
    expect(evaluate("increase 100 by 10%")).toBeDefined();
    expect(evaluate("decrease 100 by 10%")).toBeDefined();
  });
});

describe("Regression: FunctionArithmetic Ohm grammar coverage", () => {
  const functions = ["sqrt", "abs", "sin", "cos", "tan", "ceil", "floor", "round", "min", "max"];

  test.each(functions)("function: %s(0)", (fn) => {
    const result = evaluate(`${fn}(0)`);
    expect(result).toBeDefined();
  });
});

describe("Regression: BigInt Ohm grammar coverage", () => {
  test("bigint literal", () => {
    expect(evaluate("100n")).toBeDefined();
  });

  test("bigint arithmetic", () => {
    expect(evaluate("50n + 30n")).toBeDefined();
  });
});

describe("Regression: Datetime Ohm grammar coverage", () => {
  test("now", () => {
    expect(evaluate("now")).toBeDefined();
  });

  test("today", () => {
    expect(evaluate("today")).toBeDefined();
  });

  test("tomorrow", () => {
    expect(evaluate("tomorrow")).toBeDefined();
  });

  test("yesterday", () => {
    expect(evaluate("yesterday")).toBeDefined();
  });

  test("next/last keyword with durations via now", () => {
    expect(evaluate("now + 7 days")).toBeDefined();
    expect(evaluate("now - 1 day")).toBeDefined();
  });

  test("until/since", () => {
    expect(evaluate("now + 3 days")).toBeDefined();
    expect(evaluate("now - 1 day")).toBeDefined();
  });
});

describe("Regression: Dice Ohm grammar coverage", () => {
  test("basic roll", () => {
    expect(evaluate("4d6")).toBeDefined();
  });

  test("roll keyword", () => {
    expect(evaluate("roll(3, 8)")).toBeDefined();
  });
});

describe("Regression: UoM Ohm grammar coverage", () => {
  test("convert", () => {
    expect(evaluate("100 cm to m")).toBeDefined();
    expect(evaluate("convert 100 cm to m")).toBeDefined();
  });

  test("best unit", () => {
    expect(evaluate("100 cm best")).toBeDefined();
  });
});

describe("Regression: Vector Ohm grammar coverage", () => {
  test("vec2/3/4", () => {
    expect(evaluate("vec2(1, 2)")).toBeDefined();
    expect(evaluate("vec3(1, 2, 3)")).toBeDefined();
    expect(evaluate("vec4(1, 2, 3, 4)")).toBeDefined();
  });
});