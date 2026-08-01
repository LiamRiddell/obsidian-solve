import { InfixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { COOKING_CONVERT_IDX } from "./CookingPluginFunctions";

/**
 * `<mass-or-volume> <substance> in <target-unit>` — cooking mass<->volume
 * conversion, e.g. "300g butter in cups" -> "1.32 cup", "10 cups olive oil
 * in grams" -> "~2160 g", "100g nutella in tablespoons".
 *
 * Registered as the INFIX parselet for the fused `INGREDIENT_NAME` token
 * (see `normalizer/IngredientNameNormalizerRule.ts`) — the substance name
 * sits BETWEEN the quantity+unit and the target unit, the same shape as
 * `ClampParselet`'s "clamp X between Y and Z" (the pivot isn't a leading
 * keyword, so this isn't a `definePhrasePattern`-friendly grammar and is
 * hand-written instead).
 *
 * By the time this parselet fires, the left-hand `<mass-or-volume>` value
 * (e.g. "300g") is already a `Uom` value on the bytecode stack — the
 * standard `NUMBER UNIT` literal path (`UomLiteralParselet`, bindingPower
 * `Postfix`=70) already ran and left it there; this parselet's only job is
 * to consume the ingredient name (already fused, `token.value`), the
 * literal "in", and the target-unit word, then hand all three off to the
 * density-aware `cookingConvertHandler`.
 *
 * No collision with the currency/UoM package's generic `InParselet` (also
 * registered on bare `IN`, see `InflationQueryParselet.ts`'s doc comment
 * for that collision in a DIFFERENT context): here, `IN` never appears as
 * a bare lookahead token during a sub-expression parse — it's consumed
 * directly by THIS parselet immediately after the fused `INGREDIENT_NAME`
 * token, which itself owns the entire "ingredient in target-unit" span.
 */
export class CookingConversionParselet implements InfixParselet {
  readonly category = "UoM";
  readonly bindingPower = 35;

  parse(parser: Parser, _left: Token, token: Token, builder: BytecodeBuilder): void {
    const ingredientName = token.value;
    parser.consume("IN");
    const targetToken = parser.consume();

    builder.emitOpcode(OpCode.PUSH_STRING);
    builder.emitString(ingredientName);
    builder.emitOpcode(OpCode.PUSH_STRING);
    builder.emitString(targetToken.value);
    builder.emitOpcode(OpCode.CALL_PLUGIN);
    builder.emitIndex(COOKING_CONVERT_IDX);
    builder.emitIndex(3);
  }
}
