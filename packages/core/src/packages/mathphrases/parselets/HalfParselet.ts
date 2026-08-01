import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";

/**
 * `half of X` -> X / 2. Triggered on the fused `HALF_OF` token (see
 * MathPhrasesPackage.ts's `phrases` field) — once "of" is fused into the
 * trigger, nothing but X remains, so this is a plain PUSH_NUMBER + DIV,
 * no PhrasePattern/keyword-slot machinery needed at all.
 */
export const halfParselet: PrefixParselet = {
  category: "MathPhrases",
  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(BindingPower.Lowest, builder);
    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(2);
    builder.emitOpcode(OpCode.DIV);
  },
};
