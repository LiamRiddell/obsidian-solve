import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import { framesToTimecodeString } from "../timecode/TimecodeMath";

/**
 * `<N> frames` — a plain frame-count duration, `Uom(N, "frames")`. Also
 * the reverse of {@link VideoTimecodeParselet}: `<N> frames @ <fps>` (or
 * `... at <fps>`) converts the frame count back into `HH:MM:SS:FF`
 * display notation, producing a formatted STRING value (matches
 * `timezones/ZoneMath.ts`'s "compute then return a formatted String
 * Value" pattern for the same kind of display-only conversion).
 *
 * Handles the fused `FRAME_COUNT` token produced by
 * {@link frameCountNormalizerRule}. Both `N` and the fps are always
 * parse-time-literal numbers by construction of that fusion rule (mirrors
 * `FpsRateParselet.ts`'s "NUMBER fps" fusion, which has the same
 * restriction) — so the `HH:MM:SS:FF` string is computed directly at
 * parse time rather than needing a runtime `CALL_PLUGIN` handler.
 */
export class FrameCountParselet implements PrefixParselet {
  readonly category = "Time";

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    const frameCount = parseFloat(token.value);

    const separator = parser.peek();
    if (separator && (separator.type === "RATE_AT" || separator.type === "AT")) {
      parser.consume();
      const fpsToken = parser.peek();
      if (!fpsToken || fpsToken.type !== "FPS_RATE") {
        throw ErrorFactory.parsing(
          "TIMECODE_EXPECTED_FPS",
          `Expected "<number> fps" after "${separator.value}" (e.g. "@ 30 fps")`
        );
      }
      parser.consume();
      const fps = parseFloat(fpsToken.value);

      builder.emitOpcode(OpCode.PUSH_STRING);
      builder.emitString(framesToTimecodeString(frameCount, fps));
      return;
    }

    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(frameCount);
    builder.emitOpcode(OpCode.PUSH_STRING);
    builder.emitString("frames");
    builder.emitOpcode(OpCode.UOM_CONVERT);
  }
}
