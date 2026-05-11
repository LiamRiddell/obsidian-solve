import { PrefixParselet } from "@/engine/parser/Parselet";
import { Parser } from "@/engine/parser/Parser";
import { Token } from "@/engine/lexer/Token";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { OpCode } from "@/engine/parser/OpCode";

export class ConstantParselet implements PrefixParselet {
  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    const val = token.type === "PI" ? Math.PI : Math.E;
    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(val);
  }
}