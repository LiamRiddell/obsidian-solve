/**
 * Finance package — compound interest / investment growth, mortgage/loan
 * repayment (standard amortization), and sales tax/VAT add-and-remove.
 *
 * The phrase-grammar forms ("compound interest on ...", "monthly
 * repayment on ...", "tax on ...", "vat off ...") all depend on phrase
 * fusion (see FinancePackage.ts's `phrases` field), which only happens
 * inside a real, fully-constructed ExpressionEngine — TokenNormalizer/
 * PhraseTrie aren't wired into the lightweight tokenize+parse harness this
 * file also uses for the function-call forms (compoundInterest(...),
 * monthlyPayment(...), taxAdd(...), ...), which route through
 * FUNCTION_PACKAGE's shared FUNC token instead and don't need fusion.
 * Real-engine tests use `evalReal()`. See MathPhrasesParselets.spec.ts for
 * the established pattern this file follows.
 *
 * Expected numeric results below are cross-checked against SoulverCore's
 * own documented worked examples (documentation.soulver.app/syntax-reference
 * /money-and-finance): compound interest "$1,000 after 3 years at 7%" ->
 * $1,225.04 / "interest on $1,000 after 3 years @ 7%" -> $225.04; mortgage
 * "monthly/annual/daily/total repayment on $10,000 over 6 years at 6%" ->
 * $165.73 / $1,988.75 / $5.45 / $11,932.48, and the matching interest
 * variants -> $26.84 / $322.08 / $0.88 / $1,932.48.
 */

import { registerPackageForTesting } from "@tools/testUtils";
import { ARITHMETIC_PACKAGE, FINANCE_PACKAGE, FUNCTION_PACKAGE } from "@solve-js/packages";
import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@solve-js/lexer/Lexer";
import { TokenTypes } from "@solve-js/lexer/Token";
import { Parser } from "@solve-js/parser/Parser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";

import { createVM, executeBytecode, unwrapEvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { Value, ValueType } from "@solve-js/vm/Value";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

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
  registerPackageForTesting(FUNCTION_PACKAGE, registry);
  registerPackageForTesting(FINANCE_PACKAGE, registry);
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

function evalReal(expr: string): Value {
  const engine = new ExpressionEngine("en");
  const [value] = engine.evaluateExpression(expr);
  return value;
}

describe("compoundInterest / interestEarned / compoundInterestRate / compoundInterestYears (function-call form)", () => {
  test("compoundInterest(1000, 0.07, 3) -> 1225.043 (future value)", () => {
    expect(parseAndExecute("compoundInterest(1000, 0.07, 3)").toNumber()).toBeCloseTo(1225.043, 3);
  });

  test("interestEarned(1000, 0.07, 3) -> 225.043 (interest only)", () => {
    expect(parseAndExecute("interestEarned(1000, 0.07, 3)").toNumber()).toBeCloseTo(225.043, 3);
  });

  test("compoundInterestRate(1000, 1225.043, 3) -> 0.07 (rate needed)", () => {
    expect(parseAndExecute("compoundInterestRate(1000, 1225.043, 3)").toNumber()).toBeCloseTo(0.07, 6);
  });

  test("compoundInterestYears(1000, 1225.043, 0.07) -> 3 (years needed)", () => {
    expect(parseAndExecute("compoundInterestYears(1000, 1225.043, 0.07)").toNumber()).toBeCloseTo(3, 5);
  });

  test("compoundInterest with a negative rate that still keeps (1+rate) positive works: compoundInterest(1000, -0.1, 2) -> 810", () => {
    expect(parseAndExecute("compoundInterest(1000, -0.1, 2)").toNumber()).toBeCloseTo(810, 6);
  });

  test("compoundInterest errors when (1+rate) is non-positive: compoundInterest(1000, -1.5, 2) -> Error", () => {
    expect(parseAndExecute("compoundInterest(1000, -1.5, 2)").type).toBe(ValueType.Error);
  });

  test("compoundInterestYears errors on a zero rate (no growth, undefined years): compoundInterestYears(1000, 2000, 0) -> Error", () => {
    expect(parseAndExecute("compoundInterestYears(1000, 2000, 0)").type).toBe(ValueType.Error);
  });
});

describe("loanRepayment / loanInterest / monthlyPayment (function-call form)", () => {
  test("monthlyPayment(10000, 0.06, 6) -> 165.7289 (matches SoulverCore's $165.73)", () => {
    expect(parseAndExecute("monthlyPayment(10000, 0.06, 6)").toNumber()).toBeCloseTo(165.7289, 3);
  });

  test("loanRepayment(10000, 0.06, 6, 12) -> same as monthlyPayment (periodsPerYear=12 is the monthly case)", () => {
    expect(parseAndExecute("loanRepayment(10000, 0.06, 6, 12)").toNumber()).toBeCloseTo(165.7289, 3);
  });

  test("loanRepayment(10000, 0.06, 6, 1) -> 1988.7465 (annual, matches SoulverCore's $1,988.75)", () => {
    expect(parseAndExecute("loanRepayment(10000, 0.06, 6, 1)").toNumber()).toBeCloseTo(1988.7465, 3);
  });

  test("loanRepayment(10000, 0.06, 6, 365) -> 5.4486 (daily, matches SoulverCore's $5.45)", () => {
    expect(parseAndExecute("loanRepayment(10000, 0.06, 6, 365)").toNumber()).toBeCloseTo(5.4486, 3);
  });

  test("loanRepayment(10000, 0.06, 6, 0) -> 11932.4793 (total, matches SoulverCore's $11,932.48)", () => {
    expect(parseAndExecute("loanRepayment(10000, 0.06, 6, 0)").toNumber()).toBeCloseTo(11932.4793, 3);
  });

  test("loanInterest(10000, 0.06, 6, 12) -> 26.84 (monthly interest, matches SoulverCore's $26.84)", () => {
    expect(parseAndExecute("loanInterest(10000, 0.06, 6, 12)").toNumber()).toBeCloseTo(26.84, 2);
  });

  test("loanInterest(10000, 0.06, 6, 1) -> 322.08 (annual interest, matches SoulverCore's $322.08)", () => {
    expect(parseAndExecute("loanInterest(10000, 0.06, 6, 1)").toNumber()).toBeCloseTo(322.08, 2);
  });

  test("loanInterest(10000, 0.06, 6, 365) -> 0.8824 (daily interest, matches SoulverCore's $0.88)", () => {
    expect(parseAndExecute("loanInterest(10000, 0.06, 6, 365)").toNumber()).toBeCloseTo(0.8824, 3);
  });

  test("loanInterest(10000, 0.06, 6, 0) -> 1932.4793 (total interest, matches SoulverCore's $1,932.48)", () => {
    expect(parseAndExecute("loanInterest(10000, 0.06, 6, 0)").toNumber()).toBeCloseTo(1932.4793, 3);
  });

  test("monthlyPayment with a zero rate falls back to a plain principal/periods split: monthlyPayment(1200, 0, 1) -> 100", () => {
    expect(parseAndExecute("monthlyPayment(1200, 0, 1)").toNumber()).toBeCloseTo(100, 6);
  });

  test("monthlyPayment errors on a negative principal: monthlyPayment(-100, 0.05, 5) -> Error", () => {
    expect(parseAndExecute("monthlyPayment(-100, 0.05, 5)").type).toBe(ValueType.Error);
  });

  test("monthlyPayment errors on zero years: monthlyPayment(1000, 0.05, 0) -> Error", () => {
    expect(parseAndExecute("monthlyPayment(1000, 0.05, 0)").type).toBe(ValueType.Error);
  });

  test("monthlyPayment errors on a negative rate: monthlyPayment(1000, -0.05, 5) -> Error", () => {
    expect(parseAndExecute("monthlyPayment(1000, -0.05, 5)").type).toBe(ValueType.Error);
  });
});

describe("taxAdd / taxRemove (function-call form)", () => {
  test("taxAdd(300, 0.2) -> 360", () => {
    expect(parseAndExecute("taxAdd(300, 0.2)").toNumber()).toBeCloseTo(360, 6);
  });

  test("taxRemove(360, 0.2) -> 300 (extracts the pre-tax amount from a tax-inclusive total)", () => {
    expect(parseAndExecute("taxRemove(360, 0.2)").toNumber()).toBeCloseTo(300, 6);
  });

  test("taxAdd and taxRemove round-trip: taxRemove(taxAdd(300, 0.08), 0.08) -> 300", () => {
    expect(parseAndExecute("taxRemove(taxAdd(300, 0.08), 0.08)").toNumber()).toBeCloseTo(300, 6);
  });

  test("taxRemove errors when (1+rate) is non-positive: taxRemove(300, -1.5) -> Error", () => {
    expect(parseAndExecute("taxRemove(300, -1.5)").type).toBe(ValueType.Error);
  });
});

describe("compound interest on / interest on (phrase-fused, real engine)", () => {
  test("compound interest on 1000 over 3 years at 7% -> 1225.043 (future value)", () => {
    expect(evalReal("compound interest on 1000 over 3 years at 7%").toNumber()).toBeCloseTo(1225.043, 3);
  });

  test("interest on 1000 over 3 years at 7% -> 225.043 (interest earned only)", () => {
    expect(evalReal("interest on 1000 over 3 years at 7%").toNumber()).toBeCloseTo(225.043, 3);
  });

  test("compound interest on $1000 over 3 years at 7% -> a currency-typed result ($1225.04-ish), preserving the '$' unit", () => {
    const value = evalReal("compound interest on $1000 over 3 years at 7%");
    expect(value.type).toBe(ValueType.Uom);
    expect(value.toNumber()).toBeCloseTo(1225.043, 3);
  });

  test("compound interest on (500 + 500) over 3 years at 7% -> operands can be full expressions", () => {
    expect(evalReal("compound interest on (500 + 500) over 3 years at 7%").toNumber()).toBeCloseTo(1225.043, 3);
  });
});

describe("[daily|monthly|annual|total] repayment/interest on ... (phrase-fused, real engine)", () => {
  test("monthly repayment on 10000 over 6 years at 6% -> 165.7289", () => {
    expect(evalReal("monthly repayment on 10000 over 6 years at 6%").toNumber()).toBeCloseTo(165.7289, 3);
  });

  test("annual repayment on 10000 over 6 years at 6% -> 1988.7465", () => {
    expect(evalReal("annual repayment on 10000 over 6 years at 6%").toNumber()).toBeCloseTo(1988.7465, 3);
  });

  test("daily repayment on 10000 over 6 years at 6% -> 5.4486", () => {
    expect(evalReal("daily repayment on 10000 over 6 years at 6%").toNumber()).toBeCloseTo(5.4486, 3);
  });

  test("total repayment on 10000 over 6 years at 6% -> 11932.4793", () => {
    expect(evalReal("total repayment on 10000 over 6 years at 6%").toNumber()).toBeCloseTo(11932.4793, 3);
  });

  test("monthly interest on 10000 over 6 years at 6% -> 26.84", () => {
    expect(evalReal("monthly interest on 10000 over 6 years at 6%").toNumber()).toBeCloseTo(26.84, 2);
  });

  test("annual interest on 10000 over 6 years at 6% -> 322.08", () => {
    expect(evalReal("annual interest on 10000 over 6 years at 6%").toNumber()).toBeCloseTo(322.08, 2);
  });

  test("daily interest on 10000 over 6 years at 6% -> 0.8824", () => {
    expect(evalReal("daily interest on 10000 over 6 years at 6%").toNumber()).toBeCloseTo(0.8824, 3);
  });

  test("total interest on 10000 over 6 years at 6% -> 1932.4793", () => {
    expect(evalReal("total interest on 10000 over 6 years at 6%").toNumber()).toBeCloseTo(1932.4793, 3);
  });

  test("monthly repayment on $10,000 over 6 years at 6% -> currency-typed result, preserving the '$' unit", () => {
    const value = evalReal("monthly repayment on $10000 over 6 years at 6%");
    expect(value.type).toBe(ValueType.Uom);
    expect(value.toNumber()).toBeCloseTo(165.7289, 3);
  });
});

describe("tax on / tax off / vat on / vat off (phrase-fused, real engine)", () => {
  test("tax on 300 at 20% -> 360", () => {
    expect(evalReal("tax on 300 at 20%").toNumber()).toBeCloseTo(360, 6);
  });

  test("tax off 360 at 20% -> 300 (extracts the pre-tax amount)", () => {
    expect(evalReal("tax off 360 at 20%").toNumber()).toBeCloseTo(300, 6);
  });

  test("vat on 300 at 20% -> 360 ('vat on' is an alias spelling of 'tax on')", () => {
    expect(evalReal("vat on 300 at 20%").toNumber()).toBeCloseTo(360, 6);
  });

  test("vat off 360 at 20% -> 300 ('vat off' is an alias spelling of 'tax off')", () => {
    expect(evalReal("vat off 360 at 20%").toNumber()).toBeCloseTo(300, 6);
  });

  test("tax on $300 at 8% -> a currency-typed result, preserving the '$' unit", () => {
    const value = evalReal("tax on $300 at 8%");
    expect(value.type).toBe(ValueType.Uom);
    expect(value.toNumber()).toBeCloseTo(324, 6);
  });
});

describe("FINANCE_PACKAGE — real engine wiring", () => {
  test("compound interest on works via the real, default-constructed ExpressionEngine", () => {
    expect(evalReal("compound interest on 1000 over 3 years at 7%").toNumber()).toBeCloseTo(1225.043, 3);
  });

  test("monthly repayment on works via the real engine", () => {
    expect(evalReal("monthly repayment on 10000 over 6 years at 6%").toNumber()).toBeCloseTo(165.7289, 3);
  });

  test("tax on works via the real engine", () => {
    expect(evalReal("tax on 300 at 20%").toNumber()).toBeCloseTo(360, 6);
  });

  test("regression guard: ':tax = ...' still works as a variable — phrase fusion for Finance must not claim bare 'tax' as a keyword (same regression class as MathPhrasesPackage.ts's ':total' guard)", () => {
    const engine = new ExpressionEngine("en");
    engine.evaluateExpression(":subtotal = 100");
    engine.evaluateExpression(":tax = 8");
    const [value] = engine.evaluateExpression(":total = :subtotal + :tax");
    expect(value.toNumber()).toBe(108);
  });

  test("regression guard: ':interest', ':principal', ':rate', ':payment', ':vat' all still work as variable names too", () => {
    const engine = new ExpressionEngine("en");
    engine.evaluateExpression(":principal = 1000");
    engine.evaluateExpression(":rate = 0.07");
    engine.evaluateExpression(":interest = 50");
    engine.evaluateExpression(":payment = 25");
    engine.evaluateExpression(":vat = 20");
    const [value] = engine.evaluateExpression(":principal + :rate + :interest + :payment + :vat");
    expect(value.toNumber()).toBeCloseTo(1000 + 0.07 + 50 + 25 + 20, 6);
  });

  test("regression guard: 'over'/'at' being new bare keywords doesn't break ordinary arithmetic elsewhere", () => {
    expect(evalReal("(1 + 2) * 3").toNumber()).toBe(9);
  });
});
