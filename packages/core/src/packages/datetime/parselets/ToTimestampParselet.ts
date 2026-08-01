import { InfixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";
import { TO_TIMESTAMP_FN_IDX } from "./DatetimeTimestampPluginFunctions";

/**
 * `<date/time> to timestamp` -> a Unix timestamp in seconds, as a plain
 * Number.
 *
 * Handles the fused `TO_TIMESTAMP` token (`"to timestamp": "TO_TIMESTAMP"`
 * in the package's `phrases` field) — see `ToDateParselet.ts`'s doc
 * comment for why fusing the full phrase (rather than claiming bare `TO`)
 * is required to avoid colliding with `PercentageChangeParselet.ts`'s
 * existing ownership of the bare `TO` token.
 */
export class ToTimestampParselet implements InfixParselet {
  readonly category = "Date/Time";
  readonly bindingPower = BindingPower.Conditional;

  parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
    builder.emitOpcode(OpCode.CALL_PLUGIN);
    builder.emitIndex(TO_TIMESTAMP_FN_IDX);
    builder.emitIndex(1);
  }
}
