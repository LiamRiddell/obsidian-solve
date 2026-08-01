import { InfixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";
import { TO_DATE_FN_IDX } from "./DatetimeTimestampPluginFunctions";

/**
 * `<ISO8601 string> to date` / `<unix timestamp> to date` -> a Datetime
 * value.
 *
 * Handles the fused `TO_DATE` token, produced by the package's `phrases`
 * field (`"to date": "TO_DATE"`) — fusing the full "to date" phrase means
 * this does NOT compete with the bare `TO` infix token, which
 * `PercentageChangeParselet.ts` already owns (percentage change / UoM
 * conversion) — `ParseletRegistry` only allows ONE parselet per token
 * type, so claiming bare `TO` here would silently overwrite that
 * registration (see `ParseletRegistry.ts`'s collision-warning doc
 * comment). Because phrase fusion happens at the normalizer stage, BEFORE
 * parsing ever sees a `TO` token in this position, there's no such
 * collision — "to date" is a completely different token by the time the
 * parser runs, at zero risk to "5 to 10" or "$5 to USD".
 *
 * The left-hand value is already on the stack by the time an infix
 * parselet runs (the Pratt loop parsed it already) — this just applies
 * `TO_DATE_FN_IDX`'s runtime type-dispatch (String/Number/Datetime) on
 * top of it. See `DatetimeTimestampPluginFunctions.ts`'s
 * `toDateFromAnyHandler` doc comment for the exact dispatch rules
 * (including the seconds-vs-milliseconds magnitude heuristic).
 */
export class ToDateParselet implements InfixParselet {
  readonly category = "Date/Time";
  readonly bindingPower = BindingPower.Conditional;

  parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
    builder.emitOpcode(OpCode.CALL_PLUGIN);
    builder.emitIndex(TO_DATE_FN_IDX);
    builder.emitIndex(1);
  }
}
