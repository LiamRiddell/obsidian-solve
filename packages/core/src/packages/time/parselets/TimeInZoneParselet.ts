import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import { tryConsumeZoneReference } from "./shared/ZoneReference";

/**
 * `time in <city>` -> that zone's current wall-clock time. `date in
 * <city>` -> that zone's current calendar date. One parameterized
 * parselet for both, triggered on the fused `TIME_IN`/`DATE_IN` token
 * (see `TimePackage.ts`'s `phrases` field) — "time"/"date" are common
 * variable names, so the trigger is the full two-word phrase, not the
 * bare word (same reasoning as `MathPhrasesPackage.ts`'s "average of"
 * pattern: fusing the phrase means the bare word stays a plain,
 * still-usable `IDENT`).
 */
export function timeOrDateInZoneParselet(pluginFnIdx: number): PrefixParselet {
  return {
    category: "Time",
    parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
      const zone = tryConsumeZoneReference(parser);
      if (zone === null) {
        throw ErrorFactory.parsing(
          "TIME_ZONE_EXPECTED_CITY",
          `Expected a city or zone name after "${token.value}" (e.g. "time in Paris")`,
        );
      }
      builder.emitOpcode(OpCode.PUSH_STRING);
      builder.emitString(zone.zoneRef);
      builder.emitOpcode(OpCode.CALL_PLUGIN);
      builder.emitIndex(pluginFnIdx);
      builder.emitIndex(1);
    },
  };
}
