import { describe, expect, test } from "@jest/globals";
import {
  checkEngineVersionCompatibility,
  assertEngineVersionCompatible,
} from "@solve-js/api/EngineVersionCompatibility";
import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { BUILTIN_PACKAGES } from "@solve-js/packages/builtins";
import { EngineError } from "@solve-js/errors/UnifiedErrorFramework";

describe("checkEngineVersionCompatibility", () => {
  test("no declared engineVersion -> compatible (no constraint = always allowed)", () => {
    const pkg: IEnginePackage = { name: "pkg-a" };
    expect(checkEngineVersionCompatibility(pkg, "0.1.0")).toEqual({ compatible: true });
  });

  test("declared range satisfied by the running engine -> compatible", () => {
    const pkg: IEnginePackage = { name: "pkg-a", engineVersion: "^0.1.0" };
    expect(checkEngineVersionCompatibility(pkg, "0.1.5")).toEqual({ compatible: true });
  });

  test("engine has moved PAST the package's declared range -> range-not-satisfied", () => {
    const pkg: IEnginePackage = { name: "pkg-a", engineVersion: "^0.1.0" };
    expect(checkEngineVersionCompatibility(pkg, "0.3.0")).toEqual({
      compatible: false,
      reason: "range-not-satisfied",
      declaredRange: "^0.1.0",
      engineVersion: "0.3.0",
    });
  });

  test("package requires a NEWER engine than what's running -> range-not-satisfied (opposite direction)", () => {
    const pkg: IEnginePackage = { name: "pkg-a", engineVersion: "^0.5.0" };
    expect(checkEngineVersionCompatibility(pkg, "0.1.0")).toEqual({
      compatible: false,
      reason: "range-not-satisfied",
      declaredRange: "^0.5.0",
      engineVersion: "0.1.0",
    });
  });

  test("boundary: exactly at the caret range's floor is compatible", () => {
    const pkg: IEnginePackage = { name: "pkg-a", engineVersion: "^0.1.0" };
    expect(checkEngineVersionCompatibility(pkg, "0.1.0").compatible).toBe(true);
  });

  test("boundary: one minor above a 0.x caret range's floor is NOT compatible (node-semver's documented 0.x behavior)", () => {
    const pkg: IEnginePackage = { name: "pkg-a", engineVersion: "^0.1.0" };
    expect(checkEngineVersionCompatibility(pkg, "0.2.0").compatible).toBe(false);
  });

  test("malformed/unparseable range string -> invalid-range, distinct from a real mismatch", () => {
    const pkg: IEnginePackage = { name: "pkg-a", engineVersion: "not-a-semver-range" };
    const result = checkEngineVersionCompatibility(pkg, "0.1.0");
    expect(result).toEqual({
      compatible: false,
      reason: "invalid-range",
      declaredRange: "not-a-semver-range",
      engineVersion: "0.1.0",
    });
  });

  test("defaults engineVersion param to the real, running ENGINE_VERSION when omitted", () => {
    const pkg: IEnginePackage = { name: "pkg-a" };
    // No constraint declared, so this is compatible regardless of what the
    // real ENGINE_VERSION happens to be -- just proves the call doesn't throw.
    expect(checkEngineVersionCompatibility(pkg).compatible).toBe(true);
  });

  // Regression guard against the REAL shipped package set -- if a built-in
  // package ever accidentally gained an engineVersion the shipping engine
  // doesn't satisfy, this test catches it immediately.
  test("every BUILTIN_PACKAGES entry is engine-version-compatible with the real ENGINE_VERSION", () => {
    for (const pkg of BUILTIN_PACKAGES) {
      expect(checkEngineVersionCompatibility(pkg).compatible).toBe(true);
    }
  });
});

describe("assertEngineVersionCompatible", () => {
  test("does not throw when compatible", () => {
    const pkg: IEnginePackage = { name: "pkg-a", engineVersion: "^0.1.0" };
    expect(() => assertEngineVersionCompatible(pkg, "0.1.5")).not.toThrow();
  });

  test("does not throw when no engineVersion is declared", () => {
    const pkg: IEnginePackage = { name: "pkg-a" };
    expect(() => assertEngineVersionCompatible(pkg, "0.1.0")).not.toThrow();
  });

  test("throws EngineError with code PACKAGE_ENGINE_VERSION_MISMATCH for an unsatisfied range", () => {
    const pkg: IEnginePackage = { name: "pkg-a", engineVersion: "^0.1.0" };
    let thrown: unknown;
    try {
      assertEngineVersionCompatible(pkg, "0.3.0");
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(EngineError);
    expect((thrown as EngineError).code).toBe("PACKAGE_ENGINE_VERSION_MISMATCH");
    expect((thrown as EngineError).message).toContain("pkg-a");
    expect((thrown as EngineError).message).toContain("^0.1.0");
    expect((thrown as EngineError).message).toContain("0.3.0");
  });

  test("throws EngineError with code PACKAGE_ENGINE_VERSION_INVALID_RANGE for a malformed range", () => {
    const pkg: IEnginePackage = { name: "pkg-a", engineVersion: "garbage" };
    let thrown: unknown;
    try {
      assertEngineVersionCompatible(pkg, "0.1.0");
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(EngineError);
    expect((thrown as EngineError).code).toBe("PACKAGE_ENGINE_VERSION_INVALID_RANGE");
  });

  test("the two error codes are distinct (mismatch vs invalid-range are never confused)", () => {
    let mismatchCode: string | undefined;
    let invalidRangeCode: string | undefined;
    try {
      assertEngineVersionCompatible({ name: "pkg-a", engineVersion: "^99.0.0" }, "0.1.0");
    } catch (e) {
      mismatchCode = (e as EngineError).code;
    }
    try {
      assertEngineVersionCompatible({ name: "pkg-b", engineVersion: "not valid" }, "0.1.0");
    } catch (e) {
      invalidRangeCode = (e as EngineError).code;
    }
    expect(mismatchCode).toBe("PACKAGE_ENGINE_VERSION_MISMATCH");
    expect(invalidRangeCode).toBe("PACKAGE_ENGINE_VERSION_INVALID_RANGE");
    expect(mismatchCode).not.toBe(invalidRangeCode);
  });
});
