import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { SUM_RANGE_FN_IDX, AVERAGE_RANGE_FN_IDX } from "../LinesPluginFunctions";

/**
 * `sum(line 1 : line 4)` / `total(line 1 : line 4)` / `average(line 1 :
 * line 4)` (NumPad's documented range-aggregation syntax) -- trigger
 * token is `SUM_RANGE_CALL` (sum and total share one token/parselet
 * instance, per NumPad's own docs treating them as synonyms) or
 * `AVERAGE_RANGE_CALL`.
 *
 * Critical correctness point: `line 1`/`line 4` here denote RAW BOUNDS
 * (the integers 1 and 4), not "evaluate line 1's value, evaluate line
 * 4's value". This parselet deliberately does NOT call
 * `parser.parseExpression()` for the bounds -- that would route through
 * `LineRefParselet`, which fetches the referenced line's VALUE, not its
 * raw number. Instead it hand-consumes the constrained
 * `LPAREN LINE_REF COLON LINE_REF RPAREN` grammar directly, reading each
 * `LINE_REF` token's already-fused `.value` (its raw digit text) via
 * `parseInt`.
 *
 * The mid-expression `COLON` here is safe: `VariableParselet` is only
 * registered as a PREFIX parselet for `COLON` (`packages/variables/`),
 * so a `COLON` encountered in this infix/mid-expression position is never
 * intercepted by it -- the Pratt loop simply has no infix parselet for
 * `COLON`, letting this hand-written parselet consume it explicitly, the
 * same pattern `ClampParselet`/`IfThenElseParselet` already use for
 * grammars `PhrasePattern` can't express.
 */
export class RangeAggregateParselet implements PrefixParselet {
  readonly category = "Lines";
  constructor(private readonly isAverage: boolean) {}

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    parser.consume("LPAREN");
    const fromToken = parser.consume("LINE_REF");
    parser.consume("COLON");
    const toToken = parser.consume("LINE_REF");
    parser.consume("RPAREN");

    const from = parseInt(fromToken.value, 10);
    const to = parseInt(toToken.value, 10);

    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(from);
    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(to);
    builder.emitOpcode(OpCode.CALL_PLUGIN);
    builder.emitIndex(this.isAverage ? AVERAGE_RANGE_FN_IDX : SUM_RANGE_FN_IDX);
    builder.emitIndex(2);
  }
}
