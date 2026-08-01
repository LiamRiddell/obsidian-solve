import { registerPackageForTesting } from "@tools/testUtils";
import { ARITHMETIC_PACKAGE, VARIABLES_PACKAGE } from "@solve-js/packages";
import { describe, expect, test, afterEach } from "@jest/globals";
import { Lexer } from "@solve-js/lexer/Lexer";
import { TokenTypes } from "@solve-js/lexer/Token";
import { Parser } from "@solve-js/parser/Parser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";


import { createVM, executeBytecode, unwrapEvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { Value, ValueType, numberValue } from "@solve-js/vm/Value";
import { sharedGlobalVariableStore } from "@solve-js/vm/GlobalVariableStore";

/**
 * Raw lex -> parse -> compile -> execute coverage for `global :name` /
 * `global :name = expr`, mirroring VariableParselets.spec.ts's scaffolding.
 * This is deliberately narrow: LOAD_GLOBAL_VAR is only ever reached here
 * with the store already pre-seeded (matching the VM handler's documented
 * precondition — see VM.ts's LOAD_GLOBAL_VAR comment). The "not yet
 * declared anywhere" / Pending / async-resolution behavior lives in
 * GlobalVariableAsyncResolver and is covered end-to-end in
 * GlobalVariablesAcrossDocuments.spec.ts, not here — this file only proves
 * the opcode/parselet wiring is correct in isolation.
 */

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

describe("Global Variable Parselets", () => {
  afterEach(() => {
    sharedGlobalVariableStore.clear();
  });

  test("global variable assignment stores into sharedGlobalVariableStore and returns the value", () => {
    const result = parseAndExecute("global :myGlobal = 42");
    expect(result.type).toBe(ValueType.Number);
    expect(result.toNumber()).toBe(42);
    expect(sharedGlobalVariableStore.get("myGlobal")!.toNumber()).toBe(42);
  });

  test("global variable assignment with an expression RHS", () => {
    const result = parseAndExecute("global :total = 10 + 20 * 3");
    expect(result.toNumber()).toBe(70);
    expect(sharedGlobalVariableStore.get("total")!.toNumber()).toBe(70);
  });

  test("reading an already-set global returns its value", () => {
    sharedGlobalVariableStore.set("price", numberValue(100));
    const result = parseAndExecute("global :price");
    expect(result.toNumber()).toBe(100);
  });

  test("a global variable's value is independent of the VM's own local scope", () => {
    const vmResult = parseAndExecute("global :shared = 9");
    expect(vmResult.toNumber()).toBe(9);
    // A brand-new parse/execute (fresh VM, fresh local scope) can still see it.
    const readResult = parseAndExecute("global :shared");
    expect(readResult.toNumber()).toBe(9);
  });

  test("global writes don't leak into the local :name namespace, and vice versa", () => {
    parseAndExecute("global :x = 1");
    // A completely separate local :x is unaffected — this is a NEW parse
    // with its own fresh VM/local-scope, so ":x" here was never assigned
    // locally and must throw exactly like any other undefined local var.
    expect(() => parseAndExecute(":x")).toThrow(/Undefined variable: x/);
  });

  test("a local :name and a global :name of the same identifier don't collide", () => {
    // Two separate single-statement parses against ONE shared VM, so the
    // local write from the first genuinely could have collided with the
    // second's global write if GLOBAL opcodes routed through the VM's
    // local scope instead of the store.
    const lexer = new Lexer();
    const registry = new ParseletRegistry();
    registerPackageForTesting(ARITHMETIC_PACKAGE, registry);
    registerPackageForTesting(VARIABLES_PACKAGE, registry);
    const parser = new Parser(registry);
    const vm = createVM(sharedOpRegistry);

    const b1 = new BytecodeBuilder();
    parser.load(tokenize(lexer, ":x = 1"));
    parser.parseExpression(0, b1);
    const p1 = b1.build();
    executeBytecode({ opcodes: new Uint8Array(p1.opcodes), numbers: new Float64Array(p1.numbers), strings: p1.strings }, vm);

    const b2 = new BytecodeBuilder();
    parser.load(tokenize(lexer, "global :x = 2"));
    parser.parseExpression(0, b2);
    const p2 = b2.build();
    executeBytecode({ opcodes: new Uint8Array(p2.opcodes), numbers: new Float64Array(p2.numbers), strings: p2.strings }, vm);

    expect(vm.getVar("x")!.toNumber()).toBe(1); // local, unaffected by the global write
    expect(sharedGlobalVariableStore.get("x")!.toNumber()).toBe(2); // global, unaffected by the local write
  });

  test("'global' followed by anything other than a colon throws a parse error", () => {
    expect(() => parseAndExecute("global 5")).toThrow();
  });

  test("'global :' with no name after it throws a parse error", () => {
    expect(() => parseAndExecute("global :")).toThrow();
  });

  test("reserved-keyword regression: ':global = 5' no longer defines a local variable named 'global' — it's a parse error", () => {
    // Adding `global` to the keyword map means the identifier `global`
    // lexes as GLOBAL, not IDENT — VariableParselet's name-token check
    // (IDENT/UNIT only) now rejects it, the same tradeoff every other
    // keyword (roll, convert, by, ...) already makes. This asserts the
    // change is intentional and covered, not an unnoticed regression.
    expect(() => parseAndExecute(":global = 5")).toThrow();
  });

  test("global variable named after a known unit (UNIT token) is accepted, same as local :name", () => {
    // "b" is a known unit (bits) — VariableParselet accepts UNIT tokens as
    // names for exactly this reason; GlobalVariableParselet mirrors it.
    const result = parseAndExecute("global :b = 5");
    expect(result.toNumber()).toBe(5);
    expect(sharedGlobalVariableStore.get("b")!.toNumber()).toBe(5);
  });
});
