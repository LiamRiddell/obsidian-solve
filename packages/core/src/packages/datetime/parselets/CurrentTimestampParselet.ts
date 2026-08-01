import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { TO_TIMESTAMP_FN_IDX } from "./DatetimeTimestampPluginFunctions";

/**
 * `current timestamp` -> the current Unix timestamp in seconds, as a
 * plain Number.
 *
 * Handles the fused `CURRENT_TIMESTAMP` token — "current"/"timestamp" are
 * both plausible variable names, so this is fused as the full two-word
 * phrase (via the package's `phrases` field) rather than claiming either
 * bare word as its own keyword, same reasoning as `WorkdaysInParselet.ts`.
 *
 * Emits a fresh `DATE_NOW` (so "current timestamp" is always the instant
 * the bytecode actually runs, not a parse-time constant — matches
 * `NowParselet.ts`'s existing "now"/"today" convention) followed by the
 * SAME `TO_TIMESTAMP_FN_IDX` handler `ToTimestampParselet.ts` uses for
 * `<date> to timestamp` — "current timestamp" is exactly "now to
 * timestamp" under the hood, so there is no separate conversion logic to
 * duplicate.
 */
export class CurrentTimestampParselet implements PrefixParselet {
  readonly category = "Date/Time";

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    builder.emitOpcode(OpCode.DATE_NOW);
    builder.emitOpcode(OpCode.CALL_PLUGIN);
    builder.emitIndex(TO_TIMESTAMP_FN_IDX);
    builder.emitIndex(1);
  }
}
