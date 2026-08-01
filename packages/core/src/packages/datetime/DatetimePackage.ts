import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { stringValue } from "@solve-js/vm/Value";
import { NowParselet } from "./parselets/NowParselet";
import { NextLastParselet } from "./parselets/NextLastParselet";
import { UntilSinceParselet } from "./parselets/UntilSinceParselet";
import { WorkdaysInParselet } from "./parselets/WorkdaysInParselet";
import { DateFieldQueryParselet } from "./parselets/DateFieldQueryParselet";
import { DurationBetweenParselet } from "./parselets/DurationBetweenParselet";
import { DayTypePredicateParselet } from "./parselets/DayTypePredicateParselet";
import { CurrentTimestampParselet } from "./parselets/CurrentTimestampParselet";
import { ToDateParselet } from "./parselets/ToDateParselet";
import { ToTimestampParselet } from "./parselets/ToTimestampParselet";
import { DateLiteralParselet } from "./parselets/DateLiteralParselet";
import {
  WORKDAYS_IN_FN_IDX, WEEKDAY_ON_FN_IDX, TO_DATE_FN_IDX, TO_TIMESTAMP_FN_IDX,
  MONTH_ON_FN_IDX, WEEK_ON_FN_IDX, IS_WEEKEND_FN_IDX, IS_WORKDAY_FN_IDX,
  SPAN_BETWEEN_FN_IDX,
  workdaysInDuration, weekdayOnDate, toDateFromAny, toTimestampFromAny,
  monthOnDate, weekOnDate, isWeekendOnDate, isWorkdayOnDate, spanBetweenDates,
} from "./parselets/DatetimeTimestampPluginFunctions";
import { untilSinceNormalizerRule } from "./normalizer/UntilSinceNormalizerRule";
import { betweenUnitNormalizerRule } from "./normalizer/BetweenUnitNormalizerRule";
import { workdayRateDenominatorNormalizerRule } from "./normalizer/WorkdayRateDenominatorNormalizerRule";
import { dateLiteralNormalizerRule } from "./normalizer/DateLiteralNormalizerRule";
import { dailyNoteLinkNormalizerRule } from "./normalizer/DailyNoteLinkNormalizerRule";
import { formatIso8601Local } from "./Iso8601";

/**
 * Date/time keywords: `now`, `today`, `tomorrow`, `yesterday`,
 * `next <Weekday>`/`last <Weekday>`, `<unit> until <Datetime>`/`<unit> since <Datetime>`.
 * Uses the datetime arithmetic opcodes (`DATE_ADD`/`DATE_SUB`/`DATE_NEXT_WEEKDAY`/`DATE_LAST_WEEKDAY`)
 * plus the shared UoM conversion opcode (`UOM_CONVERT_IN`) for until/since.
 *
 * Also: workdays/weekdays and timestamps/ISO8601 —
 *
 * - `workdays in <duration>` — see `WorkdaysInParselet.ts`.
 * - `<date> + N workdays` / `<date> - N workdays` — plain "+"/"-"
 *   arithmetic, special-cased in `vm/VM.ts`'s ADD/SUB dispatch for the
 *   `workday`/`workdays` UNIT (see `lexer/units.ts`) since business-day
 *   math needs actual weekend-skipping, not a linear ms conversion.
 * - `<amount>/workday x <duration>` — a Rate, exactly like `$99/week`
 *   already works, using `uom/UomConverter.ts`'s workday<->day shim so
 *   `getMeasure()`/`convertUnit()` treat "workday" as a Time-measure unit
 *   (5 workdays == 7 calendar days) — see that file's doc comment. The
 *   bare-denominator syntax `$500/workday` (no explicit "1") additionally
 *   needs `workdayRateDenominatorNormalizerRule` — see its doc comment.
 * - `day of the week on <date>` / `weekday on <date>`, and the
 *   natural-question forms over the same three date fields —
 *   `what day is it`, `what day is it on <date>`, `what day is it in
 *   <duration>`, and the `month`/`week` equivalents. All one parselet, see
 *   `DateFieldQueryParselet.ts`. The same fields are also available
 *   composably as `<date> as weekday` / `as month` / `as week` via
 *   `asConverters` below.
 * - `<unit> between <date> and <date>` — the two-explicit-endpoints
 *   sibling of `until`/`since`, see `DurationBetweenParselet.ts`. A
 *   leading `how many` is accepted for it and for `until`/`since`, see
 *   `BetweenUnitNormalizerRule.ts`.
 * - `<date> is a weekend` / `is a workday` — postfix predicates, see
 *   `DayTypePredicateParselet.ts`. Mon-Fri only, matching the workday
 *   scope decision below.
 * - `current timestamp` / `<date/time> to timestamp` / `<ISO8601 string
 *   or unix timestamp> to date` — see `CurrentTimestampParselet.ts` /
 *   `ToTimestampParselet.ts` / `ToDateParselet.ts` and
 *   `DatetimeTimestampPluginFunctions.ts`.
 * - Bare numeric date literals — `25/12/2023` (European DD/MM/YYYY),
 *   `12-25-2023` (US MM-DD-YYYY), `2023-12-25` (ISO YYYY-MM-DD), and
 *   `25.12.2023` (dot-separated DD.MM.YYYY) — fused into a single
 *   `DATETIME_LITERAL` token by `dateLiteralNormalizerRule()` and pushed by
 *   `DateLiteralParselet`. Ported from the sibling `feat/safety-limits-datetime-literals`
 *   branch referenced in `Iso8601.ts`'s and the Stocks package's
 *   `DatePhrase.ts`'s doc comments — this is that work, now merged.
 * - `<date/time> as iso8601` — registered below via `asConverters`
 *   (the `Converters` package's `<expr> as <type>` extension point, see
 *   `api/PackageRegistry.ts`'s doc comment) rather than a new opcode or a
 *   `Converters`-package-owned built-in name: `asConverters` already
 *   exists precisely for a third-party/domain package to contribute a
 *   new `as <name>` target without touching `AsConverterParselet.ts` or
 *   `OpCode.ts` at all, and "iso8601" is inherently a datetime-package
 *   concept (needs `Iso8601.ts`'s formatting, which already lives here) —
 *   simpler to keep it self-contained in this package than to split the
 *   feature across two packages for a marginal "which package owns the
 *   converter-name list" tidiness gain.
 *
 * SCOPE DECISION (workdays, both the count and the date-arithmetic forms):
 * plain Mon-Fri business-day math, with NO public-holiday exclusion.
 * SoulverCore's own workday calculations auto-exclude public holidays via
 * a live-updating, region-configurable holiday database — picking which
 * holidays/region and keeping such a database current is real, separate
 * scope this pass deliberately does not take on (see `vm/VM.ts`'s
 * `addBusinessDays()` doc comment for the fuller version of this note,
 * matching this session's established pattern of documenting a scoped-down
 * simplification rather than silently pretending to support something it
 * doesn't — e.g. Finance's "no hardcoded tax rate" decision).
 */
export const DATETIME_PACKAGE: IEnginePackage = {
  name: "solve-datetime",
  phrases: {
    "workdays in": "WORKDAYS_IN",
    "day of the week on": "WEEKDAY_ON",
    "weekday on": "WEEKDAY_ON",
    "current timestamp": "CURRENT_TIMESTAMP",
    "to date": "TO_DATE",
    "to timestamp": "TO_TIMESTAMP",
    // Natural-question forms. The bare "what X is it" and the "... on"/
    // "... in" variants are all registered explicitly; the phrase trie is
    // longest-match-wins, so "what day is it in" beats "what day is it"
    // whenever a duration follows, and the bare phrase is left to answer
    // for right now (see DateFieldQueryParselet's peek).
    "what day is it": "WEEKDAY_ON",
    "what day is it on": "WEEKDAY_ON",
    "what day will it be on": "WEEKDAY_ON",
    "what day is it in": "WEEKDAY_IN",
    "what day will it be in": "WEEKDAY_IN",
    "what month is it": "MONTH_ON",
    "what month is it on": "MONTH_ON",
    "month of": "MONTH_ON",
    "what month is it in": "MONTH_IN",
    "what month will it be in": "MONTH_IN",
    "what week is it": "WEEK_ON",
    "what week is it on": "WEEK_ON",
    "week of": "WEEK_ON",
    "what week is it in": "WEEK_IN",
    "what week will it be in": "WEEK_IN",
    // Postfix day-type predicates.
    "is a weekend": "IS_WEEKEND",
    "is on a weekend": "IS_WEEKEND",
    "is a workday": "IS_WORKDAY",
    "is a weekday": "IS_WORKDAY",
    "is a business day": "IS_WORKDAY",
  },
  prefixParselets: [
    { tokenType: "NOW", parselet: new NowParselet(0) },
    { tokenType: "TODAY", parselet: new NowParselet(0) },
    { tokenType: "TOMORROW", parselet: new NowParselet(1) },
    { tokenType: "YESTERDAY", parselet: new NowParselet(-1) },
    { tokenType: "NEXT", parselet: new NextLastParselet("next") },
    { tokenType: "LAST", parselet: new NextLastParselet("last") },
    { tokenType: "UNTIL_UNIT", parselet: new UntilSinceParselet("until") },
    { tokenType: "SINCE_UNIT", parselet: new UntilSinceParselet("since") },
    { tokenType: "WORKDAYS_IN", parselet: new WorkdaysInParselet() },
    { tokenType: "WEEKDAY_ON", parselet: new DateFieldQueryParselet(WEEKDAY_ON_FN_IDX, "on") },
    { tokenType: "WEEKDAY_IN", parselet: new DateFieldQueryParselet(WEEKDAY_ON_FN_IDX, "in") },
    { tokenType: "MONTH_ON", parselet: new DateFieldQueryParselet(MONTH_ON_FN_IDX, "on") },
    { tokenType: "MONTH_IN", parselet: new DateFieldQueryParselet(MONTH_ON_FN_IDX, "in") },
    { tokenType: "WEEK_ON", parselet: new DateFieldQueryParselet(WEEK_ON_FN_IDX, "on") },
    { tokenType: "WEEK_IN", parselet: new DateFieldQueryParselet(WEEK_ON_FN_IDX, "in") },
    { tokenType: "BETWEEN_UNIT", parselet: new DurationBetweenParselet() },
    { tokenType: "CURRENT_TIMESTAMP", parselet: new CurrentTimestampParselet() },
    { tokenType: "DATETIME_LITERAL", parselet: new DateLiteralParselet() },
  ],
  infixParselets: [
    { tokenType: "TO_DATE", parselet: new ToDateParselet() },
    { tokenType: "TO_TIMESTAMP", parselet: new ToTimestampParselet() },
    { tokenType: "IS_WEEKEND", parselet: new DayTypePredicateParselet(IS_WEEKEND_FN_IDX) },
    { tokenType: "IS_WORKDAY", parselet: new DayTypePredicateParselet(IS_WORKDAY_FN_IDX) },
  ],
  normalizerRules: [
    untilSinceNormalizerRule(),
    betweenUnitNormalizerRule(),
    workdayRateDenominatorNormalizerRule(),
    dateLiteralNormalizerRule(),
    dailyNoteLinkNormalizerRule(),
  ],
  pluginFunctions: [
    { index: WORKDAYS_IN_FN_IDX, handler: workdaysInDuration },
    { index: WEEKDAY_ON_FN_IDX, handler: weekdayOnDate },
    { index: TO_DATE_FN_IDX, handler: toDateFromAny },
    { index: TO_TIMESTAMP_FN_IDX, handler: toTimestampFromAny },
    { index: MONTH_ON_FN_IDX, handler: monthOnDate },
    { index: WEEK_ON_FN_IDX, handler: weekOnDate },
    { index: IS_WEEKEND_FN_IDX, handler: isWeekendOnDate },
    { index: IS_WORKDAY_FN_IDX, handler: isWorkdayOnDate },
    { index: SPAN_BETWEEN_FN_IDX, handler: spanBetweenDates },
  ],
  asConverters: {
    iso8601: (value) => stringValue(formatIso8601Local(value.toNumber())),
    // The same three fields the "what X is it" questions answer, in the
    // composable form: `next friday + 2 weeks as weekday`. Question phrases
    // only ever take a bare date expression, whereas `as` binds after a
    // whole expression, so these are the general case rather than a
    // shorthand — and they cost one line each, sharing the identical
    // handlers.
    weekday: (value) => weekdayOnDate([value]),
    month: (value) => monthOnDate([value]),
    week: (value) => weekOnDate([value]),
  },
};
