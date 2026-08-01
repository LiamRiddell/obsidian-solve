import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { VariadicAggregateParselet } from "./parselets/VariadicAggregateParselet";
import { largerSmallerParselet } from "./parselets/LargerSmallerParselet";
import { halfParselet } from "./parselets/HalfParselet";
import { midpointParselet } from "./parselets/MidpointParselet";
import { randomNumberParselet } from "./parselets/RandomNumberParselet";
import { ClampParselet } from "./parselets/ClampParselet";
import { ProportionParselet } from "./parselets/ProportionParselet";

// CALL_BUILTIN indices — see VMBuiltins.ts for the handler implementations.
const AVERAGE = 42, MEDIAN = 43, TOTAL = 44, COUNT = 45;
const MIN = 9, MAX = 10;

/**
 * Phrase-grammar math functions: `average/median/total/count of X, Y, Z`,
 * `larger/smaller of X and Y`, `half of X`, `midpoint between X and Y`,
 * `random number between X and Y`, `clamp X between Y and Z`, and the
 * unit-aware proportion form `A is to B as C is to what`.
 *
 * TRIGGER-WORD COLLISION DESIGN NOTE (real regression found and fixed
 * during development): "average", "total", "count", "larger", "smaller",
 * "half", and "midpoint" are all common, natural variable names (a
 * shipped playground example uses `:total = :afterDiscount + :tax`).
 * This codebase has a tested, intentional policy that a colon-prefixed
 * variable name can't be a keyword-shaped word (see VariableParselet.ts's
 * doc comment and its "reserved-keyword regression" test) — so claiming
 * any of those as a BARE global keyword would have permanently broken
 * `:total = ...`-style usage, which is exactly what happened on the first
 * pass of this package.
 *
 * The fix: fuse the full two-word phrase ("average of", "total of",
 * "half of", "midpoint between", ...) into its own token via the
 * `phrases` field below, instead of claiming the leading word alone. The
 * bare word then never becomes its own token type — it stays a plain
 * IDENT (usable as a variable) unless immediately followed by its
 * qualifying keyword. `clamp` is the one exception, kept as a bare
 * keyword: "clamp X between Y and Z" has the value X sitting between the
 * trigger and "between"/"from", so the two words aren't adjacent and
 * can't be phrase-fused — same accepted risk profile as this codebase's
 * existing bare "between"/"from"/"next"/"last"/"best" keywords.
 *
 * Most of the fused-trigger parselets are hand-written rather than built
 * on `PhrasePattern`, for a related reason: once the leading keyword is
 * fused away into the trigger token itself, the next thing in each
 * grammar is an `expr` (the value), not a keyword — `definePhrasePattern`
 * requires every alternative to start with a keyword slot. See
 * `ClampParselet.ts`'s doc comment for the same structural point.
 * `random number between X and Y` and `A is to B as C is to what` are the
 * two exceptions that still have a genuine keyword after their own fused
 * trigger ("between"/"as"), so `RandomNumberParselet` stays
 * PhrasePattern-based.
 */
export const MATHPHRASES_PACKAGE: IEnginePackage = {
  name: "solve-mathphrases",
  phrases: {
    "average of": "AVERAGE_OF",
    "median of": "MEDIAN_OF",
    "total of": "TOTAL_OF",
    "count of": "COUNT_OF",
    "larger of": "LARGER_OF",
    "smaller of": "SMALLER_OF",
    "half of": "HALF_OF",
    "midpoint between": "MIDPOINT_BETWEEN",
    "random number": "RANDOM_NUMBER",
    "is to": "IS_TO",
  },
  prefixParselets: [
    { tokenType: "AVERAGE_OF", parselet: new VariadicAggregateParselet(AVERAGE) },
    { tokenType: "MEDIAN_OF", parselet: new VariadicAggregateParselet(MEDIAN) },
    { tokenType: "TOTAL_OF", parselet: new VariadicAggregateParselet(TOTAL) },
    { tokenType: "COUNT_OF", parselet: new VariadicAggregateParselet(COUNT) },
    { tokenType: "LARGER_OF", parselet: largerSmallerParselet(MAX) },
    { tokenType: "SMALLER_OF", parselet: largerSmallerParselet(MIN) },
    { tokenType: "HALF_OF", parselet: halfParselet },
    { tokenType: "MIDPOINT_BETWEEN", parselet: midpointParselet },
    { tokenType: "RANDOM_NUMBER", parselet: randomNumberParselet },
    { tokenType: "CLAMP", parselet: new ClampParselet() },
  ],
  infixParselets: [
    { tokenType: "IS_TO", parselet: new ProportionParselet() },
  ],
};
