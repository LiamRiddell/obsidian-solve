import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";
import { SPAN_BETWEEN_FN_IDX } from "./DatetimeTimestampPluginFunctions";

/**
 * `<TimeUnit> between <Datetime> and <Datetime>` — the span between two
 * explicit dates, in the given unit ("days between today and 25/12/2026").
 *
 * The sibling of {@link UntilSinceParselet}, which only ever measures
 * against `now`; this is the two-explicit-endpoints form. Result is
 * unsigned — "between" has no direction in English the way until/since do,
 * so the endpoints are ordered by value rather than by how they were
 * written, and `days between A and B` == `days between B and A`.
 *
 * Handles the fused `BETWEEN_UNIT` token from
 * {@link betweenUnitNormalizerRule}.
 *
 * Note "and" lexes to PLUS (`and: "PLUS"` in the locale keyword table —
 * it's the word form of addition, as in "1 and 2"). So the first endpoint
 * must be parsed at a binding power that stops before it, exactly as
 * `ClampParselet` does for `clamp X between Y and Z`.
 */
export class DurationBetweenParselet implements PrefixParselet {
  readonly category = "Date/Time";

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    const unit = token.value; // the fused UNIT token's original text, e.g. "days"

    parser.parseExpression(BindingPower.Product, builder); // first endpoint
    parser.consume("PLUS"); // "and"
    parser.parseExpression(BindingPower.Lowest, builder); // second endpoint

    // An unsigned Uom("ms") span — a plugin function rather than SUB, since
    // there is no ABS opcode and "between" must not depend on write order.
    builder.emitOpcode(OpCode.CALL_PLUGIN);
    builder.emitIndex(SPAN_BETWEEN_FN_IDX);
    builder.emitIndex(2);

    builder.emitOpcode(OpCode.PUSH_STRING);
    builder.emitString(unit);
    builder.emitOpcode(OpCode.UOM_CONVERT_IN);
  }
}
