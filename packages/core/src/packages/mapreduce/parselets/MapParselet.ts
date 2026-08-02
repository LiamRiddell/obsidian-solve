import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import {
  parseTransform,
  isZippedCollectionForm,
  consumeCollectionName,
  parseCollectionExpr,
  emitInvoke,
} from "../MapReduceShared";

/**
 * `map(transform, collection)` or `map(transform, name1=collection1,
 * name2=collection2, ...)` — applies `transform` to every (zipped)
 * element of one or more collections (a Matrix or a bare Range —
 * `map(f, 0:3)`), producing a new 1xN row-vector Matrix.
 *
 * The simple single-collection form implicitly binds the reserved name
 * `x` (`map(10*x, [0,1,500])`); the explicit zipped form declares its own
 * names (`map(10*y+x, x=[1,2], y=[3,4])`). See `MapReduceShared.ts`'s
 * `parseTransform()` for how `transform` itself is disambiguated between
 * an inline expression, a bare builtin name, and a bare user-function
 * name.
 */
export class MapParselet implements PrefixParselet {
  readonly category = "MapReduce";

  parse(parser: Parser, _token: Token, builder: BytecodeBuilder): void {
    parser.consume("LPAREN");

    const transform = parseTransform(parser, builder);
    parser.consume("COMMA");

    const paramNames: string[] = [];
    if (isZippedCollectionForm(parser)) {
      do {
        const name = consumeCollectionName(parser);
        parser.consume("EQUALS");
        parseCollectionExpr(parser, builder);
        paramNames.push(name);
      } while (parser.match("COMMA"));
    } else {
      parseCollectionExpr(parser, builder);
      paramNames.push("x");
    }

    parser.consume("RPAREN");

    emitInvoke(builder, OpCode.MAP_INVOKE, transform, paramNames, paramNames.length);
  }
}
