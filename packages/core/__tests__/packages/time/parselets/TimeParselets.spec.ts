/**
 * Time package — clock-time-of-day literals and intervals.
 *
 * Covers GitHub issue #68 ("Add support for parsing hours/minutes") and
 * SoulverCore's `syntax-reference/time/clock-time-calculations` page.
 */

import { registerPackageForTesting } from "@tools/testUtils";
import { ARITHMETIC_PACKAGE, TIME_PACKAGE, UOM_PACKAGE } from "@solve-js/packages";
import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@solve-js/lexer/Lexer";
import { TokenTypes } from "@solve-js/lexer/Token";
import { Parser } from "@solve-js/parser/Parser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";

import { createVM, executeBytecode, unwrapEvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { Value, ValueType } from "@solve-js/vm/Value";
import { TokenNormalizer } from "@solve-js/normalizer";
import { clockTimeNormalizerRule } from "@solve-js/packages/time/normalizer/ClockTimeNormalizerRule";
import { clockTimeIntervalNormalizerRule } from "@solve-js/packages/time/normalizer/ClockTimeIntervalNormalizerRule";
import { fpsRateNormalizerRule } from "@solve-js/packages/time/normalizer/FpsRateNormalizerRule";
import { laptimeNormalizerRule } from "@solve-js/packages/time/normalizer/LaptimeNormalizerRule";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { isRateUnit } from "@solve-js/vm/Value";

const normalizer = new TokenNormalizer();
// Laptime MUST be registered (or at least tried) before clock-time can
// greedily grab just the first "H:M" of an "H:M:S" laptime — the
// normalizer sorts by each rule's own declared priority regardless of
// registration order, so this ordering doesn't strictly matter here, but
// laptimeNormalizerRule's higher default priority (70 vs clock-time's 65)
// is what actually guarantees it wins.
normalizer.register(laptimeNormalizerRule());
normalizer.register(clockTimeNormalizerRule());
normalizer.register(clockTimeIntervalNormalizerRule());
normalizer.register(fpsRateNormalizerRule());

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
  const rawTokens = tokenize(lexer, input);
  const tokens = normalizer.normalize(rawTokens);
  const registry = new ParseletRegistry();
  registerPackageForTesting(ARITHMETIC_PACKAGE, registry);
  registerPackageForTesting(TIME_PACKAGE, registry);
  registerPackageForTesting(UOM_PACKAGE, registry);
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

describe("clock-time literals", () => {
  test("9:00am is today at 9:00", () => {
    const result = parseAndExecute("9:00am");
    expect(result.type).toBe(ValueType.Datetime);
    const d = new Date(result.value as number);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
  });

  test("9:00 am (with a space) parses the same as 9:00am", () => {
    const result = parseAndExecute("9:00 am");
    const d = new Date(result.value as number);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
  });

  test("16:00 (24-hour, no am/pm) is 4pm", () => {
    const result = parseAndExecute("16:00");
    const d = new Date(result.value as number);
    expect(d.getHours()).toBe(16);
    expect(d.getMinutes()).toBe(0);
  });

  test("4pm (bare hour, no colon) is hour 16", () => {
    const result = parseAndExecute("4pm");
    const d = new Date(result.value as number);
    expect(d.getHours()).toBe(16);
    expect(d.getMinutes()).toBe(0);
  });

  test("12am is midnight (hour 0), not hour 12", () => {
    const result = parseAndExecute("12:00am");
    const d = new Date(result.value as number);
    expect(d.getHours()).toBe(0);
  });

  test("12pm is noon (hour 12)", () => {
    const result = parseAndExecute("12:00pm");
    const d = new Date(result.value as number);
    expect(d.getHours()).toBe(12);
  });

  test("9:45pm with minutes", () => {
    const result = parseAndExecute("9:45pm");
    const d = new Date(result.value as number);
    expect(d.getHours()).toBe(21);
    expect(d.getMinutes()).toBe(45);
  });

  test("clock time is anchored to today's calendar date", () => {
    const result = parseAndExecute("9:00am");
    const d = new Date(result.value as number);
    const now = new Date();
    expect(d.getFullYear()).toBe(now.getFullYear());
    expect(d.getMonth()).toBe(now.getMonth());
    expect(d.getDate()).toBe(now.getDate());
  });

  test("13pm is not a valid clock-time fusion (out of 12h range) — falls through to plain arithmetic", () => {
    // "13" alone should just evaluate as the number 13; "pm" is left
    // unconsumed by the clock-time rule and would fail elsewhere (an
    // undefined variable), but we only assert the fusion itself declined.
    expect(clockTimeNormalizerRule().match(
      tokenize(new Lexer(), "13pm"),
      0
    )).toBeNull();
  });
});

describe("clock-time intervals", () => {
  test("7:30 to 20:45 is 13 hours 15 minutes", () => {
    const result = parseAndExecute("7:30 to 20:45");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("minutes");
    expect(result.toNumber()).toBe(13 * 60 + 15);
  });

  test("4pm to 3am rolls over midnight: 11 hours", () => {
    const result = parseAndExecute("4pm to 3am");
    expect(result.toNumber()).toBe(11 * 60);
  });

  test("9am to 5pm is a normal same-day 8 hour interval", () => {
    const result = parseAndExecute("9am to 5pm");
    expect(result.toNumber()).toBe(8 * 60);
  });

  test("an interval starting and ending at the same time is zero", () => {
    const result = parseAndExecute("9am to 9am");
    expect(result.toNumber()).toBe(0);
  });
});

describe("fps rate literals", () => {
  test("30 fps parses as a Rate(30, frames, s)", () => {
    const result = parseAndExecute("30 fps");
    expect(result.type).toBe(ValueType.Uom);
    expect(isRateUnit(result.unit)).toBe(true);
    expect(result.unit).toBe("frames/s");
    expect(result.toNumber()).toBe(30);
  });

  test("30 fps × 3 minutes -> 5,400 frames, via real end-to-end parsing (not hand-built bytecode)", () => {
    const result = parseAndExecute("30 fps * 3 minutes");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("frames");
    expect(result.toNumber()).toBeCloseTo(5400);
  });

  test("commutative: 3 minutes × 30 fps also works", () => {
    const result = parseAndExecute("3 minutes * 30 fps");
    expect(result.unit).toBe("frames");
    expect(result.toNumber()).toBeCloseTo(5400);
  });
});

describe("laptimes", () => {
  test("03:04:05 parses as a duration of 11,045 seconds", () => {
    const result = parseAndExecute("03:04:05");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("s");
    expect(result.toNumber()).toBe(3 * 3600 + 4 * 60 + 5);
  });

  test("00:00:01.5 supports fractional seconds", () => {
    const result = parseAndExecute("00:00:01.5");
    expect(result.toNumber()).toBeCloseTo(1.5);
  });

  test("03:04:05 + 01:02:03 adds via plain ADD (matching unit fast path)", () => {
    const result = parseAndExecute("03:04:05 + 01:02:03");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("s");
    const expected = (3 * 3600 + 4 * 60 + 5) + (1 * 3600 + 2 * 60 + 3);
    expect(result.toNumber()).toBe(expected);
  });

  test("00:12:05 - 00:04:09 subtracts correctly", () => {
    const result = parseAndExecute("00:12:05 - 00:04:09");
    const expected = (12 * 60 + 5) - (4 * 60 + 9);
    expect(result.toNumber()).toBe(expected);
  });

  test("laptime (2 colons) is distinguished from clock-time (1 colon): 9:30 stays a clock time", () => {
    const result = parseAndExecute("9:30am");
    expect(result.type).toBe(ValueType.Datetime);
  });

  test("a single-colon H:M does not accidentally match the laptime rule", () => {
    expect(laptimeNormalizerRule().match(tokenize(new Lexer(), "9:30"), 0)).toBeNull();
  });
});

describe("TIME_PACKAGE — real engine wiring", () => {
  test("9:00am works via the real, default-constructed ExpressionEngine", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("9:00am");
    expect(value.type).toBe(ValueType.Datetime);
    const d = new Date(value.value as number);
    expect(d.getHours()).toBe(9);
  });

  test("7:30 to 20:45 works via the real engine", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("7:30 to 20:45");
    expect(value.type).toBe(ValueType.Uom);
    expect(value.toNumber()).toBe(13 * 60 + 15);
  });

  test("30 fps × 3 minutes works via the real engine", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("30 fps * 3 minutes");
    expect(value.unit).toBe("frames");
    expect(value.toNumber()).toBeCloseTo(5400);
  });
});

describe("timezone conversion", () => {
  test("6pm Sydney in Chicago -> a formatted Chicago wall-clock time (real engine, since Sydney/Chicago are plain single-word IDENTs — no phrase fusion needed)", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("6pm Sydney in Chicago");
    expect(value.type).toBe(ValueType.String);
    // Sydney (UTC+10/11) is always many hours ahead of Chicago (UTC-5/-6) —
    // 6pm Sydney always lands in the SMALL hours of the morning in Chicago,
    // regardless of the exact DST offsets in effect when this test runs.
    expect(value.value as string).toMatch(/^\d{1,2}:\d{2} AM/);
  });

  test("2am PST in GMT converts via a standard-time abbreviation", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("2am PST in GMT");
    expect(value.type).toBe(ValueType.String);
    expect(value.value as string).toMatch(/^\d{1,2}:\d{2} (AM|PM)/);
  });

  test("3pm GMT+8 in Paris converts via a numeric UTC offset", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("3pm GMT+8 in Paris");
    expect(value.type).toBe(ValueType.String);
    expect(value.value as string).toMatch(/^\d{1,2}:\d{2} (AM|PM)/);
  });

  // Regression for a bug where the lexer's clock-time normalizer fuses
  // "8:30" (after the sign) into a single CLOCK_TIME token before
  // ZoneReference.ts ever runs, so its NUMBER-then-optional-COLON-then-
  // NUMBER path never saw a bare NUMBER there and threw. Converting into
  // UTC (also a fixed offset, no DST) makes the expected wall-clock time
  // exact and date-independent, unlike the Paris-target tests above.
  test("3pm GMT+5:30 in UTC converts a numeric UTC offset with a non-zero minutes component", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("3pm GMT+5:30 in UTC");
    expect(value.type).toBe(ValueType.String);
    expect(value.value as string).toBe("9:30 AM");
  });

  test("3pm GMT+8:45 in UTC converts a numeric UTC offset with a non-zero minutes component", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("3pm GMT+8:45 in UTC");
    expect(value.type).toBe(ValueType.String);
    expect(value.value as string).toBe("6:15 AM");
  });

  test("3pm GMT+8 in UTC still converts a whole-hour numeric UTC offset (no COLON token at all)", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("3pm GMT+8 in UTC");
    expect(value.type).toBe(ValueType.String);
    expect(value.value as string).toBe("7:00 AM");
  });

  test("3pm GMT in UTC still converts a bare zero-offset zone (no sign token at all)", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("3pm GMT in UTC");
    expect(value.type).toBe(ValueType.String);
    expect(value.value as string).toBe("3:00 PM");
  });

  test("a recognized zone name with no following 'in <target>' is a parse error, not silently ignored", () => {
    const engine = new ExpressionEngine("en");
    expect(() => engine.evaluateExpression("6pm Sydney")).toThrow();
  });

  test("time in Paris -> Paris's current wall-clock time (phrase-fused, real engine)", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("time in Paris");
    expect(value.type).toBe(ValueType.String);
    expect(value.value as string).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
  });

  test("date in Vancouver -> Vancouver's current calendar date (phrase-fused, real engine)", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("date in Vancouver");
    expect(value.type).toBe(ValueType.String);
    // e.g. "July 31, 2026"
    expect(value.value as string).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
  });

  test("time in New York works via a fused multi-word city name", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("time in New York");
    expect(value.type).toBe(ValueType.String);
    expect(value.value as string).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
  });

  test("time difference between Seattle and Moscow -> a directional, human-readable offset (phrase-fused, real engine)", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("time difference between Seattle and Moscow");
    expect(value.type).toBe(ValueType.String);
    expect(value.value as string).toMatch(/^Moscow is \d+ hours?( \d+ minutes?)? ahead of Seattle$/);
  });

  test("time difference between two zones with the same current offset reports 'share the same UTC offset'", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("time difference between Paris and Berlin");
    expect(value.value).toBe("Berlin and Paris currently share the same UTC offset");
  });

  test("an unrecognized city name is not treated as a zone reference — falls through to an undefined-variable error, same as before this feature existed", () => {
    const engine = new ExpressionEngine("en");
    expect(() => engine.evaluateExpression("time in Atlantis")).toThrow();
  });
});
