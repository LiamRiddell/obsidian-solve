import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";
import { resolveCurrencyAlias } from "@solve-js/uom/CurrencyAliases";

/** Resolve a currency WORD alias (e.g. "euros" -> "EUR") if recognized; otherwise return `rawUnit` unchanged. See uom/CurrencyAliases.ts. */
function resolveUnitAlias(rawUnit: string): string {
  return resolveCurrencyAlias(rawUnit) ?? rawUnit;
}

export class ConvertParselet implements PrefixParselet {
	readonly category = "UoM";
	parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(BindingPower.Postfix, builder);
    const nextToken = parser.peek();

    // Case 1: convert <number> <unit> [to <target>] — explicit unit after value
    if (nextToken && nextToken.type === "UNIT") {
      parser.consume();
      builder.emitOpcode(OpCode.PUSH_STRING);
      builder.emitString(resolveUnitAlias(nextToken.value));

      if (parser.peek()?.type === "TO") {
        parser.consume("TO");
        const targetToken = parser.consume();
        if (targetToken?.type === "UNIT") {
          builder.emitOpcode(OpCode.PUSH_STRING);
          builder.emitString(resolveUnitAlias(targetToken.value));
          builder.emitOpcode(OpCode.UOM_CONVERT_TO);
        } else if (targetToken?.type === "BEST") {
          builder.emitOpcode(OpCode.UOM_BEST);
        }
      } else {
        builder.emitOpcode(OpCode.UOM_CONVERT);
      }
      return;
    }

    // Case 2: convert (<expression>) to <target> — parenthesized or complex
    // expression where the expression result already has units on the stack.
    if (nextToken && (nextToken.type === "TO" || nextToken.type === "IN")) {
      parser.consume(); // consume TO or IN
      const targetToken = parser.peek();
      if (targetToken?.type === "UNIT" || targetToken?.type === "IN" ||
          targetToken?.type === "DOLLAR" || targetToken?.type === "POUND" ||
          targetToken?.type === "EURO" || targetToken?.type === "YEN" ||
          targetToken?.type === "RUBLE" || targetToken?.type === "WON" ||
          targetToken?.type === "CURRENCY_SYMBOL" || targetToken?.type === "IDENT") {
        parser.consume();
        builder.emitOpcode(OpCode.PUSH_STRING);
        builder.emitString(resolveUnitAlias(targetToken.value));
        builder.emitOpcode(OpCode.UOM_CONVERT_IN);
      } else if (targetToken?.type === "BEST") {
        parser.consume();
        builder.emitOpcode(OpCode.UOM_BEST);
      }
      return;
    }

    // Case 3: convert <expression> (no target) — value is already on the stack
    // as a UOM value. Nothing more to emit.
  }
}
