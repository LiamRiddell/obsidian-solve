import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";

/** Weekday token type → JS Date.getDay() index (0=Sunday..6=Saturday). */
const WEEKDAY_TOKEN_INDEX: Record<string, number> = {
	SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6,
};

/**
 * `next <Weekday>` / `last <Weekday>` (wiki: Datetime — "next Saturday",
 * "last Monday") — the actual next/previous occurrence of the named day
 * of the week, computed at evaluation time by {@link OpCode.DATE_NEXT_WEEKDAY}/
 * {@link OpCode.DATE_LAST_WEEKDAY} (must stay a VM opcode, not parse-time
 * arithmetic — "now" can only be read when the bytecode actually runs).
 */
export class NextLastParselet implements PrefixParselet {
	readonly category = "Date/Time";
	constructor(private readonly direction: "next" | "last") {}

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    const dayToken = parser.peek();
    const targetDay = dayToken ? WEEKDAY_TOKEN_INDEX[dayToken.type] : undefined;
    if (targetDay === undefined) {
      throw ErrorFactory.parsing(
        "MISSING_WEEKDAY",
        `"${token.value}" must be followed by a day of the week (e.g. "${token.value} Saturday")`,
        { keyword: token.value, actualType: dayToken?.type, actualValue: dayToken?.value }
      );
    }
    parser.consume(); // consume the weekday token

    builder.emitOpcode(OpCode.DATE_NOW);
    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(targetDay);
    builder.emitOpcode(this.direction === "next" ? OpCode.DATE_NEXT_WEEKDAY : OpCode.DATE_LAST_WEEKDAY);
  }
}
