//#region 📦 Module Overview
/**
 * Normalizer module — public API surface.
 *
 * The token normalizer sits between the lexer and the parser. It transforms
 * linear token streams to handle multi-token patterns that the lexer cannot
 * resolve because they span multiple tokens:
 *
 * - **Phrase fusion** — merges adjacent tokens (e.g., `"Net"` + `"Profit"`)
 *   into a single compound identifier so the parser sees one reference.
 * - **Implicit multiplication** — inserts `*` operators between tokens that
 *   imply multiplication (e.g., `2x` → `2 * x`, `5(3)` → `5 * (3)`).
 * - **Domain-specific merging** — packages can register custom rules
 *   via `NormalizerRule` to handle domain-specific token patterns.
 *
 * Each rule implements a `match()` function that inspects the token stream
 * at a given index and either returns a `NormalizerMatch` (describing which
 * tokens to replace and with what) or `null` (no match at this position).
 *
 * @example
 * ```typescript
 * import { TokenNormalizer, implicitMultiplyRule, BUILTIN_PHRASES } from "./index";
 *
 * const normalizer = new TokenNormalizer();
 * // Register phrases into the PhraseTrie (single-pass O(depth) matching)
 * for (const [phrase, tokenType] of Object.entries(BUILTIN_PHRASES)) {
 *   normalizer.addPhrase(phrase, tokenType);
 * }
 * // Register non-phrase rules with trie-backed phrase guard
 * normalizer.register(implicitMultiplyRule(
 *   50,
 *   (word) => normalizer.canStartPhrase(word),
 * ));
 * const fused = normalizer.normalize(tokens);
 * ```
 */
//#endregion

//#region Exports — Normalizer implementation
export { TokenNormalizer } from "./TokenNormalizer";
export type { NormalizerOptions } from "./TokenNormalizer";
export { createFusedToken } from "./TokenNormalizer";
export { PhraseTrie } from "./PhraseTrie";
//#endregion

//#region Exports — Rule types and interfaces
export type { NormalizerRule, NormalizerMatch, TokenFusion } from "./NormalizerRule";
//#endregion

//#region Exports — Built-in rules
export {
  createBuiltinNormalizerRules,
  implicitMultiplyRule,
  BUILTIN_PHRASES,
} from "./BuiltinNormalizerRules";
//#endregion
