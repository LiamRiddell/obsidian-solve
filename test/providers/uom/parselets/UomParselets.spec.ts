import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@/engine/lexer/Lexer";
import { TokenTypes } from "@/engine/lexer/Token";
import { Parser } from "@/engine/parser/Parser";
import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { registerArithmeticParselets } from "@/providers/arithmetic/parselets/index";
import { registerUomParselets } from "@/providers/uom/parselets/index";
import { createVM, executeBytecode } from "@/engine/vm/VM";
import { sharedOpRegistry } from "@/engine/vm/OpRegistry";

function tokenize(lexer: Lexer, input: string) {
  lexer.reset(input);
  const tokens = [];
  for (const t of lexer) {
    if (t.type === TokenTypes.WS || t.type === "NEWLINE") continue;
    tokens.push(t);
  }
  return tokens;
}

function parseAndExecute(input: string): number {
  const lexer = new Lexer();
  const tokens = tokenize(lexer, input);
  const registry = new ParseletRegistry();
  registerArithmeticParselets(registry);
  registerUomParselets(registry);
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
  return result!.toNumber();
}

describe("UoM Parselets", () => {
  test("tokens: '10 mm' produces NUMBER then UNIT", () => {
    const lexer = new Lexer();
    lexer.reset("10 mm");
    const tokens: string[] = [];
    for (const t of lexer) {
      if (t.type === "WS") continue;
      tokens.push(t.type);
    }
    expect(tokens).toEqual(["NUMBER", "UNIT"]);
  });

  test("unit identifiers are detected as UNIT type", () => {
    const lexer = new Lexer();
    lexer.reset("km");
    const t = lexer.next();
    expect(t).toBeDefined();
    expect(t!.type).toBe("UNIT");
  });

  test("non-unit identifiers remain IDENT", () => {
    const lexer = new Lexer();
    lexer.reset("foo");
    const t = lexer.next();
    expect(t).toBeDefined();
    expect(t!.type).toBe("IDENT");
  });

  test("keywords still work alongside units", () => {
    const lexer = new Lexer();
    lexer.reset("pi mm");
    const tokens: string[] = [];
    for (const t of lexer) {
      if (t.type === "WS") continue;
      tokens.push(t.type);
    }
    expect(tokens).toEqual(["PI", "UNIT"]);
  });

  test("case-insensitive unit detection", () => {
    const lexer = new Lexer();
    lexer.reset("MM");
    const t = lexer.next();
    expect(t!.type).toBe("UNIT");
  });
});