import type { Token } from "@solve-js/lexer/Token";
import type { NormalizerRule, NormalizerMatch } from "@solve-js/normalizer/NormalizerRule";
import { DATETIME_LITERAL_TYPE } from "./DateLiteralNormalizerRule";

/**
 * Unwraps `[[<date>]]` — Obsidian's own wikilink syntax, as produced by
 * plugins like Natural Language Dates when inserting a link to a daily
 * note (e.g. `[[2024-01-15]]`) — into the bare date literal inside, so
 * `[[2024-01-15]] + 5 days` works exactly like `2024-01-15 + 5 days`.
 * See GitHub issue #67.
 *
 * Deliberately narrow: only fires when the bracket-wrapped content is
 * ALREADY a fused `DATETIME_LITERAL` token (see
 * `DateLiteralNormalizerRule.ts` — DD/MM/YYYY, ISO, US, and dotted
 * formats all fuse to this one token type before this rule ever runs,
 * priority 80 running after that rule's own priority-80 pass converges
 * across the normalizer's multi-pass loop). `[...]`/`[[...]]` have no
 * other meaning ANYWHERE in this grammar today (confirmed — no parselet
 * is registered for `LBRACKET` at all), so this claims no existing
 * behavior; it does NOT unwrap arbitrary bracketed content (a page title,
 * a non-date word, ...), only a bracket pair immediately around a real
 * date, which is the one shape Obsidian's daily-note links actually
 * produce.
 */
export function dailyNoteLinkNormalizerRule(): NormalizerRule {
  return {
    name: "datetime:daily-note-link",
    priority: 80,
    match(tokens: Token[], pos: number): NormalizerMatch | null {
      if (tokens[pos]?.type !== "LBRACKET") return null;
      if (tokens[pos + 1]?.type !== "LBRACKET") return null;
      if (tokens[pos + 2]?.type !== DATETIME_LITERAL_TYPE) return null;
      if (tokens[pos + 3]?.type !== "RBRACKET") return null;
      if (tokens[pos + 4]?.type !== "RBRACKET") return null;
      return {
        consumed: 5,
        replacement: [tokens[pos + 2]],
        ruleName: "datetime:daily-note-link",
      };
    },
  };
}
