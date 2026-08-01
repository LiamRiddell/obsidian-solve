import type { NormalizerRule, NormalizerMatch } from "@solve-js/normalizer/NormalizerRule";
import { tokenTypeId } from "@solve-js/lexer/Token";

/**
 * `$500/workday` -> implicitly `$500 / 1 workday`, by inserting a synthetic
 * `NUMBER "1"` token between the `/` and a bare `workday`/`workdays` UNIT
 * token.
 *
 * WHY THIS IS NEEDED: a bare unit word with no preceding number (e.g. the
 * "workday" in "$500/workday") does NOT parse as `Uom(1, "workday")` in
 * this codebase today — `UNIT` tokens in PREFIX position (i.e. not
 * immediately preceded by a number) are claimed by VariablesPackage's
 * `IdentifierParselet`, which treats a bare unit word as a variable
 * lookup (`LOAD_VAR "workday"`), not an implicit-1 UoM literal. This is a
 * PRE-EXISTING gap in the codebase, not something new to workdays — there
 * is no general "$X/unit" bare-denominator Rate literal anywhere yet
 * (confirmed: no existing test or parselet constructs a Rate this way).
 *
 * SCOPE DECISION: this rule deliberately fixes ONLY `/workday` and
 * `/workdays` — the exact syntax this task's "$500/workday x 4 weeks"
 * example needs — rather than generalizing to "$X/<any unit>". A fully
 * general bare-unit-denominator fix is a separate, broader change (it
 * would need to touch the shared `UNIT`-in-prefix-position dispatch that
 * every package relies on) and is out of scope here.
 *
 * Runs as a normalizer rule (not a phrase, since `phrases` fuses on WORD
 * text and "/" is a symbol token) that recognizes `SLASH` immediately
 * followed by a `UNIT` token whose text is "workday"/"workdays", and
 * REPLACES those 2 tokens with 3 (`SLASH`, a synthetic `NUMBER "1"`, the
 * original `UNIT` token unchanged) — `NormalizerMatch.replacement` is
 * explicitly allowed to be longer than `consumed` tokens (see
 * `NormalizerRule.ts`'s doc comment: "expansion/splitting"). By the time
 * the parser runs, "$500/workday" and "$500/1 workday" are indistinguishable
 * token streams, so no parser/VM change is needed at all — the existing
 * `DIV` -> `RATE_DIV`-equivalent construction path
 * (`vm/VM.ts`'s `OpCode.DIV` case) handles it exactly like any other
 * explicit "$X / N unit" Rate literal.
 */
export function workdayRateDenominatorNormalizerRule(priority = 70): NormalizerRule {
  return {
    name: "datetime:workday-rate-denominator",
    priority,
    match(tokens, pos): NormalizerMatch | null {
      const slash = tokens[pos];
      if (slash.type !== "SLASH") return null;

      const unit = tokens[pos + 1];
      if (!unit || unit.type !== "UNIT") return null;
      if (unit.value !== "workday" && unit.value !== "workdays") return null;

      // A synthetic NUMBER "1" token, positioned/spanned at the unit
      // token's own source location (there's no real source span for a
      // number that was never actually typed) — mirrors
      // normalizer/TokenNormalizer.ts's createFusedToken() for how a
      // synthesized token's offset/line/col are derived from an existing
      // one, just without consuming that token in the process (this rule
      // EXPANDS 2 tokens into 3, it doesn't fuse them into fewer).
      const syntheticOne = {
        ...unit,
        type: "NUMBER",
        typeId: tokenTypeId("NUMBER"),
        value: "1",
        text: "1",
      };

      return {
        consumed: 2,
        replacement: [slash, syntheticOne, unit],
        ruleName: "datetime:workday-rate-denominator",
      };
    },
  };
}
