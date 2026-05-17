import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";

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
