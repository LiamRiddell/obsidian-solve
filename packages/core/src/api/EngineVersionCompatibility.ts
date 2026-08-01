import { satisfies, validRange } from "semver";
import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { ENGINE_VERSION } from "@solve-js/constants/version";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";

/**
 * Engine-version package compatibility gating — the "reject a package built
 * for a different engine version" SDK surface.
 *
 * This is a DIFFERENT kind of check from `api/PackageCompatibility.ts`'s
 * `checkPackageCompatibility()`, and deliberately kept in its own module
 * rather than folded into that one. `checkPackageCompatibility()` answers
 * "do these two SIMULTANEOUSLY-registered packages' declared fields
 * collide" and its contract — pure, package-vs-package, every conflict
 * including "error" severity is advisory, the caller always just logs and
 * proceeds — is locked in by its own regression suite and stated explicitly
 * in `ExpressionEngine.registerPackage()`'s comments. This module answers a
 * different question — "can THIS package's declared engine-version range
 * run against the engine that's actually running RIGHT NOW" — and, unlike
 * every other compatibility signal in this codebase, a mismatch here is a
 * hard REJECTION, not a warning. Mixing that blocking behavior into
 * `checkPackageCompatibility()`'s report type would be a footgun for any
 * future reader who's learned (correctly, until now) that every conflict
 * that module can produce stays advisory.
 *
 * `checkEngineVersionCompatibility()` is the pure predicate (mirrors
 * `checkPackageCompatibility()`'s "return a result, caller decides" shape,
 * and this codebase's own testing convention of asserting against plain
 * result objects rather than `toThrow()` for a pure function).
 * `assertEngineVersionCompatible()` is the thin throwing wrapper both
 * `ExpressionEngine.registerPackage()` and the `PackageRegistry` singleton
 * call as the very first thing they do. See `ARCHITECTURE.md` §5.3.
 */

export type EngineVersionCheckResult =
  | { compatible: true }
  | { compatible: false; reason: "range-not-satisfied"; declaredRange: string; engineVersion: string }
  | { compatible: false; reason: "invalid-range"; declaredRange: string; engineVersion: string };

/**
 * Pure, side-effect-free. Returns `{ compatible: true }` when `pkg` declares
 * no `engineVersion` at all (no constraint = always allowed — preserves
 * every package that predates this field), when the declared range is
 * satisfied by `engineVersion`, or a `{ compatible: false, reason, ... }`
 * result otherwise. A malformed/unparseable range string (a typo in the
 * package's own descriptor) is its own distinct `"invalid-range"` reason —
 * never conflated with a genuine `"range-not-satisfied"` mismatch, so a
 * package author gets feedback about the actual problem they have.
 */
export function checkEngineVersionCompatibility(
  pkg: IEnginePackage,
  engineVersion: string = ENGINE_VERSION,
): EngineVersionCheckResult {
  if (!pkg.engineVersion) return { compatible: true };

  if (validRange(pkg.engineVersion) === null) {
    return { compatible: false, reason: "invalid-range", declaredRange: pkg.engineVersion, engineVersion };
  }

  if (!satisfies(engineVersion, pkg.engineVersion)) {
    return { compatible: false, reason: "range-not-satisfied", declaredRange: pkg.engineVersion, engineVersion };
  }

  return { compatible: true };
}

/**
 * Throws an `EngineError` (`ErrorCategory.CONFIG`, matching the existing
 * precedent for `PLUGIN_KEYWORD_COLLISION`/`PLUGIN_OPERATOR_COLLISION`/
 * `PLUGIN_UNIT_COLLISION` in `lexer/ExpressionLexer.ts` — the only other
 * place in this codebase that hard-rejects a package at registration time)
 * when `pkg` is not engine-version compatible. Does nothing when compatible.
 */
export function assertEngineVersionCompatible(
  pkg: IEnginePackage,
  engineVersion: string = ENGINE_VERSION,
): void {
  const result = checkEngineVersionCompatibility(pkg, engineVersion);
  if (result.compatible) return;

  if (result.reason === "invalid-range") {
    throw ErrorFactory.config({
      code: "PACKAGE_ENGINE_VERSION_INVALID_RANGE",
      message: `Package "${pkg.name}" declares an invalid engineVersion range: "${result.declaredRange}" is not a valid semver range.`,
      expected: `a valid semver range string (e.g. "^0.1.0", ">=0.2.0 <1.0.0")`,
      found: `"${result.declaredRange}"`,
      suggestion: `This is a range-syntax typo in "${pkg.name}"'s own descriptor, not a version mismatch with the running engine — check for a stray character.`,
      context: { packageName: pkg.name, declaredRange: result.declaredRange },
    });
  }

  throw ErrorFactory.config({
    code: "PACKAGE_ENGINE_VERSION_MISMATCH",
    message: `Package "${pkg.name}" declares engineVersion "${result.declaredRange}", which is not satisfied by the running engine version "${result.engineVersion}".`,
    expected: `an engine version satisfying "${result.declaredRange}"`,
    found: `engine version "${result.engineVersion}"`,
    suggestion: `Update "${pkg.name}" to a version built against @solve/core ${result.engineVersion}, or pin @solve/core to a version satisfying "${result.declaredRange}".`,
    context: { packageName: pkg.name, declaredRange: result.declaredRange, engineVersion: result.engineVersion },
  });
}
