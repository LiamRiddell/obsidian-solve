import { PrefixParselet } from "@/engine/parser/Parselet";
import { Parser } from "@/engine/parser/Parser";
import { Token } from "@/engine/lexer/Token";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { OpCode } from "@/engine/parser/OpCode";
import { BindingPower } from "@/engine/parser/BindingPower";

const symbolToCurrency: Record<string, string> = {
  "$": "usd",
  "£": "gbp",
  "€": "eur",
};

export class CurrencySymbolParselet implements PrefixParselet {
  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    const currency = symbolToCurrency[token.value] ?? token.value.toLowerCase();
    parser.parseExpression(BindingPower.Prefix, builder);
    if (parser.peek()?.type === "UNIT") {
      parser.consume();
    }
    builder.emitOpcode(OpCode.PUSH_STRING);
    builder.emitString(currency);
    builder.emitOpcode(OpCode.UOM_CONVERT);
  }
}
