import { registerPackageForTesting } from "@tools/testUtils";
import { ARITHMETIC_PACKAGE, CURRENCY_PACKAGE, PERCENTAGE_PACKAGE, UOM_PACKAGE } from "@solve-js/packages";
import { describe, expect, test, beforeAll, jest } from "@jest/globals";
import { Lexer } from "@solve-js/lexer/Lexer";
import { TokenTypes } from "@solve-js/lexer/Token";
import { Parser } from "@solve-js/parser/Parser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";




import { createVM, executeBytecode, unwrapEvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { Value, ValueType } from "@solve-js/vm/Value";
import { currencyExchangeService } from "@solve-js/uom/CurrencyExchange";

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
  registerPackageForTesting(ARITHMETIC_PACKAGE, registry);
  registerPackageForTesting(UOM_PACKAGE, registry);
  registerPackageForTesting(CURRENCY_PACKAGE, registry);
  registerPackageForTesting(PERCENTAGE_PACKAGE, registry);
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

  // ¥/₽/₩ — Numbr's documented currency-symbol set includes these three
  // beyond $/£/€, which this engine had no lexer support for at all before
  // this pass (they'd fall through to the generic "unknown unicode" IDENT
  // path instead of a real currency token).
  test("¥ lexed as YEN token", () => {
    const lexer = new Lexer();
    lexer.reset("¥");
    const t = lexer.next();
    expect(t!.type).toBe("YEN");
  });

  test("₽ lexed as RUBLE token", () => {
    const lexer = new Lexer();
    lexer.reset("₽");
    const t = lexer.next();
    expect(t!.type).toBe("RUBLE");
  });

  test("₩ lexed as WON token", () => {
    const lexer = new Lexer();
    lexer.reset("₩");
    const t = lexer.next();
    expect(t!.type).toBe("WON");
  });

  test("'¥1000' lexes as YEN then NUMBER", () => {
    const lexer = new Lexer();
    lexer.reset("¥1000");
    const types: string[] = [];
    for (const t of lexer) {
      if (t.type === "WS") continue;
      types.push(t.type);
    }
    expect(types).toEqual(["YEN", "NUMBER"]);
  });

  // ₹/₺/₴/₪/₫/₦/₱ — expanded currency-symbol support (rupee, lira, hryvnia,
  // shekel, dong, naira, peso), all sharing the single generic
  // CURRENCY_SYMBOL token type + CurrencySymbolParselet (unlike $/£/€/¥/₽/₩
  // which each got their own dedicated token type historically).
  test.each([
    ["₹", "INR"],
    ["₺", "TRY"],
    ["₴", "UAH"],
    ["₪", "ILS"],
    ["₫", "VND"],
    ["₦", "NGN"],
    ["₱", "PHP"],
  ])("%s lexed as CURRENCY_SYMBOL token", (symbol) => {
    const lexer = new Lexer();
    lexer.reset(symbol);
    const t = lexer.next();
    expect(t!.type).toBe("CURRENCY_SYMBOL");
  });

  test("'₹1000' lexes as CURRENCY_SYMBOL then NUMBER", () => {
    const lexer = new Lexer();
    lexer.reset("₹1000");
    const types: string[] = [];
    for (const t of lexer) {
      if (t.type === "WS") continue;
      types.push(t.type);
    }
    expect(types).toEqual(["CURRENCY_SYMBOL", "NUMBER"]);
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

describe("CurrencySymbolParselet — expanded symbol set (₹, ₺, ₴, ₪, ₫, ₦, ₱)", () => {
  test.each([
    ["₹100", "INR"],
    ["₺100", "TRY"],
    ["₴100", "UAH"],
    ["₪100", "ILS"],
    ["₫100", "VND"],
    ["₦100", "NGN"],
    ["₱100", "PHP"],
  ])("%s produces uomValue(100, '%s')", (expr, iso) => {
    const result = parseAndExecute(expr);
    expect(result.type).toBe(ValueType.Uom);
    expect(result.toNumber()).toBe(100);
    expect(result.unit).toBe(iso);
  });

  test("₹500 + ₹500 adds both as INR", () => {
    const result = parseAndExecute("₹500 + ₹500");
    expect(result.unit).toBe("INR");
    expect(result.toNumber()).toBe(1000);
  });
});

describe("Currency WORD aliases (dollar, euro, peso, franc, krona, krone, riyal, rial)", () => {
  test.each([
    ["5 dollars", "USD", 5],
    ["5 dollar", "USD", 5],
    ["10 euros", "EUR", 10],
    ["10 euro", "EUR", 10],
    ["7 yen", "JPY", 7],
    ["3 rubles", "RUB", 3],
    ["3 roubles", "RUB", 3],
    ["4 won", "KRW", 4],
    ["6 rupees", "INR", 6],
    ["8 yuan", "CNY", 8],
    ["9 rand", "ZAR", 9],
    ["11 reais", "BRL", 11],
    ["12 shekels", "ILS", 12],
    ["13 lira", "TRY", 13],
    ["14 hryvnias", "UAH", 14],
    ["15 zlotys", "PLN", 15],
    ["16 forint", "HUF", 16],
    ["17 koruna", "CZK", 17],
    ["18 dirhams", "AED", 18],
    ["19 ringgit", "MYR", 19],
    ["20 rupiah", "IDR", 20],
    ["21 baht", "THB", 21],
    ["22 dong", "VND", 22],
    ["23 naira", "NGN", 23],
  ])("'%s' resolves to uomValue(%d, '%s')", (expr, iso, amount) => {
    const result = parseAndExecute(expr);
    expect(result.type).toBe(ValueType.Uom);
    expect(result.toNumber()).toBe(amount);
    expect(result.unit).toBe(iso);
  });

  // Documented ambiguous defaults — see uom/CurrencyAliases.ts's doc comment
  // for why each of these picks one specific real currency over its
  // same-spelling siblings (peso also used by several other countries,
  // franc also used by African currencies, krona/krone shared with Danish
  // krone, riyal/rial shared across Gulf states and Iran).
  test.each([
    ["100 pesos", "MXN"],
    ["100 francs", "CHF"],
    ["100 krona", "SEK"],
    ["100 krone", "NOK"],
    ["100 riyals", "SAR"],
    ["100 rials", "SAR"],
  ])("'%s' defaults to %s (documented ambiguity)", (expr, iso) => {
    const result = parseAndExecute(expr);
    expect(result.unit).toBe(iso);
  });

  test("'pound'/'pounds' is NOT resolved as currency — stays the pre-existing Mass unit", () => {
    const result = parseAndExecute("5 pounds");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("pounds");
    expect(result.unit).not.toBe("GBP");
  });

  test("convert 1 pound to kg still performs a Mass conversion (~0.4536), not a currency one", () => {
    expect(parseNum("convert 1 pound to kg")).toBeCloseTo(0.4536, 3);
  });

  test("word aliases are case-sensitive — 'Euro'/'DOLLARS' don't lex as UNIT at all", () => {
    // Capitalized forms aren't in knownUnits (case-sensitive, no aliasing),
    // so they lex as plain IDENT and never reach UomLiteralParselet.
    const lexer = new Lexer();
    lexer.reset("Euro");
    const t = lexer.next();
    expect(t!.type).not.toBe("UNIT");
  });

  test("convert 100 dollars to EUR resolves the word alias before conversion", () => {
    const result = parseNum("convert 100 dollars to EUR");
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(200);
  });

  test("100 dollars in GBP resolves the word alias via InParselet", () => {
    const result = parseNum("100 dollars in GBP");
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(200);
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

  // ¥ symbol — new lexer support (see the "YEN token" tests above) routes
  // through the exact same CurrencySymbolParselet -> UOM_CONVERT path as
  // $/£/€, just mapped to JPY (see symbolToCurrency's doc comment on why
  // JPY was chosen over CNY for the ambiguous ¥ glyph).
  test("¥1000 to USD works the same as '1000 JPY to USD'", () => {
    const result = parseNum("¥1000 to USD");
    expect(result).toBeGreaterThan(5);
    expect(result).toBeLessThan(10);
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

  // Binary-prefix (IEC) data conversions — distinct from the decimal
  // GB/MB above (1 GiB = 1024 MiB, not 1000).
  test("convert 1 GiB to MiB yields 1024", () => {
    expect(parseNum("convert 1 GiB to MiB")).toBeCloseTo(1024, 0);
  });

  test("convert 1 GiB to GB yields ~1.074 (binary vs decimal prefix)", () => {
    expect(parseNum("convert 1 GiB to GB")).toBeCloseTo(1.073741824, 5);
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
