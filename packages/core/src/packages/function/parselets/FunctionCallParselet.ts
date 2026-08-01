import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";

const builtinNameToIndex: Record<string, number> = {
  sqrt: 0, abs: 1, sin: 2, cos: 3, tan: 4, log: 5,
  ceil: 6, floor: 7, round: 8, min: 9, max: 10,
  asin: 11, acos: 12, atan: 13, atan2: 14,
  sinh: 15, cosh: 16, tanh: 17,
  asinh: 18, acosh: 19, atanh: 20,
  cbrt: 21, clz32: 22, expm1: 23, exp: 24,
  fround: 25, hypot: 26, imul: 27,
  log10: 28, log1p: 29, log2: 30,
  pow: 31, random: 32, sign: 33, trunc: 34,
  degtorad: 35, radtodeg: 36,
};

export class FunctionCallParselet implements PrefixParselet {
	readonly category = "Function";
	parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    const fnName = token.value.toLowerCase();
    const fnIdx = builtinNameToIndex[fnName];
    if (fnIdx === undefined) {
      throw ErrorFactory.execution(
        'UNKNOWN_FUNCTION',
        `Unknown function: ${fnName}`,
        { functionName: fnName }
      );
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
