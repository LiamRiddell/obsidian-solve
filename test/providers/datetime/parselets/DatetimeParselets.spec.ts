import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@/engine/lexer/Lexer";
import { TokenTypes } from "@/engine/lexer/Token";
import { Parser } from "@/engine/parser/Parser";
import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { registerArithmeticParselets } from "@/providers/arithmetic/parselets/index";
import { registerDatetimeParselets } from "@/providers/datetime/parselets/index";
import { createVM, executeBytecode } from "@/engine/vm/VM";
import { sharedOpRegistry } from "@/engine/vm/OpRegistry";
import { Value, numberValue } from "@/engine/vm/Value";

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
  registerDatetimeParselets(registry);
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

describe("Datetime Parselets", () => {
  test("now returns current time", () => {
    const before = Date.now();
    const result = parseAndExecute("now");
    const after = Date.now();
    expect(result.type).toBe("datetime");
    expect((result.value as number)).toBeGreaterThanOrEqual(before);
    expect((result.value as number)).toBeLessThanOrEqual(after);
  });

  test("today returns current time", () => {
    const before = Date.now();
    const result = parseAndExecute("today");
    const after = Date.now();
    expect(result.type).toBe("datetime");
    expect((result.value as number)).toBeGreaterThanOrEqual(before);
    expect((result.value as number)).toBeLessThanOrEqual(after);
  });

  test("now + 1 day yields timestamp + 86400000", () => {
    const now = Date.now();
    parseAndExecute("now"); // warmup
    const result = parseAndExecute("now + 1 day");
    const elapsed = (result.value as number) - now;
    expect(elapsed).toBeCloseTo(86400000, -2);
  });

  test("now - 1 day yields timestamp - 86400000", () => {
    const now = Date.now();
    const result = parseAndExecute("now - 1 day");
    const elapsed = (result.value as number) - now;
    expect(elapsed).toBeCloseTo(-86400000, -2);
  });

  test("now + 2 hours yields timestamp + 7200000", () => {
    const now = Date.now();
    const result = parseAndExecute("now + 2 hours");
    const elapsed = (result.value as number) - now;
    expect(elapsed).toBeCloseTo(7200000, -1);
  });

  test("now + 30 minutes yields timestamp + 1800000", () => {
    const now = Date.now();
    const result = parseAndExecute("now + 30 minutes");
    const elapsed = (result.value as number) - now;
    expect(elapsed).toBeCloseTo(1800000, -1);
  });

  test("now + 2 weeks yields timestamp + 1209600000", () => {
    const now = Date.now();
    const result = parseAndExecute("now + 2 weeks");
    const elapsed = (result.value as number) - now;
    expect(elapsed).toBeCloseTo(1209600000, -2);
  });

  test("now + 3 months yields timestamp + approx 7776000000", () => {
    const now = Date.now();
    const result = parseAndExecute("now + 3 months");
    const elapsed = (result.value as number) - now;
    expect(elapsed).toBeCloseTo(7776000000, -4);
  });

  test("now + 1 year yields timestamp + approx 31536000000", () => {
    const now = Date.now();
    const result = parseAndExecute("now + 1 year");
    const elapsed = (result.value as number) - now;
    expect(elapsed).toBeCloseTo(31536000000, -5);
  });

  test("now + 10 seconds yields timestamp + ~10000", () => {
    const now = Date.now();
    const result = parseAndExecute("now + 10 seconds");
    const elapsed = (result.value as number) - now;
    expect(elapsed).toBeGreaterThanOrEqual(9995);
    expect(elapsed).toBeLessThanOrEqual(10010);
  });
});