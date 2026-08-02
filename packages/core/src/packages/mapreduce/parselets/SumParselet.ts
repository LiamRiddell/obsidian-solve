import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import { parseCollectionExpr, emitInvoke } from "../MapReduceShared";

/**
 * `sum(elementExpr, collection)` — parse-time sugar for
 * `reduce(acc+elementExpr, collection)`, no separate runtime
 * implementation. `elementExpr` may reference the reserved name `x` (the
 * current element) — `sum(x, c)` is the trivial "sum of the raw
 * elements" case; `sum(x^2, c)` would be "sum of squares", etc.
 *
 * Built by emitting `LOAD_VAR acc` directly into a fresh builder, then
 * letting the parser continue writing `elementExpr`'s own bytecode onto
 * that SAME builder, then appending `ADD` — no bytecode-splicing API is
 * needed since `parseExpression(minBp, builder)` just keeps emitting
 * whatever comes next onto whichever builder is currently active.
 */
export class SumParselet implements PrefixParselet {
  readonly category = "MapReduce";

  parse(parser: Parser, _token: Token, builder: BytecodeBuilder): void {
    parser.consume("LPAREN");

    const bodyBuilder = new BytecodeBuilder();
    bodyBuilder.emitOpcode(OpCode.LOAD_VAR);
    bodyBuilder.emitString("acc");
    parser.parseExpression(BindingPower.Lowest, bodyBuilder);
    parser.setBuilder(builder);
    bodyBuilder.emitOpcode(OpCode.ADD);
    const bodyProgram = bodyBuilder.build();
    if (bodyProgram.hasAsync) {
      throw ErrorFactory.parsing(
        "MAP_REDUCE_TRANSFORM_MUST_BE_SYNCHRONOUS",
        `sum's element expression must be synchronous (no weather/stocks/currency calls).`,
      );
    }

    parser.consume("COMMA");
    parseCollectionExpr(parser, builder);
    parser.consume("RPAREN");

    emitInvoke(builder, OpCode.REDUCE_INVOKE, { kind: 0, program: bodyProgram }, ["acc", "x"], 0);
  }
}
