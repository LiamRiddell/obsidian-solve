import { InfixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";

const PROPORTION_BUILTIN_INDEX = 46;

/**
 * `A is to B as C is to what` — a unit-aware proportion, e.g.
 * `5 km is to 500m as 5 cm is to what` -> `0.5cm` (see VMBuiltins.ts index
 * 46 for the unifyUom-based ratio math).
 *
 * Triggered on the `IS_TO` token, fused from the literal two-word phrase
 * "is to" by `MathPhrasesPackage.ts`'s `phrases` field ("is" alone isn't a
 * keyword anywhere else, so this fusion can't collide with anything).
 * "what" is matched by raw token text rather than a dedicated keyword —
 * it's meaningful only in this one terminal position, so claiming a new
 * global keyword for it isn't worth the collision risk with a variable
 * literally named "what".
 *
 * Both `B` and `C` are parsed at `this.bindingPower` (not `Lowest`) so
 * that parsing `C` stops right before the SECOND "is to" instead of
 * recursing into this same parselet again — the standard Pratt rule that
 * a same-precedence infix operator doesn't get consumed by an inner
 * `parseExpression()` call at that same minimum binding power (verified
 * empirically for `AS` in ConvertersParselets.spec.ts's `(800 to 1000) as
 * decimal` composition test).
 */
export class ProportionParselet implements InfixParselet {
  readonly category = "MathPhrases";
  readonly bindingPower = BindingPower.Conditional;

  parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(this.bindingPower, builder); // B
    parser.consume("AS");
    parser.parseExpression(this.bindingPower, builder); // C
    parser.consume("IS_TO");

    const whatToken = parser.consume();
    if (!whatToken || whatToken.value.toLowerCase() !== "what") {
      throw ErrorFactory.parsing(
        "PROPORTION_EXPECTED_WHAT",
        `Expected "what" but got ${whatToken ? `"${whatToken.value}"` : "end of input"}`,
      );
    }

    builder.emitOpcode(OpCode.CALL_BUILTIN);
    builder.emitIndex(PROPORTION_BUILTIN_INDEX);
    builder.emitIndex(3);
  }
}
