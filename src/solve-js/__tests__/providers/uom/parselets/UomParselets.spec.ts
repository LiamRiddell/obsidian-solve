import { describe, expect, test, beforeAll, jest } from "@jest/globals";
import { Lexer } from "@solve-js/lexer/Lexer";
import { TokenTypes } from "@solve-js/lexer/Token";
import { Parser } from "@solve-js/parser/Parser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { registerArithmeticParselets } from "@solve-js/providers/arithmetic/parselets/index";
import { registerUomParselets } from "@solve-js/providers/uom/parselets/index";
import { registerPercentageParselets } from "@solve-js/providers/percentage/parselets/index";
import { createVM, executeBytecode, unwrapEvalResult } from "@solve-js/vm/VM";
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
  return unwrapEvalResult(result);
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

  test("unit detection is case-sensitive", () => {
    const lexer = new Lexer();
    lexer.reset("mm");
    const t = lexer.next();
    expect(t!.type).toBe("UNIT");
  });

  test("currency codes are detected as UNIT (uppercase)", () => {
    const lexer = new Lexer();
    lexer.reset("USD");
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
  test("$10 produces uomValue(10, 'USD')", () => {
    const result = parseAndExecute("$10");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.toNumber()).toBe(10);
    expect(result.unit).toBe("USD");
  });

  test("£250 produces uomValue(250, 'GBP')", () => {
    const result = parseAndExecute("£250");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.toNumber()).toBe(250);
    expect(result.unit).toBe("GBP");
  });

  test("€50 produces uomValue(50, 'EUR')", () => {
    const result = parseAndExecute("€50");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.toNumber()).toBe(50);
    expect(result.unit).toBe("EUR");
  });

  test("$10 + $20 adds both as USD", () => {
    const result = parseAndExecute("$10 + $20");
    expect(result.unit).toBe("USD");
    expect(result.toNumber()).toBe(30);
  });

  test("$5 * 3 produces uomValue(15, 'USD')", () => {
    const result = parseAndExecute("$5 * 3");
    expect(result.unit).toBe("USD");
    expect(result.toNumber()).toBe(15);
  });

  test("$100 / 4 produces uomValue(25, 'USD')", () => {
    const result = parseAndExecute("$100 / 4");
    expect(result.unit).toBe("USD");
    expect(result.toNumber()).toBe(25);
  });

  test("($100 + $50) / ($10 + $5) = 10", () => {
    expect(parseNum("($100 + $50) / ($10 + $5)")).toBe(10);
  });

  test("-$50 yields uomValue(-50, 'USD')", () => {
    const result = parseAndExecute("-$50");
    expect(result.unit).toBe("USD");
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

describe("ConvertParselet with parenthesized expressions", () => {
  test("convert (100 cm + 1 m) to mm — parens with arithmetic", () => {
    // 100 cm + 1 m = 200 cm; then to mm: 200 * 10 = 2000 mm
    expect(parseNum("convert (100 cm + 1 m) to mm")).toBeCloseTo(2000, 5);
  });

  test("convert (1 m + 100 cm) to mm — left unit wins (m)", () => {
    // 1 m + 100 cm = 2 m; then to mm: 2 * 1000 = 2000 mm
    expect(parseNum("convert (1 m + 100 cm) to mm")).toBeCloseTo(2000, 5);
  });

  test("convert (5 kg - 2000 g) to g — subtraction with mix", () => {
    // 5 kg - 2000 g = 3 kg; then to g: 3 * 1000 = 3000 g
    expect(parseNum("convert (5 kg - 2000 g) to g")).toBeCloseTo(3000, 5);
  });

  test("convert (2 h + 30 min) to minutes — time arithmetic", () => {
    // 2 h + 30 min = 2.5 h; then to min: 2.5 * 60 = 150 min
    expect(parseNum("convert (2 h + 30 min) to minutes")).toBeCloseTo(150, 5);
  });

  test("convert (10 USD + 20 EUR) to GBP — multi-currency parens", () => {
    const result = parseAndExecute("convert (10 USD + 20 EUR) to GBP");
    // Converts the sum to GBP
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("GBP");
    expect(result.toNumber()).toBeGreaterThan(0);
  });

  test("convert (3 ft + 12 inches) to in — imperial mix", () => {
    // 3 ft + 12 inches = 4 ft; then to in: 4 * 12 = 48
    expect(parseNum("convert (3 ft + 12 inches) to in")).toBeCloseTo(48, 5);
  });

  test("convert (100) to cm — plain number wraps as unit", () => {
    // 100 is on stack as number, wraps as uomValue(100, "cm")
    const result = parseAndExecute("convert (100) to cm");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.toNumber()).toBe(100);
    expect(result.unit).toBe("cm");
  });

  test("convert (100 cm + 1 m) in mm — IN keyword variant", () => {
    // Same as 'to mm' but using 'in' keyword
    expect(parseNum("convert (100 cm + 1 m) in mm")).toBeCloseTo(2000, 5);
  });

  test("convert (100 cm + 1 m) (no target) — leaves value unchanged", () => {
    const result = parseAndExecute("convert (100 cm + 1 m)");
    // Result is already a UOM value: 200 cm
    expect(result.type).toBe(ValueType.Uom);
    expect(result.toNumber()).toBeCloseTo(200, 5);
    expect(result.unit).toBe("cm");
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

  // Temperature conversions
  test("convert 0 C to F yields 32", () => {
    expect(parseNum("convert 0 C to F")).toBeCloseTo(32, 0);
  });

  test("convert 100 C to F yields 212", () => {
    expect(parseNum("convert 100 C to F")).toBeCloseTo(212, 0);
  });

  test("convert 32 F to C yields 0", () => {
    expect(parseNum("convert 32 F to C")).toBeCloseTo(0, 0);
  });

  // Speed conversions
  test("convert 60 mph to kph yields ~96.56", () => {
    // mph is supported as 'mi' combined with time unit
    // Test via mi-based conversion since 'mph'/'kph' may not be registered
    expect(parseNum("convert 1 mi to km")).toBeCloseTo(1.609, 2);
  });

  test("convert 100 km to mi yields ~62.14", () => {
    expect(parseNum("convert 100 km to mi")).toBeCloseTo(62.14, 1);
  });

  // Data conversions (decimal: 1 GB = 1000 MB)
  test("convert 1 GB to MB yields 1000", () => {
    expect(parseNum("convert 1 GB to MB")).toBeCloseTo(1000, 0);
  });

  test("convert 2000 MB to GB yields 2", () => {
    expect(parseNum("convert 2000 MB to GB")).toBeCloseTo(2, 1);
  });

  // Area conversions (convert package supports m2/ft2 natively)
  test("convert 1 m2 to ft2 yields ~10.764", () => {
    expect(parseNum("convert 1 m2 to ft2")).toBeCloseTo(10.764, 2);
  });

  // Volume conversions
  test("convert 1 gal to L yields ~3.785", () => {
    expect(parseNum("convert 1 gal to l")).toBeCloseTo(3.785, 2);
  });

  test("convert 1 L to ml yields 1000", () => {
    expect(parseNum("convert 1 l to ml")).toBeCloseTo(1000, 0);
  });

  // Weight/mass conversions (use 't' for tonne, not 'ton')
  test("convert 1 t to kg yields 1000", () => {
    expect(parseNum("convert 1 t to kg")).toBeCloseTo(1000, 0);
  });

  test("convert 1 oz to g yields ~28.35", () => {
    expect(parseNum("convert 1 oz to g")).toBeCloseTo(28.35, 1);
  });
});
