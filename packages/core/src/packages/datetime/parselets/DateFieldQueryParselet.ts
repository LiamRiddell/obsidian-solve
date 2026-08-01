import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

/**
 * The natural-question forms over a single date field:
 *
 * - `"on"` mode  — `what day is it on <date>` / `what month is it on <date>`
 *   / `weekday on <date>`, plus the BARE form (`what day is it`) which
 *   answers for right now.
 * - `"in"` mode  — `what day is it in <duration>`, i.e. the field of
 *   `now + <duration>`. `what day was it <duration> ago` is NOT this
 *   parselet: "ago" is a trailing word with no token of its own, so the
 *   backwards direction is spelled `what day is it in -30 days`, or
 *   `weekday on now - 30 days`.
 *
 * One parameterized class rather than six near-identical ones — the field
 * differs only by which plugin function receives the epoch-ms, mirroring
 * how `NowParselet(offset)` and `NextLastParselet(direction)` already
 * parameterize instead of subclassing.
 *
 * The bare form is handled by peeking rather than by its own token type:
 * `what day is it` and `what day is it on` fuse to the SAME token (the
 * phrase trie is longest-match-wins, so the 4-word phrase claims the "on"
 * case), and an absent operand is then just "no more tokens".
 */
export class DateFieldQueryParselet implements PrefixParselet {
  readonly category = "Date/Time";

  constructor(
    private readonly functionIndex: number,
    private readonly mode: "on" | "in",
  ) {}

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    if (this.mode === "in") {
      builder.emitOpcode(OpCode.DATE_NOW);
      parser.parseExpression(0, builder); // the duration
      builder.emitOpcode(OpCode.ADD); // now + duration
    } else if (parser.peek()) {
      parser.parseExpression(0, builder); // the date expression
    } else {
      builder.emitOpcode(OpCode.DATE_NOW); // bare form — "what day is it"
    }

    builder.emitOpcode(OpCode.CALL_PLUGIN);
    builder.emitIndex(this.functionIndex);
    builder.emitIndex(1);
  }
}
