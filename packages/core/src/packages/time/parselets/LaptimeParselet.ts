import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

/**
 * `03:04:05` / `00:00:01.5` — a lap-time/stopwatch-split duration, in
 * seconds. Handles the fused `LAPTIME` token produced by
 * {@link laptimeNormalizerRule} (value = total seconds, as a decimal
 * string). Represented as `Uom(totalSeconds, "s")`, so laptime arithmetic
 * (`03:04:05 + 01:02:03`) works via the existing generic ADD/SUB opcodes
 * — both operands share the exact same unit string, the fast path in
 * `VMConversion.ts`'s `unifyUom()`.
 */
export class LaptimeParselet implements PrefixParselet {
	readonly category = "Time";

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(parseFloat(token.value));
    builder.emitOpcode(OpCode.PUSH_STRING);
    builder.emitString("s");
    builder.emitOpcode(OpCode.UOM_CONVERT);
  }
}
