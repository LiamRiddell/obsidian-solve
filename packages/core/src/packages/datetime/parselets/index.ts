export { NowParselet } from "./NowParselet";
export { NextLastParselet } from "./NextLastParselet";
export { UntilSinceParselet } from "./UntilSinceParselet";
export { WorkdaysInParselet } from "./WorkdaysInParselet";
export { WeekdayOnParselet } from "./WeekdayOnParselet";
export { CurrentTimestampParselet } from "./CurrentTimestampParselet";
export { ToDateParselet } from "./ToDateParselet";
export { ToTimestampParselet } from "./ToTimestampParselet";
export { DateLiteralParselet } from "./DateLiteralParselet";

import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { NowParselet } from "./NowParselet";
import { NextLastParselet } from "./NextLastParselet";
import { UntilSinceParselet } from "./UntilSinceParselet";
import { WorkdaysInParselet } from "./WorkdaysInParselet";
import { WeekdayOnParselet } from "./WeekdayOnParselet";
import { CurrentTimestampParselet } from "./CurrentTimestampParselet";
import { ToDateParselet } from "./ToDateParselet";
import { ToTimestampParselet } from "./ToTimestampParselet";
import { DateLiteralParselet } from "./DateLiteralParselet";

/**
 * Registers this package's parselets directly against a bare
 * {@link ParseletRegistry} — used by the isolated tokenize+parse test
 * harness (see MathPhrasesPackage's parselets/index.ts for the established
 * pattern). NOTE: this does NOT register `pluginFunctions` (the
 * `WORKDAYS_IN`/`WEEKDAY_ON`/`TO_DATE`/`TO_TIMESTAMP` grammars all end in
 * a `CALL_PLUGIN`, which needs `DatetimePackage.ts`'s `pluginFunctions`
 * entries registered too — see that file, or a real
 * `ExpressionEngine.registerPackage(DATETIME_PACKAGE)`, for a harness that
 * can actually EVALUATE these, not just parse them) or `phrases` (phrase
 * fusion needs the `TokenNormalizer`, not just the `ParseletRegistry`).
 */
export function registerDatetimeParselets(registry: ParseletRegistry): void {
  registry.registerPrefix("NOW", new NowParselet(0));
  registry.registerPrefix("TODAY", new NowParselet(0));
  registry.registerPrefix("TOMORROW", new NowParselet(1));
  registry.registerPrefix("YESTERDAY", new NowParselet(-1));
  registry.registerPrefix("NEXT", new NextLastParselet("next"));
  registry.registerPrefix("LAST", new NextLastParselet("last"));
  registry.registerPrefix("UNTIL_UNIT", new UntilSinceParselet("until"));
  registry.registerPrefix("SINCE_UNIT", new UntilSinceParselet("since"));
  registry.registerPrefix("WORKDAYS_IN", new WorkdaysInParselet());
  registry.registerPrefix("WEEKDAY_ON", new WeekdayOnParselet());
  registry.registerPrefix("CURRENT_TIMESTAMP", new CurrentTimestampParselet());
  registry.registerInfix("TO_DATE", new ToDateParselet());
  registry.registerInfix("TO_TIMESTAMP", new ToTimestampParselet());
  registry.registerPrefix("DATETIME_LITERAL", new DateLiteralParselet());
}
