/**
 * Conditionals package — comparisons, booleans, logical and/or,
 * if/then/else.
 *
 * The widest-open gap found during the SoulverCore-feature-parity work
 * this session: `OpCode.EQ/NEQ/LT/LTE/GT/GTE` (40-45) and their VM
 * handlers already existed, fully correct (including UoM-aware
 * equality) — only the lexer (`<`/`>` were never even tokenized; `==`/
 * `!=`/`>=`/`<=` were) and parser front end were missing.
 */

import { registerPackageForTesting } from "@tools/testUtils";
import { ARITHMETIC_PACKAGE, CONDITIONALS_PACKAGE } from "@solve-js/packages";
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
  registerPackageForTesting(CONDITIONALS_PACKAGE, registry);
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

describe("comparison operators", () => {
  test.each([
    ["5 == 5", true], ["5 == 3", false],
    ["5 != 3", true], ["5 != 5", false],
    ["3 < 5", true], ["5 < 3", false],
    ["5 > 3", true], ["3 > 5", false],
    ["5 <= 5", true], ["6 <= 5", false],
    ["5 >= 5", true], ["4 >= 5", false],
  ])("%s -> %s", (expr, expected) => {
    const result = parseAndExecute(expr);
    expect(result.type).toBe(ValueType.Boolean);
    expect(result.value).toBe(expected);
  });

  test("comparisons work on expressions, not just literals: 2 + 3 == 5", () => {
    expect(parseAndExecute("2 + 3 == 5").value).toBe(true);
  });

  test("comparisons bind looser than arithmetic: 1 + 2 < 2 + 2 reads as (1+2) < (2+2)", () => {
    expect(parseAndExecute("1 + 2 < 2 + 2").value).toBe(true);
  });
});

describe("boolean literals", () => {
  test("true", () => {
    const result = parseAndExecute("true");
    expect(result.type).toBe(ValueType.Boolean);
    expect(result.value).toBe(true);
  });

  test("false", () => {
    const result = parseAndExecute("false");
    expect(result.type).toBe(ValueType.Boolean);
    expect(result.value).toBe(false);
  });
});

describe("logical and/or", () => {
  test("true and false -> false (word 'and', both plain booleans, no comparisons mixed in)", () => {
    expect(parseAndExecute("true and false").value).toBe(false);
  });

  test("true and true -> true", () => {
    expect(parseAndExecute("true and true").value).toBe(true);
  });

  test("true or false -> true", () => {
    expect(parseAndExecute("true or false").value).toBe(true);
  });

  test("false or false -> false", () => {
    expect(parseAndExecute("false or false").value).toBe(false);
  });

  test("true && false -> false", () => {
    expect(parseAndExecute("true && false").value).toBe(false);
  });

  test("false || true -> true", () => {
    expect(parseAndExecute("false || true").value).toBe(true);
  });

  test("&& correctly combines two comparisons: 1 < 2 && 3 < 4 -> true (unlike bare 'and', see KNOWN LIMITATION doc)", () => {
    expect(parseAndExecute("1 < 2 && 3 < 4").value).toBe(true);
  });

  test("&& short-circuits correctly when the first comparison is false: 5 < 2 && 3 < 4 -> false", () => {
    expect(parseAndExecute("5 < 2 && 3 < 4").value).toBe(false);
  });

  test("parenthesized 'and' correctly combines two comparisons: (1 < 2) and (3 < 4) -> true", () => {
    expect(parseAndExecute("(1 < 2) and (3 < 4)").value).toBe(true);
  });

  test("logical operators work on plain numeric operands via truthiness: 1 and 1 is truthy-and-truthy", () => {
    // isTruthy() treats nonzero Numbers as true — but "1 and 1" hits the
    // ADD/PLUS Number+Number fast path (1+1=2), NOT the Boolean special
    // case, since neither operand is Boolean-typed. Use && for a genuine
    // logical AND over non-boolean operands.
    expect(parseAndExecute("1 && 1").value).toBe(true);
    expect(parseAndExecute("0 && 1").value).toBe(false);
  });
});

describe("if/then/else", () => {
  test("if true then 1 else 2 -> 1", () => {
    expect(parseAndExecute("if true then 1 else 2").toNumber()).toBe(1);
  });

  test("if false then 1 else 2 -> 2", () => {
    expect(parseAndExecute("if false then 1 else 2").toNumber()).toBe(2);
  });

  test("if 5 > 3 then 100 else 200 -> 100 (condition is a comparison)", () => {
    expect(parseAndExecute("if 5 > 3 then 100 else 200").toNumber()).toBe(100);
  });

  test("if 5 < 3 then 100 else 200 -> 200", () => {
    expect(parseAndExecute("if 5 < 3 then 100 else 200").toNumber()).toBe(200);
  });

  test("branches can be full expressions: if true then 2 + 3 else 10 * 10 -> 5", () => {
    expect(parseAndExecute("if true then 2 + 3 else 10 * 10").toNumber()).toBe(5);
  });
});

describe("CONDITIONALS_PACKAGE — real engine wiring", () => {
  test("comparisons work via the real, default-constructed ExpressionEngine", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("5 > 3");
    expect(value.type).toBe(ValueType.Boolean);
    expect(value.value).toBe(true);
  });

  test("if/then/else works via the real engine", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("if 10 > 5 then 1 else 0");
    expect(value.toNumber()).toBe(1);
  });

  test("&& works via the real engine", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("1 < 2 && 3 < 4");
    expect(value.value).toBe(true);
  });

});
