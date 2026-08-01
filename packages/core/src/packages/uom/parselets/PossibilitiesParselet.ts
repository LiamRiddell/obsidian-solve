import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

/**
 * `sourceUnit to ?` (wiki: Units-Of-Measurement — "Conversion
 * Possibilities") — lists every unit convertible from `sourceUnit`.
 * Handles the fused `UOM_POSSIBILITIES_QUERY` token produced by
 * {@link uomPossibilitiesNormalizerRule} (see that file for why this is a
 * normalizer fusion rather than a plain prefix parselet on UNIT).
 */
export class PossibilitiesParselet implements PrefixParselet {
	readonly category = "UoM";

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    builder.emitOpcode(OpCode.PUSH_STRING);
    builder.emitString(token.value);
    builder.emitOpcode(OpCode.UOM_POSSIBILITIES);
  }
}
