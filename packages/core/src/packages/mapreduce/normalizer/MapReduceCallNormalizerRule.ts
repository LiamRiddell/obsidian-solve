import type { Token } from "@solve-js/lexer/Token";
import { tokenTypeId } from "@solve-js/lexer/Token";
import { LexerToken } from "@solve-js/lexer/ExpressionLexer";
import type { NormalizerRule, NormalizerMatch } from "@solve-js/normalizer/NormalizerRule";

const WORD_TO_TOKEN_TYPE: Record<string, string> = {
  map: "MAP",
  reduce: "REDUCE",
  sum: "SUM_FN",
  prod: "PROD_FN",
};

/**
 * Whether the token at this position looks like it's about to become (or
 * already is) a `LINE_REF` — i.e. this "sum(" is actually
 * `packages/lines/`'s own cross-line `sum(line 1 : line 4)` aggregate
 * call, not this package's `sum(elementExpr, collection)`. Mirrors
 * `packages/lines/normalizer/LineRefNormalizerRule.ts`'s own glued/spaced
 * matching exactly, so both rules agree on what counts as a line
 * reference without one importing the other.
 */
function looksLikeLineRef(token: Token | undefined, next: Token | undefined): boolean {
  if (!token) return false;
  if (token.type === "LINE_REF") return true;
  if (token.type === "IDENT") {
    if (/^line\d+$/i.test(token.value)) return true;
    if (/^line$/i.test(token.value) && next?.type === "NUMBER" && /^\d+$/.test(next.value)) return true;
  }
  return false;
}

/**
 * Fuses `map(`/`reduce(`/`sum(`/`prod(` — but ONLY when the bare word is
 * IMMEDIATELY followed by `LPAREN` — into their own dedicated token
 * types. Mirrors `packages/lines/normalizer/LineRefNormalizerRule.ts`'s
 * `rangeCallNormalizerRule()` (same "conditional-on-LPAREN" pattern), so
 * `:map = [...]` / `:reduce = ...` / `:sum = 100` / `:prod = 1` all keep
 * working as ordinary variable names when NOT immediately called.
 *
 * `sum(` specifically declines to match (the {@link looksLikeLineRef}
 * guard) when its own arguments look like the lines package's
 * `sum(line 1 : line 4)` cross-line aggregate — a genuine trigger-shape
 * collision between two independently-shipped features (both packages
 * pick "sum(" as their trigger). Declining here (returning `null`) lets
 * the normalizer try `rangeCallNormalizerRule` at the same position next
 * — that composition works regardless of the two rules' relative
 * priority, since the normalizer tries every registered rule at a
 * position, in priority order, until one matches.
 */
export function mapReduceCallNormalizerRule(priority = 80): NormalizerRule {
  return {
    name: "mapreduce:call",
    priority,
    match(tokens: Token[], pos: number): NormalizerMatch | null {
      const token = tokens[pos];
      if (!token || token.type !== "IDENT") return null;
      const word = token.value.toLowerCase();
      const tokenType = WORD_TO_TOKEN_TYPE[word];
      if (!tokenType) return null;
      if (tokens[pos + 1]?.type !== "LPAREN") return null;
      if (word === "sum" && looksLikeLineRef(tokens[pos + 2], tokens[pos + 3])) return null;

      return {
        consumed: 1,
        replacement: [
          new LexerToken(tokenType, tokenTypeId(tokenType), token.value, token.value, token.offset, 0, token.line, token.col),
        ],
        ruleName: "mapreduce:call",
      };
    },
  };
}
