/**
 * tokenRegistration.ts — Bootstrap for building TokenLookup from locale, units, and phrases.
 *
 * This module centralizes the assembly of the TokenLookup consumed by ExpressionLexer.
 * It merges:
 *   1. Locale keywords (from ILocale.keywordMap)
 *   2. Built-in phrase patterns (to the power of, increase by, etc.)
 *   3. Known unit names (from units.ts)
 *
 * The resulting TokenLookup is frozen and passed to ExpressionLexer.configuredLookup
 * at construction time, enabling data-driven keyword/unit/phrase resolution.
 */
import { TokenClassRegistry } from '@solve-js/lexer/TokenClassRegistry';
import type { TokenLookup } from '@solve-js/lexer/TokenClassRegistry';
import { getLocale, type ILocale } from '@solve-js/constants/locales';
import { knownUnits } from '@solve-js/lexer/units';

// ── Built-in phrase map ───────────────────────────────────────────────────
// These are the multi-word expressions handled as compound tokens.
// Matched by the PhraseMatcher (trie-based) in ExpressionLexer.tryMatchPhrase().
const BUILTIN_PHRASES: Record<string, string> = {
  'to the power of': 'CARET',
  'power of': 'CARET',
  'increase by': 'INCREASE_BY',
  'decrease by': 'DECREASE_BY',
  'times by': 'TIMES_BY',
  'multiply by': 'MULTIPLY_BY',
  'divide by': 'DIVIDE_BY',
};

/**
 * Build a TokenLookup from locale keywords, known units, and built-in phrases.
 *
 * Merge order (later overrides earlier):
 *   1. Locale keywords (priority 0 — lowest, can be overridden by providers)
 *   2. Built-in phrases (via locale phraseMap)
 *   3. Known units (checked AFTER keyword lookup fails, via unitNames set)
 *
 * The resulting TokenLookup replaces the internal keyword map, unit set,
 * phrase trie, and phraseStartWords in ExpressionLexer when set via
 * ExpressionLexer.configuredLookup.
 *
 * @param localeCode - The locale code (e.g., "en", "de"). Defaults to "en".
 * @returns A frozen TokenLookup ready for consumption by the lexer.
 */
export function buildTokenLookup(localeCode = 'en'): TokenLookup {
  const locale: ILocale = getLocale(localeCode);
  const registry = new TokenClassRegistry();

  // Layer 1: Locale keywords (priority 0 — lowest)
  registry.setLocale(locale.keywordMap, BUILTIN_PHRASES);

  // Layer 2: Known units (checked after keyword lookup)
  registry.setUnits(knownUnits);

  // Build and return the lookup
  return registry.build();
}
