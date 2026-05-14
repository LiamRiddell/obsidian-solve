import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@/engine/lexer/Lexer";
import { TokenTypes } from "@/engine/lexer/Token";
import { Parser } from "@/engine/parser/Parser";
import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { registerArithmeticParselets } from "@/providers/arithmetic/parselets/index";
import { registerDatetimeParselets } from "@/providers/datetime/parselets/index";
import { registerUomParselets } from "@/providers/uom/parselets/index";
import { createVM, executeBytecode } from "@/engine/vm/VM";
import { sharedOpRegistry } from "@/engine/vm/OpRegistry";
import { Value, ValueType, numberValue } from "@/engine/vm/Value";

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
  return result!;
}

describe("Datetime Parselets", () => {
  test("now returns current time", () => {
    const before = Date.now();
    const result = parseAndExecute("now");
    const after = Date.now();
    expect(result.type).toBe(ValueType.Datetime);
    expect((result.value as number)).toBeGreaterThanOrEqual(before);
    expect((result.value as number)).toBeLessThanOrEqual(after);
  });

  test("today returns current time", () => {
    const before = Date.now();
    const result = parseAndExecute("today");
    const after = Date.now();
    expect(result.type).toBe(ValueType.Datetime);
    expect((result.value as number)).toBeGreaterThanOrEqual(before);
    expect((result.value as number)).toBeLessThanOrEqual(after);
  });

  test("now + 1 day yields timestamp + 86400000", () => {
    const now = Date.now();
    parseAndExecute("now"); // warmup
    const result = parseAndExecute("now + 1 day");
    const elapsed = (result.value as number) - now;
    // Allow for up to 100ms variance due to system clock precision
    expect(elapsed).toBeGreaterThanOrEqual(86399900);
    expect(elapsed).toBeLessThanOrEqual(86400100);
  });

  test("now - 1 day yields timestamp - 86400000", () => {
    const now = Date.now();
    const result = parseAndExecute("now - 1 day");
    const elapsed = (result.value as number) - now;
    // Allow for up to 100ms variance due to system clock precision
    expect(elapsed).toBeGreaterThanOrEqual(-86400100);
    expect(elapsed).toBeLessThanOrEqual(-86399900);
  });

  test("now + 2 hours yields timestamp + 7200000", () => {
    const now = Date.now();
    const result = parseAndExecute("now + 2 hours");
    const elapsed = (result.value as number) - now;
    // Allow for up to 100ms variance due to system clock precision
    expect(elapsed).toBeGreaterThanOrEqual(7199900);
    expect(elapsed).toBeLessThanOrEqual(7200100);
  });

  test("now + 30 minutes yields timestamp + 1800000", () => {
    const now = Date.now();
    const result = parseAndExecute("now + 30 minutes");
    const elapsed = (result.value as number) - now;
    // Allow for up to 100ms variance due to system clock precision
    expect(elapsed).toBeGreaterThanOrEqual(1799900);
    expect(elapsed).toBeLessThanOrEqual(1800100);
  });

  test("now + 2 weeks yields timestamp + 1209600000", () => {
    const now = Date.now();
    const result = parseAndExecute("now + 2 weeks");
    const elapsed = (result.value as number) - now;
    // Allow for up to 100ms variance due to system clock precision
    expect(elapsed).toBeGreaterThanOrEqual(1209599900);
    expect(elapsed).toBeLessThanOrEqual(1209600100);
  });

  test("now + 3 months yields timestamp + approx 7776000000", () => {
    const now = Date.now();
    const result = parseAndExecute("now + 3 months");
    const elapsed = (result.value as number) - now;
    // convert uses 30 days/month = 2592000000 ms
    // 3 months * 2592000000 ms = 7776000000 ms
    // Allow for variance due to system clock precision
    expect(elapsed).toBeGreaterThanOrEqual(7775999000);
    expect(elapsed).toBeLessThanOrEqual(7776001000);
  });

  test("now + 1 year yields timestamp + approx 31536000000", () => {
    const now = Date.now();
    const result = parseAndExecute("now + 1 year");
    const elapsed = (result.value as number) - now;
    // convert uses 365 days/year = 31536000 seconds
    expect(elapsed).toBeGreaterThanOrEqual(31535999000);
    expect(elapsed).toBeLessThanOrEqual(31536001000);
  });

  test("now + 10 seconds yields timestamp + ~10000", () => {
    const now = Date.now();
    const result = parseAndExecute("now + 10 seconds");
    const elapsed = (result.value as number) - now;
    expect(elapsed).toBeGreaterThanOrEqual(9995);
    expect(elapsed).toBeLessThanOrEqual(10020); // Increased tolerance for system timing variability
  });

  test("now - 10 seconds yields timestamp - ~10000", () => {
    const now = Date.now();
    const result = parseAndExecute("now - 10 seconds");
    const elapsed = (result.value as number) - now;
    expect(elapsed).toBeGreaterThanOrEqual(-10010);
    expect(elapsed).toBeLessThanOrEqual(-9985); // Increased tolerance for timing variability
  });

  test("now + 5 minutes yields ~300000", () => {
    const now = Date.now();
    const result = parseAndExecute("now + 5 minutes");
    const elapsed = (result.value as number) - now;
    expect(elapsed).toBeGreaterThanOrEqual(299000);
    expect(elapsed).toBeLessThanOrEqual(301000);
  });

  test("now + 2 hours yields ~7200000", () => {
    const now = Date.now();
    const result = parseAndExecute("now + 2 hours");
    const elapsed = (result.value as number) - now;
    expect(elapsed).toBeGreaterThanOrEqual(7190000);
    expect(elapsed).toBeLessThanOrEqual(7210000);
  });

  test("today + 3 days yields ~259200000", () => {
    const now = Date.now();
    const result = parseAndExecute("today + 3 days");
    const elapsed = (result.value as number) - now;
    expect(elapsed).toBeGreaterThanOrEqual(259000000);
    expect(elapsed).toBeLessThanOrEqual(260000000);
  });

  test("yesterday + 1 day = tomorrow", () => {
    const yesterday = parseAndExecute("yesterday");
    const result = parseAndExecute("yesterday + 1 day");
    const diff = (result.value as number) - (yesterday.value as number);
    expect(diff).toBeCloseTo(86400000, -2);
  });

  test("tomorrow - 1 day = today (or yesterday)", () => {
    const tomorrow = parseAndExecute("tomorrow");
    const result = parseAndExecute("tomorrow - 1 day");
    const diff = (result.value as number) - (tomorrow.value as number);
    expect(diff).toBeCloseTo(-86400000, -2);
  });

  test("now + 1 week yields ~604800000", () => {
    const now = Date.now();
    const result = parseAndExecute("now + 1 week");
    const elapsed = (result.value as number) - now;
    expect(elapsed).toBeGreaterThanOrEqual(604000000);
    expect(elapsed).toBeLessThanOrEqual(606000000);
  });

  test("14 days returns ValueType.Uom", () => {
    const result = parseAndExecute("14 days");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.value).toBe(14);
    expect(result.unit).toBe("days");
  });

  test("now + 14 days works with ValueType.Uom", () => {
    const now = Date.now();
    const result = parseAndExecute("now + 14 days");
    const elapsed = (result.value as number) - now;
    const expectedMs = 14 * 24 * 60 * 60 * 1000;
    expect(elapsed).toBeGreaterThanOrEqual(expectedMs - 100);
    expect(elapsed).toBeLessThanOrEqual(expectedMs + 100);
  });

  test("5 years in days conversion", () => {
    const result = parseAndExecute("5 years in days");
    expect(result.type).toBe(ValueType.Uom);
    // 5 years * 365 days/year = 1825 days (using convert)
    expect(result.value).toBeCloseTo(1825, 0); 
    expect(result.unit).toBe("days");
  });
});