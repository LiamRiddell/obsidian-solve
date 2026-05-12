import { PrefixParselet } from "@/engine/parser/Parselet";
import { Parser } from "@/engine/parser/Parser";
import { Token } from "@/engine/lexer/Token";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { OpCode } from "@/engine/parser/OpCode";

export class BigIntNumberParselet implements PrefixParselet {
  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    let raw = token.value;
    if (raw.endsWith("n")) raw = raw.slice(0, -1);

    let bigVal: bigint;
    if (raw.startsWith("0b") || raw.startsWith("0B")) {
      bigVal = BigInt(parseInt(raw, 2));
    } else if (raw.startsWith("0x") || raw.startsWith("0X")) {
      bigVal = BigInt(parseInt(raw, 16));
    } else {
      bigVal = BigInt(raw);
    }

    const num = Number(bigVal);
    builder.emitOpcode(OpCode.PUSH_BIGINT);
    builder.emitNumber(num);
  }
}
