import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

/**
 * `7:30 to 20:45` / `4pm to 3am` — the duration between two clock times,
 * rolling over midnight when the end is earlier than the start (`4pm to
 * 3am` -> 11 hours, not a negative duration). Handles the fused
 * `CLOCK_TIME_INTERVAL` token produced by
 * {@link clockTimeIntervalNormalizerRule} (value = `"<startMin>:<endMin>"`).
 *
 * The rollover-aware subtraction happens here at parse time (both
 * endpoints are already known integers baked into the fused token) —
 * no VM opcode needed, just plain arithmetic producing a duration `Uom`.
 */
export class ClockTimeIntervalParselet implements PrefixParselet {
	readonly category = "Time";

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    const [startStr, endStr] = token.value.split(":");
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    const durationMinutes = end >= start ? end - start : (1440 - start) + end;

    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(durationMinutes);
    builder.emitOpcode(OpCode.PUSH_STRING);
    builder.emitString("minutes");
    builder.emitOpcode(OpCode.UOM_CONVERT);
  }
}
