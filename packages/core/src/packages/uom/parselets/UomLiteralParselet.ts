import { InfixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";
import { isKnownUnit } from "@solve-js/lexer/units";
import { resolveCurrencyAlias } from "@solve-js/uom/CurrencyAliases";

/**
 * Resolve `rawUnit` to its canonical ISO 4217 code if it's a recognized
 * currency WORD alias (e.g. "euros" -> "EUR"); otherwise return it
 * unchanged. Every other unit (km, grams, workdays, ...) passes straight
 * through untouched — this only ever fires for the specific word list in
 * `uom/CurrencyAliases.ts`'s `CURRENCY_WORD_ALIASES`.
 */
function resolveUnitAlias(rawUnit: string): string {
  return resolveCurrencyAlias(rawUnit) ?? rawUnit;
}

export class UomLiteralParselet implements InfixParselet {
	readonly category = "UoM";
	readonly bindingPower = BindingPower.Postfix;

  parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
    const unit = resolveUnitAlias(token.value);
    builder.emitOpcode(OpCode.PUSH_STRING);
    builder.emitString(unit);

    // Check if the next token is "to" or "in"
    if (parser.peek()?.type === "TO" || parser.peek()?.type === "IN") {
      parser.consume(); // consume TO or IN
      const targetToken = parser.peek();
      // Accept UNIT or IN (for cases like "3 ft in in" where
      // the target unit name collides with the IN keyword).
      if (targetToken?.type === "UNIT" || targetToken?.type === "IN") {
        parser.consume();
        builder.emitOpcode(OpCode.PUSH_STRING);
        builder.emitString(resolveUnitAlias(targetToken.value));
        builder.emitOpcode(OpCode.UOM_CONVERT_TO);
        return;
      }
      // "sourceUnit to ?" — conversion-possibilities query (wiki:
      // Units-Of-Measurement — "Explore what units a particular unit can
      // be converted into"). The source unit name is already on the
      // stack from the PUSH_STRING above.
      if (targetToken?.type === "QUESTION") {
        parser.consume();
        builder.emitOpcode(OpCode.UOM_POSSIBILITIES);
        return;
      }
    }
    
    // Check if the next token is "best"
    if (parser.peek()?.type === "BEST") {
      parser.consume(); // consume BEST
      builder.emitOpcode(OpCode.UOM_BEST);
      return;
    }
    
    builder.emitOpcode(OpCode.UOM_CONVERT);
  }
}

export { isKnownUnit };
