/**
 * Engine-version package compatibility gating — integration coverage for
 * ExpressionEngine.registerPackage()'s use of
 * api/EngineVersionCompatibility.ts's assertEngineVersionCompatible().
 *
 * Unlike checkPackageCompatibility() (advisory, package-vs-package, never
 * blocks — see ExpressionEngine.packages.spec.ts's own
 * "per-package containment" tests for that mechanism), an incompatible
 * `engineVersion` is a hard rejection: registerPackage() throws, and it
 * throws BEFORE the duplicate-name/unregister guard runs — see
 * ARCHITECTURE.md §5.3.
 */
import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { ARITHMETIC_PACKAGE, VARIABLES_PACKAGE } from "@solve-js/packages/builtins";
import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { OpCode } from "@solve-js/parser/OpCode";

describe("ExpressionEngine.registerPackage() — engine-version gate", () => {
  test("throws PACKAGE_ENGINE_VERSION_MISMATCH for a package declaring an unsatisfiable range", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, [ARITHMETIC_PACKAGE]);
    const tooOld: IEnginePackage = { name: "TooOldPackage", engineVersion: "^99.0.0" };

    expect.assertions(1);
    try {
      engine.registerPackage(tooOld);
    } catch (e) {
      expect((e as { code?: string }).code).toBe("PACKAGE_ENGINE_VERSION_MISMATCH");
    }
  });

  test("throws PACKAGE_ENGINE_VERSION_INVALID_RANGE for a malformed range string", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, [ARITHMETIC_PACKAGE]);
    const malformed: IEnginePackage = { name: "MalformedRangePackage", engineVersion: "not-a-real-range" };

    expect.assertions(1);
    try {
      engine.registerPackage(malformed);
    } catch (e) {
      expect((e as { code?: string }).code).toBe("PACKAGE_ENGINE_VERSION_INVALID_RANGE");
    }
  });

  test("a rejected package leaves no partial state — its keyword never becomes reachable", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, [ARITHMETIC_PACKAGE]);
    const incompatible: IEnginePackage = {
      name: "IncompatibleKeywordPackage",
      engineVersion: "^99.0.0",
      lexerVocabulary: { keywords: { gadget: "GADGET_TOKEN" } },
    };

    expect(() => engine.registerPackage(incompatible)).toThrow();

    // The would-be keyword never registered — using it as a bare word is
    // treated as an undefined variable/identifier, not a recognized token,
    // proving the throw happened before any sub-registration ran.
    expect(() => engine.evaluateLine(1, "gadget")).toThrow();

    // Everything else on this engine is unaffected by the rejected attempt.
    expect(engine.evaluateLine(2, "1 + 2")[0].toNumber()).toBe(3);
  });

  test("existing packages without engineVersion keep registering fine (backward compatible default)", () => {
    const noVersionDeclared: IEnginePackage = {
      name: "NoVersionDeclaredPackage",
      pluginFunctions: [],
    };
    const engine = new ExpressionEngine("en", false, undefined, undefined, [ARITHMETIC_PACKAGE]);
    expect(() => engine.registerPackage(noVersionDeclared)).not.toThrow();
  });

  // Replacement-safety: proves the version gate runs BEFORE the
  // duplicate-name guard/unregisterPackage() step, so re-registering an
  // incompatible "upgrade" for an already-working package never tears down
  // the working original first.
  test("replacement safety: rejecting an incompatible re-registration leaves the original, working package untouched", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, [ARITHMETIC_PACKAGE]);
    const working: IEnginePackage = {
      name: "ReplaceableStablePackage",
      lexerVocabulary: { keywords: { stableword: "STABLE_TOKEN" } },
      prefixParselets: [
        {
          tokenType: "STABLE_TOKEN",
          parselet: {
            category: "Test",
            parse(_parser, _token, builder) {
              builder.emitOpcode(OpCode.PUSH_NUMBER);
              builder.emitNumber(42);
            },
          } as any,
        },
      ],
    };

    engine.registerPackage(working);
    expect(engine.evaluateLine(1, "stableword")[0].toNumber()).toBe(42);

    const incompatibleReplacement: IEnginePackage = {
      name: "ReplaceableStablePackage",
      engineVersion: "^99.0.0",
    };

    expect(() => engine.registerPackage(incompatibleReplacement)).toThrow();

    // The original registration is still fully intact -- it was never
    // unregistered, because the version gate rejected the replacement
    // before the duplicate-name guard ever ran.
    expect(engine.evaluateLine(2, "stableword")[0].toNumber()).toBe(42);
  });

  test("PACKAGE_ENGINE_VERSION_MISMATCH is thrown for a range requiring a NEWER engine than what's running (opposite direction)", () => {
    const engine = new ExpressionEngine("en", false, undefined, undefined, [ARITHMETIC_PACKAGE]);
    const tooNew: IEnginePackage = { name: "TooNewPackage", engineVersion: "^999.0.0" };

    expect.assertions(1);
    try {
      engine.registerPackage(tooNew);
    } catch (e) {
      expect((e as { code?: string }).code).toBe("PACKAGE_ENGINE_VERSION_MISMATCH");
    }
  });

  test("engine construction still succeeds normally when no built-in declares engineVersion", () => {
    // Sanity check that BUILTIN_PACKAGES-based construction is completely
    // unaffected by this feature (none of them declare the field).
    expect(() => new ExpressionEngine("en", false, undefined, undefined, [
      ARITHMETIC_PACKAGE,
      VARIABLES_PACKAGE,
    ])).not.toThrow();
  });
});
