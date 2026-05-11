import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@/engine/lexer/Lexer";
import { TokenTypes } from "@/engine/lexer/Token";
import { Parser } from "@/engine/parser/Parser";
import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { registerArithmeticParselets } from "@/providers/arithmetic/parselets/index";
import { registerVariableParselets } from "@/providers/variables/parselets/index";
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
  registerVariableParselets(registry);
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

describe("Variable Parselets", () => {
  test("variable assignment stores and returns value", () => {
    const result = parseAndExecute(":x = 42");
    expect(result.toNumber()).toBe(42);
  });

  test("variable read returns stored value", () => {
    const result = parseAndExecute(":x = 5 + 3");
    expect(result.toNumber()).toBe(8);
  });

  test("variable in expression", () => {
    const lexer = new Lexer();
    const tokens = tokenize(lexer, ":x = 10");
    const registry = new ParseletRegistry();
    registerArithmeticParselets(registry);
    registerVariableParselets(registry);
    const parser = new Parser(registry);
    const builder = new BytecodeBuilder();
    parser.load(tokens);
    parser.parseExpression(0, builder);
    const program = builder.build();
    const vmUint8 = new Uint8Array(program.opcodes);
    const vmFloat64 = new Float64Array(program.numbers);
    const vm = createVM(sharedOpRegistry);
    executeBytecode(
      { opcodes: vmUint8, numbers: vmFloat64, strings: program.strings },
      vm
    );

    const tokens2 = tokenize(lexer, ":x + 5");
    const builder2 = new BytecodeBuilder();
    parser.load(tokens2);
    parser.parseExpression(0, builder2);
    const program2 = builder2.build();
    const vm2Uint8 = new Uint8Array(program2.opcodes);
    const vm2Float64 = new Float64Array(program2.numbers);
    const vm2 = createVM(sharedOpRegistry);
    vm2.setVar("x", vm.getVar("x")!);
    const result2 = executeBytecode(
      { opcodes: vm2Uint8, numbers: vm2Float64, strings: program2.strings },
      vm2
    );
    expect(result2!.toNumber()).toBe(15);
  });

  test("variable assignment with expression RHS", () => {
    const result = parseAndExecute(":total = 10 + 20 * 3");
    expect(result.toNumber()).toBe(70);
  });

  test("unset variable read returns 0", () => {
    const result = parseAndExecute(":undefinedVar");
    expect(result.toNumber()).toBe(0);
  });
});