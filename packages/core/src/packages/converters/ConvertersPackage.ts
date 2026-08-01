import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { AsConverterParselet } from "./parselets/AsConverterParselet";

/**
 * The general `<expr> as <type>` conversion/display mechanism — one
 * unifying grammar point rather than N unrelated per-type features.
 *
 * Ships the built-in set immediately usable (see `BUILTIN_CONVERTERS` in
 * `AsConverterParselet.ts`): `as %`/`as percent`, `as decimal`/`as dec`/
 * `as number`, `as fraction`, `as multiplier`, `as sci`, `as hex`/
 * `as binary`/`as octal`.
 *
 * This is also the other clearly SDK-shaped piece from the SoulverCore
 * feature-parity work (alongside `PhrasePattern`/`createQueryResolver`):
 * `IEnginePackage.asConverters` (see `api/PackageRegistry.ts`) lets a
 * third-party package contribute its own `as <name>` target without
 * touching this package at all — resolved at VM-execution time via
 * `OpCode.CALL_AS_CONVERTER` against `vm/VMBuiltins.ts`'s
 * `asConverterRegistry`.
 *
 * SCOPE DECISION: no `as x` alias for `as multiplier` — "x" is too likely
 * to collide with ordinary variable names (algebraic use, `x = 5`) to
 * justify claiming it as a global keyword for one converter's sake.
 */
export const CONVERTERS_PACKAGE: IEnginePackage = {
  name: "solve-converters",
  infixParselets: [
    { tokenType: "AS", parselet: new AsConverterParselet() },
  ],
};
