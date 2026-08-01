import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import { tryConsumeZoneReference } from "./shared/ZoneReference";
import { TIME_DIFFERENCE_FN_IDX } from "./TimezonePluginFunctions";

/**
 * `time difference between <city1> and <city2>` -> a directional,
 * human-readable UTC-offset delta (see `timeDifferenceHandler` in
 * `TimezonePluginFunctions.ts`).
 *
 * Triggered on the fused `TIME_DIFFERENCE_BETWEEN` token (the full
 * three-word phrase, fused by `TimePackage.ts`'s `phrases` field) —
 * "difference" alone is a plausible variable name, so (matching this
 * package's other zone-query grammars) the trigger is the complete
 * phrase, not the bare word.
 *
 * "and" lexes as `PLUS`, not a literal "AND" token — see
 * `ConditionalsPackage.ts`'s doc comment. The first zone reference is
 * read via `tryConsumeZoneReference`, which only ever consumes a single
 * token (or a short, self-contained `GMT+N` sequence) — never an
 * open-ended `expr` — so there's no risk of it swallowing the "and", the
 * bindingPower guard other packages need for this collision doesn't
 * apply here.
 */
export class TimeDifferenceParselet implements PrefixParselet {
  readonly category = "Time";

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    const zone1 = tryConsumeZoneReference(parser);
    if (zone1 === null) {
      throw ErrorFactory.parsing(
        "TIME_DIFFERENCE_EXPECTED_CITY",
        `Expected a city or zone name after "time difference between" (e.g. "time difference between Seattle and Moscow")`,
      );
    }
    parser.consume("PLUS"); // "and"
    const zone2 = tryConsumeZoneReference(parser);
    if (zone2 === null) {
      throw ErrorFactory.parsing(
        "TIME_DIFFERENCE_EXPECTED_SECOND_CITY",
        `Expected a second city or zone name after "and" (e.g. "time difference between Seattle and Moscow")`,
      );
    }
    builder.emitOpcode(OpCode.PUSH_STRING);
    builder.emitString(zone1.zoneRef);
    builder.emitOpcode(OpCode.PUSH_STRING);
    builder.emitString(zone2.zoneRef);
    builder.emitOpcode(OpCode.PUSH_STRING);
    builder.emitString(zone1.displayName);
    builder.emitOpcode(OpCode.PUSH_STRING);
    builder.emitString(zone2.displayName);
    builder.emitOpcode(OpCode.CALL_PLUGIN);
    builder.emitIndex(TIME_DIFFERENCE_FN_IDX);
    builder.emitIndex(4);
  }
}
