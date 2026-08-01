import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

/**
 * `if <condition> then <value> else <value>` — an eager ternary (see
 * `OpCode.SELECT` in `vm/VM.ts` for why this VM has no real branching).
 *
 * NOT built on {@link definePhrasePattern}: that builder's alternatives
 * are disambiguated by peeking the NEXT token's leading keyword — a
 * mechanism for one registered trigger fanning out into multiple
 * grammars (e.g. `DiceRollParselet`'s `between`/`from`/`(` forms, all
 * reached via the single "roll" registration). `IF` is registered
 * directly as this parselet's own trigger, so by the time `parse()`
 * runs, "if" is already consumed and there is exactly one grammar to
 * match — a plain, hand-written sequence is simpler and more honest here
 * than forcing a single-alternative pattern through machinery built for
 * disambiguation it doesn't need.
 */
export class IfThenElseParselet implements PrefixParselet {
	readonly category = "Conditionals";

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(0, builder); // condition
    parser.consume("THEN");
    parser.parseExpression(0, builder); // then-value
    parser.consume("ELSE");
    parser.parseExpression(0, builder); // else-value
    builder.emitOpcode(OpCode.SELECT);
  }
}
