import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { WORKDAYS_IN_FN_IDX } from "./DatetimeTimestampPluginFunctions";

/**
 * `workdays in <duration>` (e.g. "workdays in 3 weeks") -> the number of
 * Mon-Fri workdays in that span, as a plain Number.
 *
 * Handles the fused `WORKDAYS_IN` token produced by the package's
 * `phrases` field (`"workdays in": "WORKDAYS_IN"`) — fused as the FULL
 * two-word phrase rather than claiming bare "workdays" as its own keyword,
 * since "workdays" is a plausible variable name (same reasoning as
 * MathPhrasesPackage.ts's "average"/"total" note — see that file's doc
 * comment for the full regression story this avoids). The bare word
 * "workdays" itself only ever reaches this grammar as a UNIT token (added
 * to lexer/units.ts, for `N workdays` duration literals and `<date> + N
 * workdays` arithmetic — see vm/VM.ts's ADD/SUB special-casing), which
 * VariableParselet.ts already accepts for `:name = expr` syntax, so
 * ":workdays = 5" is unaffected either way.
 *
 * SCOPE DECISION (see `DatetimeTimestampPluginFunctions.ts`'s
 * `workdaysInDurationHandler` doc comment for the full reasoning): the
 * count is a deterministic ratio (5 workdays per full week, remainder
 * capped at 5), NOT a real calendar walk anchored to "now" — and does NOT
 * exclude public holidays, matching this session's established
 * holiday-scoping decision (see `vm/VM.ts`'s `addBusinessDays()`).
 */
export class WorkdaysInParselet implements PrefixParselet {
  readonly category = "Date/Time";

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(0, builder); // the duration expression, e.g. "3 weeks"
    builder.emitOpcode(OpCode.CALL_PLUGIN);
    builder.emitIndex(WORKDAYS_IN_FN_IDX);
    builder.emitIndex(1);
  }
}
