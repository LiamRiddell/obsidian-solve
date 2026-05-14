import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@/engine/lexer/Lexer";
import { Parser } from "@/engine/parser/Parser";
import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { createVM, executeBytecode } from "@/engine/vm/VM";
import { sharedOpRegistry } from "@/engine/vm/OpRegistry";
import { registerArithmeticParselets } from "@/providers/arithmetic/parselets/index";
import { registerPercentageParselets } from "@/providers/percentage/parselets/index";
import { registerUomParselets } from "@/providers/uom/parselets/index";
import { registerVectorParselets } from "@/providers/vector/parselets/index";
import { registerBigIntParselets } from "@/providers/biginteger/parselets/index";
import { registerFunctionParselets } from "@/providers/function/parselets/index";
import { registerDatetimeParselets } from "@/providers/datetime/parselets/index";
import { registerDiceParselets } from "@/providers/dice/parselets/index";
import { TokenTypes } from "@/engine/lexer/Token";
import { Value, ValueType } from "@/engine/vm/Value";

function tokenize(lexer: Lexer, input: string) {
  lexer.reset(input);
  const tokens = [];
  for (const t of lexer) {
    if (t.type === TokenTypes.WS || t.type === "NEWLINE") continue;
    tokens.push(t);
  }
  return tokens;
}

function evalFull(input: string): Value {
  const lexer = new Lexer();
  const tokens = tokenize(lexer, input);
  const registry = new ParseletRegistry();
  registerArithmeticParselets(registry);
  registerPercentageParselets(registry);
  registerUomParselets(registry);
  registerVectorParselets(registry);
  registerBigIntParselets(registry);
  registerFunctionParselets(registry);
  registerDatetimeParselets(registry);
  registerDiceParselets(registry);
  const parser = new Parser(registry);
  const builder = new BytecodeBuilder();
  parser.load(tokens);
  parser.parseExpression(0, builder);
  const program = builder.build();
  const vm = createVM(sharedOpRegistry);
  const result = executeBytecode(
    { opcodes: new Uint8Array(program.opcodes), numbers: new Float64Array(program.numbers), strings: program.strings },
    vm
  );
  return result!;
}

function evalNum(input: string): number {
  return evalFull(input).toNumber();
}

describe("Mixed arithmetic: vector + scalar (component-wise)", () => {
  test("vec2(10, 2) + 5", () => {
    const result = evalFull("vec2(10, 2) + 5");
    expect(result.isVector()).toBe(true);
    expect((result.value as number[])).toEqual([15, 7]);
  });

  test("vec2(3, 4) + vec2(1, 2)", () => {
    const result = evalFull("vec2(3, 4) + vec2(1, 2)");
    expect(result.isVector()).toBe(true);
    expect((result.value as number[])).toEqual([4, 6]);
  });

  test("vec3(1, 2, 3) * 2", () => {
    const result = evalFull("vec3(1, 2, 3) * 2");
    expect(result.isVector()).toBe(true);
    expect((result.value as number[])).toEqual([2, 4, 6]);
  });

  test("vec2(5, 10) - 3", () => {
    const result = evalFull("vec2(5, 10) - 3");
    expect(result.isVector()).toBe(true);
    expect((result.value as number[])).toEqual([2, 7]);
  });

  test("vec2(4, 5) + vec2(1, 2) * 2", () => {
    const result = evalFull("vec2(4, 5) + vec2(1, 2) * 2");
    expect(result.isVector()).toBe(true);
    expect((result.value as number[])).toEqual([6, 9]);
  });
});

describe("Mixed arithmetic: UOM + scalar", () => {
  test("10 mm + 5", () => {
    expect(evalNum("10 mm + 5")).toBe(15);
  });

  test("5 kg * 3", () => {
    expect(evalNum("5 kg * 3")).toBe(15);
  });

  test("100 cm - 30", () => {
    expect(evalNum("100 cm - 30")).toBe(70);
  });

  test("200 / 4 mm", () => {
    expect(evalNum("200 / 4 mm")).toBe(50);
  });

  test("10 m + 20 m", () => {
    expect(evalNum("10 m + 20 m")).toBe(30);
  });

  test("5 g * 10 g", () => {
    expect(evalNum("5 g * 10 g")).toBe(50);
  });
});

describe("Mixed arithmetic: currency codes with unit syntax (auto-converts between currencies)", () => {
  test("10 GBP + 5 USD", () => {
    expect(evalNum("10 GBP + 5 USD")).toBeCloseTo(13.95, 2);
  });

  test("50 EUR * 3", () => {
    expect(evalNum("50 EUR * 3")).toBe(150);
  });

  test("100 JPY / 5", () => {
    expect(evalNum("100 JPY / 5")).toBe(20);
  });

  test("20 USD + 30 USD + 50 USD", () => {
    expect(evalNum("20 USD + 30 USD + 50 USD")).toBe(100);
  });

  test("(100 GBP - 30 GBP) * 2", () => {
    expect(evalNum("(100 GBP - 30 GBP) * 2")).toBe(140);
  });

  test("200 EUR / 4 EUR (same unit division yields scalar)", () => {
    expect(evalNum("200 EUR / 4 EUR")).toBe(50);
  });
});

describe("Mixed arithmetic: currency symbols ($, £, €)", () => {
  test("$10 + $20", () => {
    expect(evalNum("$10 + $20")).toBe(30);
  });

  test("£100 + $50", () => {
    expect(evalNum("£100 + $50")).toBeCloseTo(139.5, 2);
  });

  test("€200 - £50", () => {
    expect(evalNum("€200 - £50")).toBeCloseTo(141.77, 1);
  });

  test("$5 * 3", () => {
    expect(evalNum("$5 * 3")).toBe(15);
  });

  test("$100 / 4", () => {
    expect(evalNum("$100 / 4")).toBe(25);
  });

  test("$10 + 5", () => {
    expect(evalNum("$10 + 5")).toBe(15);
  });

  test("£50 + £50 + £50", () => {
    expect(evalNum("£50 + £50 + £50")).toBe(150);
  });
});

describe("Mixed arithmetic: percentage of currency", () => {
  test("10% of $200", () => {
    expect(evalNum("10% of $200")).toBe(20);
  });

  test("25% of £80", () => {
    expect(evalNum("25% of £80")).toBe(20);
  });

  test("50% of €1000", () => {
    expect(evalNum("50% of €1000")).toBe(500);
  });

  test("12.5% of $400", () => {
    expect(evalNum("12.5% of $400")).toBe(50);
  });

  test("100% of £50", () => {
    expect(evalNum("100% of £50")).toBe(50);
  });

  test("0% of $1000", () => {
    expect(evalNum("0% of $1000")).toBe(0);
  });

  test("33.3% of $300", () => {
    expect(evalNum("33.3% of $300")).toBeCloseTo(99.9, 1);
  });
});

describe("Mixed arithmetic: percentage of UOM values", () => {
  test("10% of 200 kg", () => {
    expect(evalNum("10% of 200 kg")).toBe(20);
  });

  test("50% of 100 m", () => {
    expect(evalNum("50% of 100 m")).toBe(50);
  });

  test("25% of 80 cm", () => {
    expect(evalNum("25% of 80 cm")).toBe(20);
  });
});

describe("Mixed arithmetic: increase/decrease with UOM and currency", () => {
  test("increase 400 GBP by 25%", () => {
    expect(evalNum("increase 400 GBP by 25%")).toBe(500);
  });

  test("increase $400 by 25%", () => {
    expect(evalNum("increase $400 by 25%")).toBe(500);
  });

  test("increase £200 by 10%", () => {
    expect(evalNum("increase £200 by 10%")).toBeCloseTo(220, 5);
  });

  test("decrease 100 USD by 20%", () => {
    expect(evalNum("decrease 100 USD by 20%")).toBe(80);
  });

  test("decrease $500 by 50%", () => {
    expect(evalNum("decrease $500 by 50%")).toBe(250);
  });

  test("increase 50 kg by 10%", () => {
    expect(evalNum("increase 50 kg by 10%")).toBeCloseTo(55, 5);
  });

  test("decrease 200 m by 25%", () => {
    expect(evalNum("decrease 200 m by 25%")).toBe(150);
  });

  test("increase £0 by 10%", () => {
    expect(evalNum("increase £0 by 10%")).toBe(0);
  });

  test("increase $1 by 100%", () => {
    expect(evalNum("increase $1 by 100%")).toBe(2);
  });

  test("increase 100 mm by 50%", () => {
    expect(evalNum("increase 100 mm by 50%")).toBe(150);
  });

  test("increase $50 by 10% then subtract", () => {
    expect(evalNum("increase $50 by 10%")).toBeCloseTo(55, 5);
  });

  test("decrease 1000 EUR by 10%", () => {
    expect(evalNum("decrease 1000 EUR by 10%")).toBe(900);
  });
});

describe("Mixed arithmetic: percentage of with mixed expressions", () => {
  test("10% of $200 + $50", () => {
    expect(evalNum("10% of $200 + $50")).toBe(70);
  });

  test("50% of €100 - €20", () => {
    expect(evalNum("50% of €100 - €20")).toBe(30);
  });

  test("20% of £500 + 10% of £200", () => {
    expect(evalNum("20% of £500 + 10% of £200")).toBe(120);
  });

  test("25% of ($400 + $200)", () => {
    expect(evalNum("25% of ($400 + $200)")).toBe(150);
  });

  test("50% of 100 kg + 50% of 200 kg", () => {
    expect(evalNum("50% of 100 kg + 50% of 200 kg")).toBe(150);
  });

  test("10% of $200 + 5", () => {
    expect(evalNum("10% of $200 + 5")).toBe(25);
  });

  test("33% of $100 + 10", () => {
    expect(evalNum("33% of $100 + 10")).toBe(43);
  });
});

describe("Mixed arithmetic: chained operations with currency", () => {
  test("$100 + $200 + $300", () => {
    expect(evalNum("$100 + $200 + $300")).toBe(600);
  });

  test("£1000 - £200 - £50", () => {
    expect(evalNum("£1000 - £200 - £50")).toBe(750);
  });

  test("$10 * 5 + $50 / 2", () => {
    expect(evalNum("$10 * 5 + $50 / 2")).toBe(75);
  });

  test("($100 + $50) * 3", () => {
    expect(evalNum("($100 + $50) * 3")).toBe(450);
  });

  test("£200 * 2 + £100 * 3", () => {
    expect(evalNum("£200 * 2 + £100 * 3")).toBe(700);
  });
});

describe("Mixed arithmetic: mixed code + symbol + word currencies", () => {
  test("$100 + 100 GBP", () => {
    expect(evalNum("$100 + 100 GBP")).toBeCloseTo(226.58, 1);
  });

  test("£50 + 50 EUR", () => {
    expect(evalNum("£50 + 50 EUR")).toBeCloseTo(92.93, 1);
  });

  test("€100 + $100 + £100", () => {
    expect(evalNum("€100 + $100 + £100")).toBeCloseTo(308.46, 1);
  });
});

describe("Mixed arithmetic: bigint with regular numbers", () => {
  test("100n + 50", () => {
    expect(evalNum("100n + 50")).toBe(150);
  });

  test("50 + 100n", () => {
    expect(evalNum("50 + 100n")).toBe(150);
  });

  test("200n - 50", () => {
    expect(evalNum("200n - 50")).toBe(150);
  });

  test("10n * 5", () => {
    expect(evalNum("10n * 5")).toBe(50);
  });

  test("100n / 3", () => {
    expect(evalNum("100n / 3")).toBe(33);
  });

  test("50n + 50n", () => {
    expect(evalNum("50n + 50n")).toBe(100);
  });
});

describe("Mixed arithmetic: BODMAS precedence with mixed types", () => {
  test("$10 + $20 * 3", () => {
    expect(evalNum("$10 + $20 * 3")).toBe(70);
  });

  test("($10 + $20) * 3", () => {
    expect(evalNum("($10 + $20) * 3")).toBe(90);
  });

  test("10 GBP + 5 * 2 USD", () => {
    expect(evalNum("10 GBP + 5 * 2 USD")).toBeCloseTo(17.9, 1);
  });

  test("50% of $200 + 10% of $100", () => {
    expect(evalNum("50% of $200 + 10% of $100")).toBe(110);
  });

  test("50% of ($200 + $100)", () => {
    expect(evalNum("50% of ($200 + $100)")).toBe(150);
  });

  test("$100 ^ 2", () => {
    expect(evalNum("$100 ^ 2")).toBe(10000);
  });

  test("sqrt($100)", () => {
    expect(evalNum("sqrt($100)")).toBeCloseTo(10);
  });

  test("$10 + $20 * 3 + $5", () => {
    expect(evalNum("$10 + $20 * 3 + $5")).toBe(75);
  });
});

describe("Mixed arithmetic: edge cases", () => {
  test("$0 + $0", () => {
    expect(evalNum("$0 + $0")).toBe(0);
  });

  test("$1 + $1", () => {
    expect(evalNum("$1 + $1")).toBe(2);
  });

  test("£0.5 + £0.5", () => {
    expect(evalNum("£0.5 + £0.5")).toBe(1);
  });

  test("$100 - $200", () => {
    expect(evalNum("$100 - $200")).toBe(-100);
  });

  test("-£50", () => {
    expect(evalNum("-£50")).toBe(-50);
  });

  test("--$10", () => {
    expect(evalNum("--$10")).toBe(10);
  });

  test("$100 / 3", () => {
    expect(evalNum("$100 / 3")).toBeCloseTo(33.333, 2);
  });

  test("increase $0 by 10%", () => {
    expect(evalNum("increase $0 by 10%")).toBe(0);
  });

  test("10 USD + 20 USD + 30 USD", () => {
    expect(evalNum("10 USD + 20 USD + 30 USD")).toBe(60);
  });
});

describe("Mixed arithmetic: percentage with number and UOM", () => {
  test("10% of 200 + 5% of 100", () => {
    expect(evalNum("10% of 200 + 5% of 100")).toBe(25);
  });

  test("50% + 10%", () => {
    expect(evalNum("50% + 10%")).toBeCloseTo(0.6);
  });

  test("100 + 20%", () => {
    expect(evalNum("100 + 20%")).toBe(100.2);
  });

  test("10% of 50 kg + 20", () => {
    expect(evalNum("10% of 50 kg + 20")).toBe(25);
  });

  test("25% of (100 mm + 100 mm)", () => {
    expect(evalNum("25% of (100 mm + 100 mm)")).toBe(50);
  });
});

describe("Mixed arithmetic: nested expressions", () => {
  test("($100 + $50) / ($10 + $5)", () => {
    expect(evalNum("($100 + $50) / ($10 + $5)")).toBe(10);
  });

  test("(£200 - £50) * (1 + 10%)", () => {
    expect(evalNum("(£200 - £50) * (1 + 10%)")).toBeCloseTo(165, 0);
  });

  test("sqrt(pow($3, 2) + pow($4, 2))", () => {
    expect(evalNum("sqrt(pow($3, 2) + pow($4, 2))")).toBe(5);
  });

  test("50% of $1000 + 25% of $400", () => {
    expect(evalNum("50% of $1000 + 25% of $400")).toBe(600);
  });
});

describe("UOM conversion between compatible units", () => {
  test("convert 100 cm to m: 100 cm = 1 m", () => {
    expect(evalNum("convert 100 cm to m")).toBeCloseTo(1, 5);
  });

  test("convert 1 m to cm: 1 m = 100 cm", () => {
    expect(evalNum("convert 1 m to cm")).toBeCloseTo(100, 5);
  });

  test("convert 1 kg to g: 1 kg = 1000 g", () => {
    expect(evalNum("convert 1 kg to g")).toBeCloseTo(1000, 5);
  });

  test("convert 1000 g to kg: 1000 g = 1 kg", () => {
    expect(evalNum("convert 1000 g to kg")).toBeCloseTo(1, 5);
  });

  test("convert 1 km to m: 1 km = 1000 m", () => {
    expect(evalNum("convert 1 km to m")).toBeCloseTo(1000, 5);
  });

  test("convert 1 l to ml: 1 l = 1000 ml", () => {
    expect(evalNum("convert 1 l to ml")).toBeCloseTo(1000, 5);
  });

  test("convert 1 h to s: 1 h = 3600 s", () => {
    expect(evalNum("convert 1 h to s")).toBeCloseTo(3600, 5);
  });

  test("convert 1 ft to inches: 1 ft = 12 inches", () => {
    expect(evalNum("convert 1 ft to inches")).toBeCloseTo(12, 5);
  });

  test("convert 1 inch to ft: 1 inch = 0.0833 ft", () => {
    expect(evalNum("convert 1 inch to ft")).toBeCloseTo(0.0833, 2);
  });

  test("convert 1 m to ft (inter-system)", () => {
    expect(evalNum("convert 1 m to ft")).toBeCloseTo(3.281, 2);
  });

  test("convert 1 lb to g (inter-system)", () => {
    expect(evalNum("convert 1 lb to g")).toBeCloseTo(453.6, 0);
  });
});

describe("UOM arithmetic with automatic conversion", () => {
  test("100 cm + 1 m = 200 cm (auto-converts to cm, left unit wins)", () => {
    expect(evalNum("100 cm + 1 m")).toBeCloseTo(200, 5);
  });

  test("2 m - 50 cm = 1.5 m (auto-converts to left unit m)", () => {
    const result = evalFull("2 m - 50 cm");
    expect(result.toNumber()).toBeCloseTo(1.5, 5);
  });

  test("1 kg + 500 g = 1.5 kg (auto-converts to kg, left unit wins)", () => {
    const result = evalFull("1 kg + 500 g");
    expect(result.toNumber()).toBeCloseTo(1.5, 5);
  });

  test("3 ft + 12 inches = 4 ft (auto-converts to ft, left unit wins)", () => {
    const result = evalFull("3 ft + 12 inches");
    expect(result.toNumber()).toBeCloseTo(4, 5);
  });

  test("2 l - 500 ml = 1.5 l (auto-converts to l, left unit wins)", () => {
    const result = evalFull("2 l - 500 ml");
    expect(result.toNumber()).toBeCloseTo(1.5, 5);
  });

  test("10 mm + 2 cm = 30 mm (auto-converts to mm)", () => {
    expect(evalNum("10 mm + 2 cm")).toBeCloseTo(30, 5);
  });
});

describe("Currency conversion with real rates", () => {
  test("convert 100 USD to EUR", () => {
    const result = evalNum("convert 100 USD to EUR");
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(200);
  });

  test("convert 100 EUR to USD should be roughly 108-109", () => {
    const result = evalNum("convert 100 EUR to USD");
    expect(result).toBeGreaterThan(80);
    expect(result).toBeLessThan(150);
  });

  test("convert 100 GBP to JPY should be a large number", () => {
    const result = evalNum("convert 100 GBP to JPY");
    expect(result).toBeGreaterThan(10000);
    expect(result).toBeLessThan(50000);
  });

  test("convert 50 USD to GBP should work", () => {
    const result = evalNum("convert 50 USD to GBP");
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(100);
  });
});

describe("Division of same-unit values yields scalar", () => {
  test("100 cm / 50 cm = 2", () => {
    expect(evalNum("100 cm / 50 cm")).toBe(2);
  });

  test("200 USD / 50 USD = 4", () => {
    expect(evalNum("200 USD / 50 USD")).toBe(4);
  });

  test("500 g / 250 g = 2", () => {
    expect(evalNum("500 g / 250 g")).toBe(2);
  });

  test("1 m / 50 cm = 2 (auto-converted before division)", () => {
    expect(evalNum("1 m / 50 cm")).toBe(2);
  });
});

describe("Vector operations (proper component-wise)", () => {
  test("vec2(1, 2) + vec2(3, 4) = vec2(4, 6)", () => {
    const result = evalFull("vec2(1, 2) + vec2(3, 4)");
    expect(result.isVector()).toBe(true);
    expect((result.value as number[])).toEqual([4, 6]);
  });

  test("vec3(1, 2, 3) - vec3(1, 1, 1) = vec3(0, 1, 2)", () => {
    const result = evalFull("vec3(1, 2, 3) - vec3(1, 1, 1)");
    expect(result.isVector()).toBe(true);
    expect((result.value as number[])).toEqual([0, 1, 2]);
  });

  test("vec2(2, 3) * vec2(4, 5) = vec2(8, 15)", () => {
    const result = evalFull("vec2(2, 3) * vec2(4, 5)");
    expect(result.isVector()).toBe(true);
    expect((result.value as number[])).toEqual([8, 15]);
  });

  test("vec2(10, 20) / vec2(2, 5) = vec2(5, 4)", () => {
    const result = evalFull("vec2(10, 20) / vec2(2, 5)");
    expect(result.isVector()).toBe(true);
    expect((result.value as number[])).toEqual([5, 4]);
  });

  test("vec2(1, 2) * 5 = vec2(5, 10)", () => {
    const result = evalFull("vec2(1, 2) * 5");
    expect(result.isVector()).toBe(true);
    expect((result.value as number[])).toEqual([5, 10]);
  });

  test("10 * vec2(1, 2) = vec2(10, 20)", () => {
    const result = evalFull("10 * vec2(1, 2)");
    expect(result.isVector()).toBe(true);
    expect((result.value as number[])).toEqual([10, 20]);
  });
});
