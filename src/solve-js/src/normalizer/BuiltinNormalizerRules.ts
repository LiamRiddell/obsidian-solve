/**
 * Built-in normalization rules for the TokenNormalizer.
 */

import type { Token } from "@solve-js/lexer/Token";
import { tokenTypeId } from "@solve-js/lexer/Token";
import { LexerToken } from "@solve-js/lexer/ExpressionLexer";
import type { NormalizerRule, NormalizerMatch } from "./NormalizerRule";
import { createFusedToken } from "./TokenNormalizer";

export function phraseFusionRule(
  phrase: string,
  tokenType: string,
  priority: number = 100
): NormalizerRule {
  const words = phrase.split(" ");
  const wordCount = words.length;
  const lowerWords = words.map(w => w.toLowerCase());

  return {
    name: `phrase:${phrase}`,
    priority,
    match(tokens: Token[], pos: number): NormalizerMatch | null {
      // Match phrase word-by-word. Words must be consecutive in the token stream.
      // The lexer resolves keywords like "times"→STAR, "by"→OF, so we match
      // by token value (case-insensitive) rather than type.
      if (pos + wordCount > tokens.length) return null;

      let tokenIdx = pos;
      for (let wordIdx = 0; wordIdx < wordCount; wordIdx++) {
        const t = tokens[tokenIdx];
        if (t.value.toLowerCase() !== lowerWords[wordIdx]) return null;
        tokenIdx++;
      }

      const matchedTokens = tokens.slice(pos, pos + wordCount);
      const fused = createFusedToken(tokenType, phrase, matchedTokens);
      return { consumed: wordCount, replacement: [fused] };
    },
  };
}

/** Words that can start multi-word phrases. Implicit multiply should not fire
 *  when the following identifier starts a phrase, to avoid splitting phrases
 *  like "2 to the power of 3" or "2 power of 3" into separate tokens.
 *  Also prevents implicit multiply from breaking increase/decrease syntax:
 *  "increase 100 by 20%" must stay intact for the IncreaseDecreaseParselet. */
const PHRASE_START_WORDS = new Set([
  "to", "power", "increase", "decrease", "times", "multiply", "divide", "by",
]);

export function implicitMultiplyRule(priority: number = 50): NormalizerRule {
  return {
    name: "implicit:multiply",
    priority,
    match(tokens: Token[], pos: number): NormalizerMatch | null {
      if (pos + 1 >= tokens.length) return null;

      const t = tokens[pos];
      const next = tokens[pos + 1];

      // Don't fire if the next identifier starts a multi-word phrase
      // (e.g., "2 power of 3" should become "2 ^ 3", not "2 * power of 3")
      const nextValue = next.value.toLowerCase();
      if (PHRASE_START_WORDS.has(nextValue)) return null;

      const triggers =
        (t.type === "NUMBER" || t.type === "RPAREN") &&
        (next.type === "IDENT" || next.type === "LPAREN" || next.type === "PI" || next.type === "E");

      if (!triggers) return null;

      const starToken = new LexerToken(
        "STAR", tokenTypeId("STAR"), "*", "*",
        next.offset, 0, next.line, next.col,
      );

      return { consumed: 1, replacement: [t, starToken] };
    },
  };
}

export function createBuiltinNormalizerRules(): NormalizerRule[] {
  return [
    phraseFusionRule("to the power of", "CARET"),
    phraseFusionRule("power of", "CARET"),
    phraseFusionRule("increase by", "INCREASE_BY"),
    phraseFusionRule("decrease by", "DECREASE_BY"),
    phraseFusionRule("times by", "TIMES_BY"),
    phraseFusionRule("multiply by", "MULTIPLY_BY"),
    phraseFusionRule("divide by", "DIVIDE_BY"),
    implicitMultiplyRule(),
  ];
}
