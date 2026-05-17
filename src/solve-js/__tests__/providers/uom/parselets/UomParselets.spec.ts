import { describe, expect, test, beforeAll, jest } from "@jest/globals";
import { Lexer } from "@solve-js/lexer/Lexer";
import { TokenTypes } from "@solve-js/lexer/Token";
import { Parser } from "@solve-js/parser/Parser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { registerArithmeticParselets } from "@solve-js/providers/arithmetic/parselets/index";
import { registerUomParselets } from "@solve-js/providers/uom/parselets/index";
import { registerPercentageParselets } from "@solve-js/providers/percentage/parselets/index";
import { createVM, executeBytecode } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { Value, ValueType } from "@solve-js/vm/Value";
import { currencyExchangeService } from "@solve-js/uom/CurrencyExchange";
import { dataQueryService } from "@solve-js/services/DataQueryService";

// Mock fetch and setup test environment
beforeAll(async () => {
  // Mock fetch for tests
  const mockFetch = jest.fn().mockImplementation(async (url: string) => {
    if (url.includes("frankfurter")) {
      return {
        ok: true,
        json: async () => ({
          rates: {
            EUR: 0.854,
            GBP: 0.739,
            JPY: 151.5,
          },
        }),
      };
    }
    return { ok: false };
  });
  (global as any).fetch = mockFetch;

  // Use main thread execution for tests (no worker)
  (dataQueryService as any).config.useWorker = false;

  // Pre-populate cache with test rates
  await currencyExchangeService.getRate("USD", "EUR");
  await currencyExchangeService.getRate("USD", "GBP");
  await currencyExchangeService.getRate("USD", "JPY");
  
  // Wait a bit for async operations
  await new Promise(resolve => setTimeout(resolve, 100));
});

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
  registerUomParselets(registry);
  registerPercentageParselets(registry);
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

function parseNum(input: string): number {
  return parseAndExecute(input).toNumber();
}

describe("UoM Lexer", () => {
  test("'10 mm' produces NUMBER then UNIT", () => {
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

  test("currency codes are detected as UNIT", () => {
    const lexer = new Lexer();
    lexer.reset("usd");
    const t = lexer.next();
    expect(t!.type).toBe("UNIT");
  });

  test("$ lexed as DOLLAR token", () => {
    const lexer = new Lexer();
    lexer.reset("$");
    const t = lexer.next();
    expect(t!.type).toBe("DOLLAR");
  });

  test("£ lexed as POUND token", () => {
    const lexer = new Lexer();
    lexer.reset("£");
    const t = lexer.next();
    expect(t!.type).toBe("POUND");
  });

  test("€ lexed as EURO token", () => {
    const lexer = new Lexer();
    lexer.reset("€");
    const t = lexer.next();
    expect(t!.type).toBe("EURO");
  });

  test("'$10' lexes as DOLLAR then NUMBER", () => {
    const lexer = new Lexer();
    lexer.reset("$10");
    const types: string[] = [];
    for (const t of lexer) {
      if (t.type === "WS") continue;
      types.push(t.type);
    }
    expect(types).toEqual(["DOLLAR", "NUMBER"]);
  });

  test("'£250' lexes as POUND then NUMBER", () => {
    const lexer = new Lexer();
    lexer.reset("£250");
    const types: string[] = [];
    for (const t of lexer) {
      if (t.type === "WS") continue;
      types.push(t.type);
    }
    expect(types).toEqual(["POUND", "NUMBER"]);
  });
});

describe("UomLiteralParselet (infix UNIT)", () => {
  test("10 mm produces number 10 tagged with mm", () => {
    const result = parseAndExecute("10 mm");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.toNumber()).toBe(10);
    expect(result.unit).toBe("mm");
  });

  test("5 kg produces number 5 tagged with kg", () => {
    const result = parseAndExecute("5 kg");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.toNumber()).toBe(5);
    expect(result.unit).toBe("kg");
  });

  test("3.5 m produces number 3.5 tagged with m", () => {
    const result = parseAndExecute("3.5 m");
    expect(result.toNumber()).toBeCloseTo(3.5);
    expect(result.unit).toBe("m");
  });

  test("100 cm evaluates and tags", () => {
    const result = parseAndExecute("100 cm");
    expect(result.toNumber()).toBe(100);
    expect(result.unit).toBe("cm");
  });

  test("UOM with same-unit arithmetic preserves unit: 10 m + 20 m", () => {
    const result = parseAndExecute("10 m + 20 m");
    expect(result.unit).toBe("m");
    expect(result.toNumber()).toBe(30);
  });

  test("UOM with scalar: 10 mm + 5 yields 15", () => {
    expect(parseNum("10 mm + 5")).toBe(15);
  });

  test("200 / 4 mm yields 50", () => {
    expect(parseNum("200 / 4 mm")).toBe(50);
  });
});

describe("CurrencySymbolParselet ($, £, €)", () => {
  test("$10 produces uomValue(10, 'usd')", () => {
    const result = parseAndExecute("$10");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.toNumber()).toBe(10);
    expect(result.unit).toBe("usd");
  });

  test("£250 produces uomValue(250, 'gbp')", () => {
    const result = parseAndExecute("£250");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.toNumber()).toBe(250);
    expect(result.unit).toBe("gbp");
  });

  test("€50 produces uomValue(50, 'eur')", () => {
    const result = parseAndExecute("€50");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.toNumber()).toBe(50);
    expect(result.unit).toBe("eur");
  });

  test("$10 + $20 adds both as usd", () => {
    const result = parseAndExecute("$10 + $20");
    expect(result.unit).toBe("usd");
    expect(result.toNumber()).toBe(30);
  });

  test("$5 * 3 produces uomValue(15, 'usd')", () => {
    const result = parseAndExecute("$5 * 3");
    expect(result.unit).toBe("usd");
    expect(result.toNumber()).toBe(15);
  });

  test("$100 / 4 produces uomValue(25, 'usd')", () => {
    const result = parseAndExecute("$100 / 4");
    expect(result.unit).toBe("usd");
    expect(result.toNumber()).toBe(25);
  });

  test("($100 + $50) / ($10 + $5) = 10", () => {
    expect(parseNum("($100 + $50) / ($10 + $5)")).toBe(10);
  });

  test("-$50 yields uomValue(-50, 'usd')", () => {
    const result = parseAndExecute("-$50");
    expect(result.unit).toBe("usd");
    expect(result.toNumber()).toBe(-50);
  });

  test("$1 + $1 = 2", () => {
    expect(parseNum("$1 + $1")).toBe(2);
  });

  test("$0.5 + $0.5 = 1", () => {
    expect(parseNum("$0.5 + $0.5")).toBe(1);
  });
});

describe("ConvertParselet (convert <val> <unit> to <target>)", () => {
  test("convert 100 cm to m yields 1", () => {
    expect(parseNum("convert 100 cm to m")).toBeCloseTo(1, 5);
  });

  test("convert 1 m to cm yields 100", () => {
    expect(parseNum("convert 1 m to cm")).toBeCloseTo(100, 5);
  });

  test("convert 1 kg to g yields 1000", () => {
    expect(parseNum("convert 1 kg to g")).toBeCloseTo(1000, 5);
  });

  test("convert 1000 g to kg yields 1", () => {
    expect(parseNum("convert 1000 g to kg")).toBeCloseTo(1, 5);
  });

  test("convert 1 h to s yields 3600", () => {
    expect(parseNum("convert 1 h to s")).toBeCloseTo(3600, 5);
  });

  test("convert 1 km to m yields 1000", () => {
    expect(parseNum("convert 1 km to m")).toBeCloseTo(1000, 5);
  });

  test("convert 1 l to ml yields 1000", () => {
    expect(parseNum("convert 1 l to ml")).toBeCloseTo(1000, 5);
  });

  test("convert 1 ft to inches yields 12", () => {
    expect(parseNum("convert 1 ft to inches")).toBeCloseTo(12, 5);
  });

  test("convert 1 inch to ft yields ~0.0833", () => {
    expect(parseNum("convert 1 inch to ft")).toBeCloseTo(0.0833, 2);
  });

  test("convert 1 m to ft yields ~3.281", () => {
    expect(parseNum("convert 1 m to ft")).toBeCloseTo(3.281, 2);
  });

  test("convert 1 lb to g yields ~453.6", () => {
    expect(parseNum("convert 1 lb to g")).toBeCloseTo(453.6, 0);
  });

  test("convert 1 C to F yields 33.8", () => {
    expect(parseNum("convert 1 C to F")).toBeCloseTo(33.8, 0);
  });
});

describe("ConvertParselet with currency", () => {
  test("convert 100 USD to EUR uses fallback rate", () => {
    const result = parseNum("convert 100 USD to EUR");
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(200);
  });

  test("convert 100 EUR to USD uses fallback rate", () => {
    const result = parseNum("convert 100 EUR to USD");
    expect(result).toBeGreaterThan(80);
    expect(result).toBeLessThan(150);
  });

  test("convert 1000 JPY to USD  uses fallback rate", () => {
    const result = parseNum("convert 1000 JPY to USD");
    expect(result).toBeGreaterThan(5);
    expect(result).toBeLessThan(10);
  });

  test("convert 50 USD to GBP uses fallback rate", () => {
    const result = parseNum("convert 50 USD to GBP");
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(100);
  });
});

describe("ConvertParselet without TO (just tag)", () => {
  test("convert 100 cm (no target) produces uomValue(100, 'cm')", () => {
    const result = parseAndExecute("convert 100 cm");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.toNumber()).toBe(100);
    expect(result.unit).toBe("cm");
  });

  test("convert 50 kg (no target) tags correctly", () => {
    const result = parseAndExecute("convert 50 kg");
    expect(result.toNumber()).toBe(50);
    expect(result.unit).toBe("kg");
  });
});

describe("UOM auto-conversion in arithmetic", () => {
  test("100 cm + 1 m = 200 cm (left unit wins)", () => {
    expect(parseNum("100 cm + 1 m")).toBeCloseTo(200, 5);
  });

  test("1 m + 100 cm = 2 m (left unit wins)", () => {
    expect(parseNum("1 m + 100 cm")).toBeCloseTo(2, 5);
  });

  test("1 kg + 500 g = 1.5 kg (left unit wins)", () => {
    expect(parseNum("1 kg + 500 g")).toBeCloseTo(1.5, 5);
  });

  test("500 g + 1 kg = 1500 g (left unit wins)", () => {
    expect(parseNum("500 g + 1 kg")).toBeCloseTo(1500, 5);
  });

  test("3 ft + 12 inches = 4 ft (left unit wins)", () => {
    expect(parseNum("3 ft + 12 inches")).toBeCloseTo(4, 5);
  });

  test("10 mm + 2 cm = 30 mm (left unit wins)", () => {
    expect(parseNum("10 mm + 2 cm")).toBeCloseTo(30, 5);
  });
});

describe("Regression: UoM Ohm grammar coverage", () => {
  test("100 cm to m parses and evaluates", () => {
    expect(parseAndExecute("100 cm to m")).toBeDefined();
  });

  test("convert 100 cm to m parses and evaluates", () => {
    expect(parseAndExecute("convert 100 cm to m")).toBeDefined();
  });
});
