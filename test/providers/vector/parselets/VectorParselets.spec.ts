import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@/engine/lexer/Lexer";
import { TokenTypes } from "@/engine/lexer/Token";
import { Parser } from "@/engine/parser/Parser";
import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { registerArithmeticParselets } from "@/providers/arithmetic/parselets/index";
import { registerVectorParselets } from "@/providers/vector/parselets/index";
import { createVM, executeBytecode } from "@/engine/vm/VM";
import { sharedOpRegistry } from "@/engine/vm/OpRegistry";
import { Value } from "@/engine/vm/Value";

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
  registerVectorParselets(registry);
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

describe("Vector Parselets", () => {
  test("vec2: [1, 2]", () => {
    const result = parseAndExecute("[1, 2]");
    expect(result.isVector()).toBe(true);
    expect((result.value as number[]).length).toBe(2);
    expect((result.value as number[])[0]).toBe(1);
    expect((result.value as number[])[1]).toBe(2);
  });

  test("vec2 with expressions: [1 + 2, 3 * 4]", () => {
    const result = parseAndExecute("[1 + 2, 3 * 4]");
    expect(result.isVector()).toBe(true);
    expect((result.value as number[])[0]).toBe(3);
    expect((result.value as number[])[1]).toBe(12);
  });

  test("vec3: [1, 2, 3]", () => {
    const result = parseAndExecute("[1, 2, 3]");
    expect(result.isVector()).toBe(true);
    expect((result.value as number[]).length).toBe(3);
  });

  test("nested vector containing arithmetic", () => {
    const result = parseAndExecute("[10 * 2 / 4, 2]");
    expect(result.isVector()).toBe(true);
    expect((result.value as number[])[0]).toBe(5);
    expect((result.value as number[])[1]).toBe(2);
  });
});