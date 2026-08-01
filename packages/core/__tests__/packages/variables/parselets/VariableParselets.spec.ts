import { registerPackageForTesting } from "@tools/testUtils";
import { ARITHMETIC_PACKAGE, VARIABLES_PACKAGE } from "@solve-js/packages";
import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@solve-js/lexer/Lexer";
import { TokenTypes } from "@solve-js/lexer/Token";
import { Parser } from "@solve-js/parser/Parser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";


import { createVM, executeBytecode, unwrapEvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { Value, ValueType } from "@solve-js/vm/Value";

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
  registerPackageForTesting(VARIABLES_PACKAGE, registry);
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

describe("Variable Parselets", () => {
  test("variable assignment stores and returns value", () => {
    const result = parseAndExecute(":myVar = 42");
    expect(result.type).toBe(ValueType.Number);
    expect(result.toNumber()).toBe(42);
  });

  test("variable read returns stored value", () => {
    const result = parseAndExecute(":myVar = 5 + 3");
    expect(result.type).toBe(ValueType.Number);
    expect(result.toNumber()).toBe(8);
  });

  test("variable in expression", () => {
    const lexer = new Lexer();
    const tokens = tokenize(lexer, ":myVar = 10");
    const registry = new ParseletRegistry();
    registerPackageForTesting(ARITHMETIC_PACKAGE, registry);
    registerPackageForTesting(VARIABLES_PACKAGE, registry);
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

    const tokens2 = tokenize(lexer, ":myVar + 5");
    const builder2 = new BytecodeBuilder();
    parser.load(tokens2);
    parser.parseExpression(0, builder2);
    const program2 = builder2.build();
    const vm2Uint8 = new Uint8Array(program2.opcodes);
    const vm2Float64 = new Float64Array(program2.numbers);
    const vm2 = createVM(sharedOpRegistry);
    vm2.setVar("myVar", vm.getVar("myVar")!);
    const result2 = executeBytecode(
      { opcodes: vm2Uint8, numbers: vm2Float64, strings: program2.strings },
      vm2
    );
    expect(unwrapEvalResult(result2).type).toBe(ValueType.Number);
    expect(unwrapEvalResult(result2).toNumber()).toBe(15);
  });

  test("variable assignment with expression RHS", () => {
    const result = parseAndExecute(":total = 10 + 20 * 3");
    expect(result.type).toBe(ValueType.Number);
    expect(result.toNumber()).toBe(70);
  });

  test("unset variable read throws Undefined variable", () => {
    // LOAD_VAR now throws for undefined variables instead of silently
    // returning numberValue(0). Unrecognized identifiers are errors.
    expect(() => parseAndExecute(":undefinedVar")).toThrow(/Undefined variable/);
  });

  test("multi-line variable assignments", () => {
    const lexer = new Lexer();
    // First line: :var1 = 10
    const tokens1 = tokenize(lexer, ":var1 = 10");
    const registry = new ParseletRegistry();
    registerPackageForTesting(ARITHMETIC_PACKAGE, registry);
    registerPackageForTesting(VARIABLES_PACKAGE, registry);
    const parser = new Parser(registry);
    const builder1 = new BytecodeBuilder();
    parser.load(tokens1);
    parser.parseExpression(0, builder1);
    const program1 = builder1.build();
    const vm1Uint8 = new Uint8Array(program1.opcodes);
    const vm1Float64 = new Float64Array(program1.numbers);
    const vm1 = createVM(sharedOpRegistry);
    executeBytecode(
      { opcodes: vm1Uint8, numbers: vm1Float64, strings: program1.strings },
      vm1
    );

    // Second line: :var2 = 20
    const tokens2 = tokenize(lexer, ":var2 = 20");
    const builder2 = new BytecodeBuilder();
    parser.load(tokens2);
    parser.parseExpression(0, builder2);
    const program2 = builder2.build();
    const vm2Uint8 = new Uint8Array(program2.opcodes);
    const vm2Float64 = new Float64Array(program2.numbers);
    const vm2 = createVM(sharedOpRegistry);
    vm2.setVar("var1", vm1.getVar("var1")!);
    executeBytecode(
      { opcodes: vm2Uint8, numbers: vm2Float64, strings: program2.strings },
      vm2
    );

    // Third line: :var1 + :var2
    const tokens3 = tokenize(lexer, ":var1 + :var2");
    const builder3 = new BytecodeBuilder();
    parser.load(tokens3);
    parser.parseExpression(0, builder3);
    const program3 = builder3.build();
    const vm3Uint8 = new Uint8Array(program3.opcodes);
    const vm3Float64 = new Float64Array(program3.numbers);
    const vm3 = createVM(sharedOpRegistry);
    vm3.setVar("var1", vm2.getVar("var1")!);
    vm3.setVar("var2", vm2.getVar("var2")!);
    const evalResult = executeBytecode(
      { opcodes: vm3Uint8, numbers: vm3Float64, strings: program3.strings },
      vm3
    );
    const result = unwrapEvalResult(evalResult);
    expect(result.type).toBe(ValueType.Number);
    expect(result.toNumber()).toBe(30);
  });
});
