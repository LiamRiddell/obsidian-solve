import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { WEEKDAY_ON_FN_IDX } from "./DatetimeTimestampPluginFunctions";

/**
 * `day of the week on <date>` / `weekday on <date>` -> the weekday name
 * (e.g. "Tuesday") as a String value.
 *
 * Handles the fused `WEEKDAY_ON` token, produced by TWO separate phrase
 * entries in the package's `phrases` field ("day of the week on" and
 * "weekday on") that both target this same token type — fused as full
 * phrases rather than claiming bare "weekday"/"day" as keywords, for the
 * same variable-name-collision reasons as `WorkdaysInParselet.ts`.
 */
export class WeekdayOnParselet implements PrefixParselet {
  readonly category = "Date/Time";

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(0, builder); // the date expression
    builder.emitOpcode(OpCode.CALL_PLUGIN);
    builder.emitIndex(WEEKDAY_ON_FN_IDX);
    builder.emitIndex(1);
  }
}
