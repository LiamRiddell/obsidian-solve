import type { IEnginePackage } from "@solve-js/api/PackageRegistry";

/**
 * Package load-time compatibility checking — the "detect overlapping
 * logic between packages" SDK surface.
 *
 * This engine's package system (`IEnginePackage`) has always had SOME
 * collision visibility, but it's inconsistent and scattered: `ParseletRegistry`
 * warns on a token-type overwrite, `asConverterRegistry` warns on a converter
 * name overwrite, and `PhraseTrie` warns on... nothing at all — a second
 * package fusing the exact same multi-word phrase to a different token type
 * silently wins with zero signal, the same class of gap
 * `ParseletRegistry.registerPrefix()`'s collision-visibility fix closed for
 * parselets specifically (see `ARCHITECTURE.md`'s punch list). And none of
 * these existing checks can be run BEFORE registration — they only fire at
 * the moment a collision actually happens, deep inside a live engine.
 *
 * `checkPackageCompatibility()` is a single, pure, side-effect-free function
 * that statically compares one candidate package's declared descriptor
 * against a list of already-registered packages' descriptors, across every
 * collision-capable field `IEnginePackage` has — callable standalone (a host
 * building a plugin marketplace could run it before ever constructing an
 * engine) or wired into registration itself (see
 * `ExpressionEngine.registerPackage()`, which calls this automatically and
 * logs every conflict found — the "load-up resiliency" half of this
 * mechanism).
 *
 * A real, concrete motivating bug (found the same session this module was
 * built): the currency package's real `IEnginePackage` descriptor
 * (`CurrencyPackage.ts`) and its parallel test-harness registration helper
 * (`parselets/index.ts`'s `registerCurrencyParselets()`) drifted out of sync
 * — new currency-symbol token types were wired into one but not the other,
 * caught only by a test happening to exercise the stale path. This module
 * doesn't catch THAT specific class of bug (two hand-written registration
 * functions for the same logical package diverging is a source-consistency
 * problem, not a runtime collision), but it DOES catch the more common and
 * more dangerous sibling: two DIFFERENT, independently-authored packages
 * unknowingly claiming the same token type, phrase, converter name, plugin
 * function index, or lexer keyword.
 */

/** How serious a detected conflict is. */
export type CompatibilitySeverity = "error" | "warning" | "info";

/** The category of overlap detected between two packages. */
export type CompatibilityConflictKind =
  | "prefixParseletTokenType"
  | "infixParseletTokenType"
  | "phrase"
  | "converterName"
  | "pluginFunctionIndex"
  | "lexerKeyword"
  | "lexerOperator"
  | "asyncResolverNamespace"
  | "tokenCategory";

export interface CompatibilityConflict {
  kind: CompatibilityConflictKind;
  severity: CompatibilitySeverity;
  /** Human-readable description, safe to log directly. */
  detail: string;
  /** The two package names involved — [existing, candidate]. */
  packages: [string, string];
}

export interface CompatibilityReport {
  /** `false` iff at least one "error"-severity conflict was found. */
  compatible: boolean;
  conflicts: CompatibilityConflict[];
}

function collectParseletConflicts(
  kind: "prefixParseletTokenType" | "infixParseletTokenType",
  fieldName: "prefixParselets" | "infixParselets",
  existingPkg: IEnginePackage,
  candidate: IEnginePackage,
  out: CompatibilityConflict[],
): void {
  const existingEntries = existingPkg[fieldName];
  const candidateEntries = candidate[fieldName];
  if (!existingEntries || !candidateEntries) return;
  const existingTypes = new Set(existingEntries.map((e) => e.tokenType));
  for (const entry of candidateEntries) {
    if (existingTypes.has(entry.tokenType)) {
      out.push({
        kind,
        // A different parselet INSTANCE silently wins at registration time
        // (matches ParseletRegistry.registerPrefix/registerInfix's own
        // "warn on a genuinely different instance, stay quiet on idempotent
        // re-registration" behavior) — flagged as a warning, not an error,
        // since deliberate override is sometimes the intended use (a
        // package explicitly built to replace a built-in's grammar).
        severity: "warning",
        detail: `Both "${existingPkg.name}" and "${candidate.name}" register a ${fieldName === "prefixParselets" ? "prefix" : "infix"} parselet for token type "${entry.tokenType}" — the later-registered one silently wins.`,
        packages: [existingPkg.name, candidate.name],
      });
    }
  }
}

function checkOnePackagePair(existingPkg: IEnginePackage, candidate: IEnginePackage): CompatibilityConflict[] {
  const conflicts: CompatibilityConflict[] = [];

  collectParseletConflicts("prefixParseletTokenType", "prefixParselets", existingPkg, candidate, conflicts);
  collectParseletConflicts("infixParseletTokenType", "infixParselets", existingPkg, candidate, conflicts);

  // Phrases — the ONE category with zero pre-existing runtime warning
  // anywhere (PhraseTrie silently overwrites on an exact-key collision).
  if (existingPkg.phrases && candidate.phrases) {
    for (const [phrase, tokenType] of Object.entries(candidate.phrases)) {
      const existingTokenType = existingPkg.phrases[phrase];
      if (existingTokenType !== undefined && existingTokenType !== tokenType) {
        conflicts.push({
          kind: "phrase",
          severity: "warning",
          detail: `Both "${existingPkg.name}" (-> "${existingTokenType}") and "${candidate.name}" (-> "${tokenType}") fuse the phrase "${phrase}" to DIFFERENT token types — PhraseTrie has no collision detection of its own, so the later-registered mapping silently wins with no other signal.`,
          packages: [existingPkg.name, candidate.name],
        });
      }
    }
  }

  // asConverters — mirrors registerAsConverter()'s own runtime warning, but
  // callable before either package is ever registered.
  if (existingPkg.asConverters && candidate.asConverters) {
    for (const name of Object.keys(candidate.asConverters)) {
      const key = name.toLowerCase();
      if (Object.keys(existingPkg.asConverters).some((n) => n.toLowerCase() === key)) {
        conflicts.push({
          kind: "converterName",
          severity: "warning",
          detail: `Both "${existingPkg.name}" and "${candidate.name}" register an "as ${name}" converter — the later-registered handler silently wins.`,
          packages: [existingPkg.name, candidate.name],
        });
      }
    }
  }

  // pluginFunctions — index collisions are ALWAYS a real bug (unlike
  // parselet/converter overrides, there's no legitimate "intentional
  // replacement" use case for two packages sharing a CALL_PLUGIN index;
  // allocatePluginFunctionIndex() exists specifically to make this
  // unreachable when used correctly, so a collision here means one side
  // hardcoded a number instead). This is the exact bug class that hit
  // THREE separate parallel background agents in one session before
  // this checker existed.
  if (existingPkg.pluginFunctions && candidate.pluginFunctions) {
    const existingIndices = new Set(existingPkg.pluginFunctions.map((f) => f.index));
    for (const fn of candidate.pluginFunctions) {
      if (existingIndices.has(fn.index)) {
        conflicts.push({
          kind: "pluginFunctionIndex",
          severity: "error",
          detail: `Both "${existingPkg.name}" and "${candidate.name}" register a pluginFunctions handler at index ${fn.index} — one of them almost certainly hardcoded this index instead of calling allocatePluginFunctionIndex(). Whichever registers second silently overwrites the first's handler in pluginFunctionRegistry.`,
          packages: [existingPkg.name, candidate.name],
        });
      }
    }
  }

  // Lexer keywords/operators — a word/symbol can only mean ONE token type.
  // `units` is deliberately NOT checked here: units live in a Set, and two
  // packages both recognizing the same unit WORD is harmless/idempotent
  // (there's no "which token type wins" ambiguity the way there is for a
  // keyword->tokenType or operator->tokenType mapping).
  const existingVocab = existingPkg.lexerVocabulary;
  const candidateVocab = candidate.lexerVocabulary;
  if (existingVocab?.keywords && candidateVocab?.keywords) {
    for (const [word, tokenType] of Object.entries(candidateVocab.keywords)) {
      const existingTokenType = existingVocab.keywords[word];
      if (existingTokenType !== undefined && existingTokenType !== tokenType) {
        conflicts.push({
          kind: "lexerKeyword",
          severity: "error",
          detail: `Both "${existingPkg.name}" (-> "${existingTokenType}") and "${candidate.name}" (-> "${tokenType}") register the lexer keyword "${word}" for DIFFERENT token types — whichever package registers second wins, and the loser's grammar becomes silently unreachable for that word.`,
          packages: [existingPkg.name, candidate.name],
        });
      }
    }
  }
  if (existingVocab?.operators && candidateVocab?.operators) {
    for (const [op, tokenType] of Object.entries(candidateVocab.operators)) {
      const existingTokenType = existingVocab.operators[op];
      if (existingTokenType !== undefined && existingTokenType !== tokenType) {
        conflicts.push({
          kind: "lexerOperator",
          severity: "error",
          detail: `Both "${existingPkg.name}" (-> "${existingTokenType}") and "${candidate.name}" (-> "${tokenType}") register the lexer operator "${op}" for DIFFERENT token types.`,
          packages: [existingPkg.name, candidate.name],
        });
      }
    }
  }

  // Async resolver namespaces — ResolverRegistry is keyed by namespace;
  // the JSDoc on IEnginePackage.asyncResolvers already states "each
  // resolver must have a unique namespace" as a hard requirement.
  if (existingPkg.asyncResolvers && candidate.asyncResolvers) {
    const existingNamespaces = new Set(existingPkg.asyncResolvers.map((r) => r.namespace));
    for (const resolver of candidate.asyncResolvers) {
      if (existingNamespaces.has(resolver.namespace)) {
        conflicts.push({
          kind: "asyncResolverNamespace",
          severity: "error",
          detail: `Both "${existingPkg.name}" and "${candidate.name}" register an async resolver under the namespace "${resolver.namespace}" — ResolverRegistry is keyed by namespace, so one resolver's cache/preflight state will silently clobber the other's.`,
          packages: [existingPkg.name, candidate.name],
        });
      }
    }
  }

  // Token categories — same token type, different highlight category.
  // Cosmetic only (doesn't break parsing/evaluation), so "info" not
  // "warning"/"error" — but still worth surfacing, since a silently-wrong
  // highlight color is exactly the kind of thing that's invisible until a
  // user notices their editor coloring looks off.
  if (existingPkg.tokenCategories && candidate.tokenCategories) {
    for (const [tokenType, category] of Object.entries(candidate.tokenCategories)) {
      const existingCategory = existingPkg.tokenCategories[tokenType];
      if (existingCategory !== undefined && existingCategory !== category) {
        conflicts.push({
          kind: "tokenCategory",
          severity: "info",
          detail: `Both "${existingPkg.name}" (-> "${existingCategory}") and "${candidate.name}" (-> "${category}") declare a highlight category for token type "${tokenType}" — cosmetic only, but the later registration wins.`,
          packages: [existingPkg.name, candidate.name],
        });
      }
    }
  }

  return conflicts;
}

/**
 * Statically check `candidate` against every package in `existing` for
 * overlapping/conflicting declarations, across every collision-capable
 * field `IEnginePackage` has. Pure and side-effect-free — does not touch
 * any shared registry, does not require a live `ExpressionEngine`.
 *
 * @example
 * ```ts
 * const report = checkPackageCompatibility(myNewPackage, BUILTIN_PACKAGES);
 * if (!report.compatible) {
 *   for (const c of report.conflicts) console.error(c.detail);
 * }
 * ```
 */
export function checkPackageCompatibility(
  candidate: IEnginePackage,
  existing: IEnginePackage[],
): CompatibilityReport {
  const conflicts: CompatibilityConflict[] = [];
  for (const existingPkg of existing) {
    if (existingPkg === candidate || existingPkg.name === candidate.name) continue;
    conflicts.push(...checkOnePackagePair(existingPkg, candidate));
  }
  return {
    compatible: !conflicts.some((c) => c.severity === "error"),
    conflicts,
  };
}
