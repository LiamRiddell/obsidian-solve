import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

export class BigIntNumberParselet implements PrefixParselet {
  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    let raw = token.value;
    if (raw.endsWith("n")) raw = raw.slice(0, -1);
    const bigVal = BigInt(raw);
    const num = Number(bigVal);
    builder.emitOpcode(OpCode.PUSH_BIGINT);
    builder.emitNumber(num);
  }
}
