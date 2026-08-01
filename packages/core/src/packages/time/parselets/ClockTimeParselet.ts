import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import { tryConsumeZoneReference } from "./shared/ZoneReference";
import { ZONE_CONVERT_FN_IDX } from "./TimezonePluginFunctions";

/**
 * `9:00am` / `16:00` / `4pm` — a clock-time-of-day literal, anchored to
 * today's calendar date (see `OpCode.CLOCK_TIME_TODAY` in `vm/VM.ts`).
 * Handles the fused `CLOCK_TIME` token produced by
 * {@link clockTimeNormalizerRule} (token value = total minutes since
 * midnight, as a decimal string).
 *
 * Also handles the optional timezone-conversion suffix, `<clock-time>
 * <sourceZone> in <targetZone>` (e.g. "6pm Sydney in Chicago") — see
 * {@link tryConsumeZoneReference}. The suffix is entirely optional and
 * only consumes tokens once a recognized zone name is actually found
 * immediately after the clock-time literal, so the plain
 * `CLOCK_TIME_TODAY` path below is completely unchanged when no suffix is
 * present. A recognized source zone with no following "in <target>" is a
 * parse error (not silently ignored) — once a zone name is consumed,
 * there's no going back given this parser has no backtracking.
 */
export class ClockTimeParselet implements PrefixParselet {
	readonly category = "Time";

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    const totalMinutes = parseInt(token.value, 10);
    const sourceZoneRef = tryConsumeZoneReference(parser);

    if (sourceZoneRef !== null) {
      if (parser.peek()?.type !== "IN") {
        throw ErrorFactory.parsing(
          "TIME_ZONE_EXPECTED_IN",
          `Expected "in <city>" after the zone name (e.g. "6pm Sydney in Chicago") but got ${parser.peek() ? `"${parser.peek()!.value}"` : "end of input"}`,
        );
      }
      parser.consume(); // "in"
      const target = tryConsumeZoneReference(parser);
      if (target === null) {
        throw ErrorFactory.parsing(
          "TIME_ZONE_EXPECTED_TARGET",
          `Expected a city or zone name after "in" (e.g. "6pm Sydney in Chicago")`,
        );
      }
      builder.emitOpcode(OpCode.PUSH_NUMBER);
      builder.emitNumber(totalMinutes);
      builder.emitOpcode(OpCode.PUSH_STRING);
      builder.emitString(sourceZoneRef.zoneRef);
      builder.emitOpcode(OpCode.PUSH_STRING);
      builder.emitString(target.zoneRef);
      builder.emitOpcode(OpCode.CALL_PLUGIN);
      builder.emitIndex(ZONE_CONVERT_FN_IDX);
      builder.emitIndex(3);
      return;
    }

    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(totalMinutes);
    builder.emitOpcode(OpCode.CLOCK_TIME_TODAY);
  }
}
