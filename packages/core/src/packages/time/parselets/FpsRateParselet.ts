import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

/**
 * `30 fps` — a frame-rate literal, constructed directly as a
 * `Rate(N, "frames", "s")` value (see `vm/Value.ts`'s `rateValue()`) so
 * `30 fps × 3 minutes` -> `5,400 frames` works via the existing
 * `RATE_MUL` opcode with zero fps-specific VM logic. Handles the fused
 * `FPS_RATE` token produced by {@link fpsRateNormalizerRule}.
 */
export class FpsRateParselet implements PrefixParselet {
	readonly category = "Time";

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(parseFloat(token.value));
    builder.emitOpcode(OpCode.PUSH_STRING);
    builder.emitString("frames/s");
    builder.emitOpcode(OpCode.UOM_CONVERT);
  }
}
