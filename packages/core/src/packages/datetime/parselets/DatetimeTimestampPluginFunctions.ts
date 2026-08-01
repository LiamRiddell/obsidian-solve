import { Value, ValueType, numberValue, stringValue, boolValue, uomValue, datetimeValue, errorValue } from "@solve-js/vm/Value";
import { convertUnit, getMeasure } from "@solve-js/uom/UomConverter";
import { allocatePluginFunctionIndex } from "@solve-js/vm/VMBuiltins";
import { parseIso8601, unixTimestampToEpochMs } from "../Iso8601";

/**
 * `CALL_PLUGIN` handlers backing the datetime package's workdays/weekday/
 * timestamp features (see `DatetimePackage.ts`). Grouped in one file since
 * they're all small, single-purpose Value -> Value functions with no
 * shared state — mirrors `time/parselets/TimezonePluginFunctions.ts`'s
 * organization for the same kind of grouping.
 *
 * Each index is allocated via {@link allocatePluginFunctionIndex} (never
 * hardcoded) — see that function's doc comment for why: two packages
 * independently picking the same arbitrary CALL_BUILTIN-style number would
 * silently collide. The actual numeric values are whatever the allocator
 * hands out at module-load time (order-dependent across the whole engine);
 * do not depend on specific numbers anywhere outside this module.
 */

export const WORKDAYS_IN_FN_IDX = allocatePluginFunctionIndex();
export const WEEKDAY_ON_FN_IDX = allocatePluginFunctionIndex();
export const TO_DATE_FN_IDX = allocatePluginFunctionIndex();
export const TO_TIMESTAMP_FN_IDX = allocatePluginFunctionIndex();
export const MONTH_ON_FN_IDX = allocatePluginFunctionIndex();
export const WEEK_ON_FN_IDX = allocatePluginFunctionIndex();
export const IS_WEEKEND_FN_IDX = allocatePluginFunctionIndex();
export const IS_WORKDAY_FN_IDX = allocatePluginFunctionIndex();
export const SPAN_BETWEEN_FN_IDX = allocatePluginFunctionIndex();

/**
 * `workdays in <duration>` -> the number of Mon-Fri workdays in that span,
 * as a plain Number.
 *
 * SCOPE DECISION (documented here and in `WorkdaysInParselet.ts`): no
 * anchor date is specified by this phrase's grammar at all — "workdays in
 * 3 weeks" doesn't say "starting when" — so this is computed via a pure,
 * deterministic ratio (5 workdays per full 7-day week, plus the remainder
 * capped at 5) rather than walking an actual calendar from "now". That
 * would make the result depend on which day of the week "now" happens to
 * be when evaluated — a non-deterministic, hard-to-test result for the
 * exact same input expression. This IS anchor-independent and exact for
 * any whole-week span (3 weeks = 21 days = exactly 15 workdays, regardless
 * of start day); for a partial-week remainder it's a reasonable capped
 * approximation, not a real calendar walk. Also does NOT exclude public
 * holidays — see `vm/VM.ts`'s `addBusinessDays()` doc comment for the
 * same holiday-scoping decision applied consistently across this feature.
 */
function workdaysInDurationHandler(args: Value[]): Value {
  const v = args[0];
  let totalDays: number;

  if (v.type === ValueType.Uom && v.unit) {
    const measure = getMeasure(v.unit);
    if (measure !== "time") {
      return errorValue(
        "WORKDAYS_IN_EXPECTED_DURATION",
        `"workdays in" expects a time duration, got unit "${v.unit}"`
      );
    }
    totalDays = convertUnit(v.toNumber(), v.unit, "day");
  } else {
    // A bare Number is treated as already being a count of days.
    totalDays = v.toNumber();
  }

  const fullWeeks = Math.floor(totalDays / 7);
  const remainderDays = totalDays - fullWeeks * 7;
  const workdays = fullWeeks * 5 + Math.min(remainderDays, 5);
  return numberValue(workdays);
}

const WEEKDAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

/**
 * Guards the date-field extractors below (weekday/month/week/is-a-weekend).
 *
 * The grammar-driven call sites always build a Datetime by construction,
 * but the `as` converter forms don't: `<anything> as week` reaches the same
 * handler, so `90 days as week` would otherwise read a duration's raw ms as
 * if it were an epoch and answer "week 1" with a straight face. Returning
 * an error instead is the difference between a wrong answer and a
 * diagnosable one.
 */
function asEpochMs(value: Value, fieldName: string): number | Value {
  if (value.type === ValueType.Datetime) return value.toNumber();
  return errorValue(
    "DATE_FIELD_EXPECTED_DATE",
    `"${fieldName}" expects a date, got ${ValueType[value.type] ?? "an unsupported value"}`
  );
}

/**
 * `day of the week on <date>` / `what day is it in <duration>` /
 * `<date> as weekday` -> the weekday name (e.g. "Tuesday") as a String.
 */
function weekdayOnDateHandler(args: Value[]): Value {
  const epochMs = asEpochMs(args[0], "weekday");
  if (typeof epochMs !== "number") return epochMs;
  return stringValue(WEEKDAY_NAMES[new Date(epochMs).getDay()]);
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * `what month is it on <date>` / `<date> as month` -> the month name
 * (e.g. "December") as a String value.
 *
 * English-only, exactly like {@link WEEKDAY_NAMES} directly above — the
 * locale-aware path is `format/FormatEngine.ts`, which is what renders a
 * whole Datetime; this returns a bare String field extracted from one, and
 * matching the established weekday behaviour beats having the two
 * neighbouring fields disagree about localization.
 */
function monthOnDateHandler(args: Value[]): Value {
  const epochMs = asEpochMs(args[0], "month");
  if (typeof epochMs !== "number") return epochMs;
  return stringValue(MONTH_NAMES[new Date(epochMs).getMonth()]);
}

/**
 * `what week is it on <date>` / `<date> as week` -> the ISO-8601 week
 * number (1-53) as a plain Number.
 *
 * ISO weeks start on Monday and week 1 is the one containing the first
 * Thursday of the year — which is why this shifts to the Thursday of the
 * target's week before counting. A naive "day-of-year / 7" would disagree
 * with every calendar app for the first and last days of a year.
 */
function weekOnDateHandler(args: Value[]): Value {
  const epochMs = asEpochMs(args[0], "week");
  if (typeof epochMs !== "number") return epochMs;
  const d = new Date(epochMs);
  // Work in UTC on a date-only copy so a local-time hour can't shift the day.
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // getUTCDay(): Sunday=0. Map to ISO's Monday=1..Sunday=7, then step to Thursday.
  const isoDay = target.getUTCDay() === 0 ? 7 : target.getUTCDay();
  target.setUTCDate(target.getUTCDate() + 4 - isoDay);
  const yearStart = Date.UTC(target.getUTCFullYear(), 0, 1);
  const days = Math.floor((target.getTime() - yearStart) / 86_400_000);
  return numberValue(Math.floor(days / 7) + 1);
}

/** True for Saturday/Sunday. */
function isWeekendDate(epochMs: number): boolean {
  const day = new Date(epochMs).getDay();
  return day === 0 || day === 6;
}

/** `<date> is a weekend` -> Boolean. */
function isWeekendOnDateHandler(args: Value[]): Value {
  const epochMs = asEpochMs(args[0], "is a weekend");
  if (typeof epochMs !== "number") return epochMs;
  return boolValue(isWeekendDate(epochMs));
}

/**
 * `<date> is a workday` / `is a weekday` -> Boolean.
 *
 * Mon-Fri only, with NO public-holiday exclusion — the same scope decision
 * `vm/VM.ts`'s `addBusinessDays()` and `workdaysInDurationHandler` above
 * already make, kept consistent so "is a workday" can never disagree with
 * the workday arithmetic in the line above it.
 */
function isWorkdayOnDateHandler(args: Value[]): Value {
  const epochMs = asEpochMs(args[0], "is a workday");
  if (typeof epochMs !== "number") return epochMs;
  return boolValue(!isWeekendDate(epochMs));
}

/**
 * `<unit> between <date> and <date>` -> the UNSIGNED span between the two
 * endpoints as a `Uom("ms")`, which the caller then converts into the
 * requested unit via `UOM_CONVERT_IN` (identical to how
 * `UntilSinceParselet` feeds that opcode).
 *
 * A plugin function rather than a `SUB`: "between" has no direction in
 * English, so `days between A and B` must equal `days between B and A`,
 * and there is no ABS opcode to apply after a signed subtraction.
 * Arguments arrive in push order, so `args[0]` is the first endpoint as
 * written — though by construction the result doesn't depend on that.
 */
function spanBetweenDatesHandler(args: Value[]): Value {
  return uomValue(Math.abs(args[0].toNumber() - args[1].toNumber()), "ms");
}

/**
 * `<ISO8601 string> to date` / `<unix timestamp> to date` -> a Datetime
 * value. Dispatches on the RUNTIME value type (a `CALL_PLUGIN` handler
 * runs at VM-execution time, after the left-hand expression has already
 * been evaluated to a concrete Value) rather than at parse time, since the
 * left-hand expression could be a string literal, a bare number literal,
 * or an arbitrary variable/expression of either type.
 *
 * Real ambiguity resolved here: a bare Number could be a SECONDS or a
 * MILLISECONDS Unix timestamp for the same real-world date — see
 * `Iso8601.ts`'s `unixTimestampToEpochMs()`/`MS_TIMESTAMP_THRESHOLD` doc
 * comment for the exact magnitude threshold and reasoning.
 */
function toDateFromAnyHandler(args: Value[]): Value {
  const v = args[0];

  if (v.type === ValueType.Datetime) {
    return v; // already a date — "date to date" is a harmless no-op
  }

  if (v.type === ValueType.String) {
    const ms = parseIso8601(v.value as string);
    if (ms === null) {
      return errorValue(
        "INVALID_ISO8601_STRING",
        `"${v.value}" is not a recognizable ISO8601 date/time string`
      );
    }
    return datetimeValue(ms);
  }

  return datetimeValue(unixTimestampToEpochMs(v.toNumber()));
}

/**
 * `<date/time> to timestamp` / `current timestamp` -> a Unix timestamp in
 * SECONDS (rounded down), as a plain Number.
 *
 * Also accepts a String (parsed as ISO8601 first) for robustness, though
 * the primary grammar this backs (`ToTimestampParselet.ts`) always feeds
 * it an already-Datetime-typed left-hand expression; `CurrentTimestampParselet.ts`
 * feeds it a fresh `DATE_NOW` result via the same opcode, reusing this one
 * handler for both call sites.
 */
function toTimestampFromAnyHandler(args: Value[]): Value {
  const v = args[0];

  if (v.type === ValueType.String) {
    const ms = parseIso8601(v.value as string);
    if (ms === null) {
      return errorValue(
        "INVALID_ISO8601_STRING",
        `"${v.value}" is not a recognizable ISO8601 date/time string`
      );
    }
    return numberValue(Math.floor(ms / 1000));
  }

  // Datetime (epoch ms) or a plain Number already representing epoch ms.
  return numberValue(Math.floor(v.toNumber() / 1000));
}

export const workdaysInDuration = workdaysInDurationHandler;
export const weekdayOnDate = weekdayOnDateHandler;
export const monthOnDate = monthOnDateHandler;
export const weekOnDate = weekOnDateHandler;
export const isWeekendOnDate = isWeekendOnDateHandler;
export const isWorkdayOnDate = isWorkdayOnDateHandler;
export const spanBetweenDates = spanBetweenDatesHandler;
export const toDateFromAny = toDateFromAnyHandler;
export const toTimestampFromAny = toTimestampFromAnyHandler;
