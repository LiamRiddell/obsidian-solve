import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";
import { parseTransform, parseCollectionExpr, emitInvoke } from "../MapReduceShared";

/**
 * `reduce(transform, collection[, initial])` — folds `collection` (a
 * Matrix or a bare Range) into a single value using `transform`, an
 * inline expression using the reserved names `acc`/`x`
 * (`reduce(acc+x, [1,2,3])`) or a bare 2-argument function reference
 * (builtin or user-defined — `reduce(f, [1,2,3])` is `f(f(1,2),3)`).
 *
 * Without `initial`, the collection's own first element seeds the
 * accumulator and folding starts from the second element — an empty
 * collection is then a clear error (there's nothing to seed from). With
 * `initial`, folding starts from `initial` over EVERY element
 * (`reduce(f,[1,2,3],1000)` is `f(f(f(1000,1),2),3)`).
 */
export class ReduceParselet implements PrefixParselet {
  readonly category = "MapReduce";

  parse(parser: Parser, _token: Token, builder: BytecodeBuilder): void {
    parser.consume("LPAREN");

    const transform = parseTransform(parser, builder);
    parser.consume("COMMA");

    parseCollectionExpr(parser, builder);

    let hasInitial = 0;
    if (parser.match("COMMA")) {
      // A plain expression — an initial accumulator is just a value, no
      // colon-range handling needed here (only the COLLECTION argument
      // accepts a bare Range).
      parser.parseExpression(BindingPower.Lowest, builder);
      hasInitial = 1;
    }

    parser.consume("RPAREN");

    emitInvoke(builder, OpCode.REDUCE_INVOKE, transform, ["acc", "x"], hasInitial);
  }
}
