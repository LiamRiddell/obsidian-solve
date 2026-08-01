import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

/**
 * `now` / `today` (dayOffset 0), `tomorrow` (+1 day), `yesterday` (-1 day).
 *
 * Previously all four keywords shared one zero-offset implementation —
 * "tomorrow"/"yesterday" silently evaluated to the exact same instant as
 * "now" (a real bug: `evaluate("tomorrow") - evaluate("now")` was 0, not
 * ~86400000ms). Existing tests never caught this because they only
 * checked internal consistency (e.g. `"yesterday + 1 day" - "yesterday"
 * === 1 day`), which holds regardless of what "yesterday" itself resolves
 * to. dayOffset must stay applied at evaluation time (ADD on top of
 * DATE_NOW), not baked in at parse time, so "now"/"tomorrow"/"yesterday"
 * stay relative to whenever the bytecode actually runs.
 */
export class NowParselet implements PrefixParselet {
	readonly category = "Date/Time";
	private readonly msOffset: number;

	constructor(dayOffset: number = 0) {
		this.msOffset = dayOffset * 24 * 60 * 60 * 1000;
	}

	parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    builder.emitOpcode(OpCode.DATE_NOW);
    if (this.msOffset !== 0) {
      builder.emitOpcode(OpCode.PUSH_NUMBER);
      builder.emitNumber(this.msOffset);
      builder.emitOpcode(OpCode.ADD);
    }
  }
}
