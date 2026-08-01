import { PrefixParselet } from "@solve-js/parser/Parselet";
import { definePhrasePattern } from "@solve-js/parser/PhrasePattern";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";

/**
 * `random number between X and Y` — a phrase-form alias of the existing
 * `roll(X, Y)` builtin (CALL_BUILTIN index 37, see VMBuiltins.ts):
 * "random number" is deliberately NOT a distinct random-generation
 * primitive, it's the same random-integer-in-range logic under a
 * different, more calculator-natural name.
 *
 * Triggered on the `RANDOM_NUMBER` token, fused from the literal two-word
 * phrase "random number" by `MathPhrasesPackage.ts`'s `phrases` field —
 * needed because "random" alone is already a zero-arg `FUNC` keyword
 * (`random()` -> `Math.random()`); fusing the full phrase up front avoids
 * that token ever reaching prefix dispatch as a bare `FUNC` in this
 * context.
 */
export const randomNumberParselet: PrefixParselet = definePhrasePattern({
  category: "MathPhrases",
  alternatives: [
    {
      slots: [
        { kind: "keyword", tokenTypes: ["BETWEEN"] },
        { kind: "expr", bindingPower: BindingPower.Product },
        { kind: "keyword", tokenTypes: ["PLUS"] },
        { kind: "expr" },
      ],
      emit: (builder) => {
        builder.emitOpcode(OpCode.CALL_BUILTIN);
        builder.emitIndex(37); // roll(from, to)
        builder.emitIndex(2);
      },
    },
  ],
});
