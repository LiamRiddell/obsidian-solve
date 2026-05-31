import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

export class BigIntNumberParselet implements PrefixParselet {
	readonly category = "BigInt";
	parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    let raw = token.value;
    if (raw.endsWith("n")) raw = raw.slice(0, -1);
    // Store as string to preserve arbitrary precision (exceeds Float64)
    builder.emitOpcode(OpCode.PUSH_BIGINT);
    builder.emitString(raw);
  }
}
