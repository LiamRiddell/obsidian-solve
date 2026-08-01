/**
 * Datetime package — workdays/weekdays and timestamps/ISO8601 extensions.
 *
 * ALL of the grammars under test here depend on either phrase fusion
 * (`WORKDAYS_IN`/`WEEKDAY_ON`/`CURRENT_TIMESTAMP`/`TO_DATE`/`TO_TIMESTAMP`,
 * via `DatetimePackage.ts`'s `phrases` field) or a normalizer rule
 * (`workdayRateDenominatorNormalizerRule`) — neither TokenNormalizer nor
 * PhraseTrie are wired into the lightweight isolated
 * tokenize+parse-registry harness (see `DatetimeParselets.spec.ts`'s
 * `parseAndExecute()`), so every test below goes through a real,
 * default-constructed `ExpressionEngine` (`BUILTIN_PACKAGES`, the actual
 * normalizer, the actual `DATETIME_PACKAGE`) — matching
 * `PercentagePackage`'s `RealEngineWiring.spec.ts` and this session's
 * established "isolated-harness-only tests can hide real bugs" lesson.
 *
 * Fixture dates deliberately use a `T12:00:00` (noon, no "Z"/offset)
 * suffix rather than a bare `YYYY-MM-DD` — a date-only ISO string parses
 * as UTC MIDNIGHT (per spec), which risks shifting to the adjacent
 * calendar day once re-read via `Date`'s LOCAL-time accessors (used by
 * `vm/VM.ts`'s `addBusinessDays()`/weekday lookups) on a machine whose
 * timezone is behind UTC. Noon local time never crosses a date boundary
 * either way, so these fixtures give a day-of-week that's stable
 * regardless of which timezone the test happens to run in.
 */

import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { ValueType } from "@solve-js/vm/Value";

function evalReal(expr: string) {
  const engine = new ExpressionEngine("en");
  const [value] = engine.evaluateExpression(expr);
  return value;
}

// 2024-01-05T12:00:00 local is a Friday; 2024-01-08T12:00:00 local is the
// following Monday (confirmed independently: Sat 01-06, Sun 01-07).
const FRIDAY = '"2024-01-05T12:00:00"';
const MONDAY = '"2024-01-08T12:00:00"';
const TUESDAY = '"2024-01-09T12:00:00"';

describe("workdays in <duration>", () => {
  test('"workdays in 3 weeks" = 15 (whole weeks: 5 workdays x 3)', () => {
    const v = evalReal("workdays in 3 weeks");
    expect(v.type).toBe(ValueType.Number);
    expect(v.toNumber()).toBe(15);
  });

  test('"workdays in 1 week" = 5', () => {
    expect(evalReal("workdays in 1 week").toNumber()).toBe(5);
  });

  test('"workdays in 10 days" = 8 (1 full week + 3-day remainder, capped at 5)', () => {
    expect(evalReal("workdays in 10 days").toNumber()).toBe(8);
  });

  test('"workdays in 14 days" = 10 (exactly 2 whole weeks)', () => {
    expect(evalReal("workdays in 14 days").toNumber()).toBe(10);
  });
});

describe("<date> +/- N workdays (business-day-skip arithmetic)", () => {
  test("Friday + 1 workdays lands on the following Monday (skips the weekend)", () => {
    const friday = evalReal(`${FRIDAY} to date`);
    const plusOne = evalReal(`${FRIDAY} to date + 1 workdays`);
    const monday = evalReal(`${MONDAY} to date`);
    expect(plusOne.type).toBe(ValueType.Datetime);
    expect(plusOne.toNumber()).toBe(monday.toNumber());
    expect(plusOne.toNumber()).toBeGreaterThan(friday.toNumber());
  });

  test("singular 'workday' unit also works (+ 1 workday)", () => {
    const plusOne = evalReal(`${FRIDAY} to date + 1 workday`);
    const monday = evalReal(`${MONDAY} to date`);
    expect(plusOne.toNumber()).toBe(monday.toNumber());
  });

  test("Monday - 1 workdays lands on the previous Friday (skips the weekend backwards)", () => {
    const minusOne = evalReal(`${MONDAY} to date - 1 workdays`);
    const friday = evalReal(`${FRIDAY} to date`);
    expect(minusOne.toNumber()).toBe(friday.toNumber());
  });

  test("Friday + 5 workdays lands on the FOLLOWING Friday (a full business week later)", () => {
    const plusFive = evalReal(`${FRIDAY} to date + 5 workdays`);
    // 7 calendar days later, same weekday.
    const fridayMs = evalReal(`${FRIDAY} to date`).toNumber();
    expect(plusFive.toNumber()).toBe(fridayMs + 7 * 24 * 60 * 60 * 1000);
  });

  test("ordinary '+ N days' arithmetic is unaffected by the workday special-case", () => {
    const plusOneDay = evalReal(`${FRIDAY} to date + 1 day`);
    const saturdayMs = evalReal(`${FRIDAY} to date`).toNumber() + 24 * 60 * 60 * 1000;
    expect(plusOneDay.toNumber()).toBe(saturdayMs);
  });
});

describe("$X/workday Rate (workday as a Time-measure unit for Rate math)", () => {
  test('"$500/workday" constructs a Rate (a Uom tagged "USD/workday")', () => {
    const v = evalReal("$500/workday");
    expect(v.type).toBe(ValueType.Uom);
    expect(v.unit).toBe("USD/workday");
    expect(v.toNumber()).toBe(500);
  });

  test('"$500/workday * 4 weeks" = $10,000 (4 weeks -> 20 workdays -> 500 * 20)', () => {
    const v = evalReal("$500/workday * 4 weeks");
    expect(v.type).toBe(ValueType.Uom);
    expect(v.unit).toBe("USD");
    expect(v.toNumber()).toBe(10000);
  });

  test('"$500/workday * 1 week" = $2,500 (1 week -> 5 workdays)', () => {
    const v = evalReal("$500/workday * 1 week");
    expect(v.toNumber()).toBe(2500);
  });

  test("explicit denominator form still works unchanged (no bare-unit normalizer involved)", () => {
    const v = evalReal("$1000 / 2 workdays");
    expect(v.type).toBe(ValueType.Uom);
    expect(v.unit).toBe("USD/workdays");
    expect(v.toNumber()).toBe(500);
  });
});

describe("day of the week on <date> / weekday on <date>", () => {
  test(`"weekday on" ${FRIDAY} to date -> "Friday"`, () => {
    const v = evalReal(`weekday on ${FRIDAY} to date`);
    expect(v.type).toBe(ValueType.String);
    expect(v.value).toBe("Friday");
  });

  test(`"day of the week on" ${TUESDAY} to date -> "Tuesday"`, () => {
    const v = evalReal(`day of the week on ${TUESDAY} to date`);
    expect(v.type).toBe(ValueType.String);
    expect(v.value).toBe("Tuesday");
  });
});

describe("current timestamp / <date/time> to timestamp", () => {
  test('"current timestamp" is a Number close to Date.now()/1000', () => {
    const before = Math.floor(Date.now() / 1000);
    const v = evalReal("current timestamp");
    const after = Math.floor(Date.now() / 1000);
    expect(v.type).toBe(ValueType.Number);
    expect(v.toNumber()).toBeGreaterThanOrEqual(before);
    expect(v.toNumber()).toBeLessThanOrEqual(after + 1);
  });

  test('"now to timestamp" matches current timestamp (within 2 seconds)', () => {
    const a = evalReal("now to timestamp").toNumber();
    const b = evalReal("current timestamp").toNumber();
    expect(Math.abs(a - b)).toBeLessThanOrEqual(2);
  });

  test('"2019-04-01T15:30:00+11:00" to timestamp -> 1554093000 (matches the ms value / 1000)', () => {
    const v = evalReal('"2019-04-01T15:30:00+11:00" to timestamp');
    expect(v.type).toBe(ValueType.Number);
    expect(v.toNumber()).toBe(1554093000);
  });
});

describe("<ISO8601 string / unix timestamp> to date", () => {
  test('"2019-04-01T15:30:00+11:00" to date parses to the correct epoch-ms Datetime', () => {
    const v = evalReal('"2019-04-01T15:30:00+11:00" to date');
    expect(v.type).toBe(ValueType.Datetime);
    expect(v.toNumber()).toBe(new Date("2019-04-01T15:30:00+11:00").getTime());
  });

  test("a SECONDS unix timestamp (~1e9-1e10 magnitude) converts to the matching Datetime", () => {
    const v = evalReal("1554109200 to date");
    expect(v.type).toBe(ValueType.Datetime);
    expect(v.toNumber()).toBe(1554109200000);
  });

  test("a MILLISECONDS unix timestamp (~1e12+ magnitude) is NOT re-multiplied by 1000", () => {
    const v = evalReal("1733823083000 to date");
    expect(v.type).toBe(ValueType.Datetime);
    expect(v.toNumber()).toBe(1733823083000);
  });

  test('a malformed ISO8601-shaped string produces an error Value, not a silent "Invalid Date"', () => {
    const v = evalReal('"not a real date" to date');
    expect(v.type).toBe(ValueType.Error);
  });

  test("round-trips through timestamp and back to date", () => {
    const original = evalReal(`${TUESDAY} to date`).toNumber();
    const asTimestamp = evalReal(`${TUESDAY} to date to timestamp`).toNumber();
    const backToDate = evalReal(`${asTimestamp} to date`).toNumber();
    // Timestamp truncates to whole seconds, so this may lose sub-second
    // precision — the fixture uses an exact-second time (":00"), so it
    // should round-trip exactly.
    expect(backToDate).toBe(original);
  });
});

describe("<date/time> as iso8601", () => {
  test('formats using the HOST SYSTEM local offset (computed the same way the feature does, not hardcoded)', () => {
    const v = evalReal('"2019-04-01T15:30:00+11:00" to date as iso8601');
    expect(v.type).toBe(ValueType.String);

    // Recompute the expected string the same way, independent of which
    // timezone this test happens to run in.
    const epochMs = new Date("2019-04-01T15:30:00+11:00").getTime();
    const d = new Date(epochMs);
    const pad = (n: number) => String(n).padStart(2, "0");
    const offsetMinutesTotal = -d.getTimezoneOffset();
    const sign = offsetMinutesTotal >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMinutesTotal);
    const expected =
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
      `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;

    expect(v.value).toBe(expected);
  });

  test("round-trips: X as iso8601, then that string to date, is the same instant", () => {
    const original = evalReal(`${TUESDAY} to date`).toNumber();
    const isoString = evalReal(`${TUESDAY} to date as iso8601`);
    expect(isoString.type).toBe(ValueType.String);
    // Re-quote the formatted string — it comes back as PLAIN text (no
    // surrounding quotes; see Iso8601.ts's formatIso8601Local()), but a
    // new expression needs it as a real quoted string literal to be
    // parsed unambiguously (see Iso8601.ts's own doc comment on why this
    // feature only accepts quoted-string input, not a bare literal).
    const backToDate = evalReal(`"${isoString.value}" to date`);
    expect(backToDate.toNumber()).toBe(original);
  });
});

describe("regression guard: phrase-fused leading words stay usable as :variableName", () => {
  // "workdays"/"weekday"/"timestamp"/"date"/"current" are all plausible
  // variable names — this codebase's tested policy is that a colon-
  // prefixed variable name can't be a keyword-shaped word (see
  // VariableParselet.ts's doc comment), which is exactly why every new
  // grammar in this file was fused as a full PHRASE rather than claiming
  // any of these bare words as its own token type.
  test.each([
    [":workdays = 5", 5],
    [":weekday = 9", 9],
    [":timestamp = 7", 7],
    [":date = 3", 3],
    [":current = 11", 11],
  ])("%s still assigns/evaluates as a plain variable (= %d)", (expr, expected) => {
    const v = evalReal(expr);
    expect(v.type).toBe(ValueType.Number);
    expect(v.toNumber()).toBe(expected);
  });

  test("a 'workday'/'workdays' UNIT-typed name also still works as :name (matches ':b = 5' precedent)", () => {
    const v = evalReal(":workday = 42");
    expect(v.toNumber()).toBe(42);
  });
});
