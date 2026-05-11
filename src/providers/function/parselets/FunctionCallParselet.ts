import { PrefixParselet } from "@/engine/parser/Parselet";
import { Parser } from "@/engine/parser/Parser";
import { Token } from "@/engine/lexer/Token";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { OpCode } from "@/engine/parser/OpCode";
import { BindingPower } from "@/engine/parser/BindingPower";

const builtinNameToIndex: Record<string, number> = {
  sqrt: 0,
  abs: 1,
  sin: 2,
  cos: 3,
  tan: 4,
  log: 5,
  ceil: 6,
  floor: 7,
  round: 8,
  min: 9,
  max: 10,
};

export class FunctionCallParselet implements PrefixParselet {
  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    const fnName = token.value.toLowerCase();
    const fnIdx = builtinNameToIndex[fnName];
    if (fnIdx === undefined) {
      throw new Error(`Unknown function: ${fnName}`);
    }

    parser.consume("LPAREN");

    let argCount = 0;
    if (parser.peek()?.type !== "RPAREN") {
      parser.parseExpression(BindingPower.Lowest, builder);
      argCount++;
      while (parser.match("COMMA")) {
        parser.parseExpression(BindingPower.Lowest, builder);
        argCount++;
      }
    }

    parser.consume("RPAREN");

    builder.emitOpcode(OpCode.CALL_BUILTIN);
    builder.emitIndex(fnIdx);
    builder.emitIndex(argCount);
  }
}