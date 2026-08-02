import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import { parseCollectionExpr, emitInvoke } from "../MapReduceShared";

/**
 * `prod(elementExpr, collection)` — parse-time sugar for
 * `reduce(acc*elementExpr, collection)`. See `SumParselet.ts`'s doc
 * comment for the full construction technique (identical, just `MUL`
 * instead of `ADD`).
 */
export class ProdParselet implements PrefixParselet {
  readonly category = "MapReduce";

  parse(parser: Parser, _token: Token, builder: BytecodeBuilder): void {
    parser.consume("LPAREN");

    const bodyBuilder = new BytecodeBuilder();
    bodyBuilder.emitOpcode(OpCode.LOAD_VAR);
    bodyBuilder.emitString("acc");
    parser.parseExpression(BindingPower.Lowest, bodyBuilder);
    parser.setBuilder(builder);
    bodyBuilder.emitOpcode(OpCode.MUL);
    const bodyProgram = bodyBuilder.build();
    if (bodyProgram.hasAsync) {
      throw ErrorFactory.parsing(
        "MAP_REDUCE_TRANSFORM_MUST_BE_SYNCHRONOUS",
        `prod's element expression must be synchronous (no weather/stocks/currency calls).`,
      );
    }

    parser.consume("COMMA");
    parseCollectionExpr(parser, builder);
    parser.consume("RPAREN");

    emitInvoke(builder, OpCode.REDUCE_INVOKE, { kind: 0, program: bodyProgram }, ["acc", "x"], 0);
  }
}
