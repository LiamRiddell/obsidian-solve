import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

export class NumberParselet implements PrefixParselet {
	readonly category = "Arithmetic";

	parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    let v: number;
    const raw = token.value;
    if (raw.startsWith("0x") || raw.startsWith("0X")) {
      v = parseInt(raw.slice(2), 16);
    } else if (raw.startsWith("0b") || raw.startsWith("0B")) {
      v = parseInt(raw.slice(2), 2);
    } else {
      v = parseFloat(raw);
    }
    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(v);
  }
}
