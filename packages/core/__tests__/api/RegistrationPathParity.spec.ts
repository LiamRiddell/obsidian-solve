/**
 * Regression guard for the "two parallel registration paths per package"
 * bug class found this session: a package's real `IEnginePackage`
 * descriptor (`{Domain}Package.ts`) drifting out of sync with a
 * hand-written, isolated-test-harness registration helper — confirmed to
 * have happened for real, silently, in shipped code for FOUR packages
 * (currency, finance, uom, variables) before this was caught.
 *
 * The fix was structural, not a detection layer bolted on top: all 15
 * hand-written `register{Domain}Parselets(registry)` functions were
 * deleted and replaced with one generic `registerPackageForTesting(pkg,
 * registry)` (`tools/testUtils.ts`) that reads a package's own
 * `prefixParselets`/`infixParselets` arrays directly — there is now only
 * ONE source of truth, so this specific drift is structurally impossible.
 *
 * This test guards the two ways that fix could be silently undone:
 * 1. A future package could reintroduce a bespoke, hand-written
 *    `register*Parselets` function instead of using the shared helper —
 *    caught by scanning every `parselets/index.ts` file for that exact
 *    shape and failing if one exists.
 * 2. `registerPackageForTesting` itself could regress into NOT actually
 *    registering everything a package declares — caught by registering
 *    every built-in package through it and diffing the resulting
 *    registry's token types against the package's own declared arrays.
 */
import { describe, expect, test } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { registerPackageForTesting } from "@tools/testUtils";
import {
  ARITHMETIC_PACKAGE, PERCENTAGE_PACKAGE, FUNCTION_PACKAGE, DATETIME_PACKAGE,
  TIME_PACKAGE, DICE_PACKAGE, VARIABLES_PACKAGE, UOM_PACKAGE, CURRENCY_PACKAGE,
  VECTOR_PACKAGE, BIGINT_PACKAGE, CONDITIONALS_PACKAGE, CONVERTERS_PACKAGE,
  MATHPHRASES_PACKAGE, FINANCE_PACKAGE, WEATHER_PACKAGE,
} from "@solve-js/packages";

const ALL_PACKAGES = [
  ARITHMETIC_PACKAGE, PERCENTAGE_PACKAGE, FUNCTION_PACKAGE, DATETIME_PACKAGE,
  TIME_PACKAGE, DICE_PACKAGE, VARIABLES_PACKAGE, UOM_PACKAGE, CURRENCY_PACKAGE,
  VECTOR_PACKAGE, BIGINT_PACKAGE, CONDITIONALS_PACKAGE, CONVERTERS_PACKAGE,
  MATHPHRASES_PACKAGE, FINANCE_PACKAGE, WEATHER_PACKAGE,
];

describe("registerPackageForTesting parity — no drift between a package's real descriptor and its test-registration path", () => {
  for (const pkg of ALL_PACKAGES) {
    test(`${pkg.name}: registerPackageForTesting registers every declared prefix/infix token type, nothing more, nothing less`, () => {
      const registry = new ParseletRegistry();
      registerPackageForTesting(pkg, registry);

      const registeredPrefix = new Set(registry.getAllPrefix().map((p) => p.tokenType));
      const registeredInfix = new Set(registry.getAllInfix().map((p) => p.tokenType));

      const declaredPrefix = new Set((pkg.prefixParselets ?? []).map((p) => p.tokenType));
      const declaredInfix = new Set((pkg.infixParselets ?? []).map((p) => p.tokenType));

      expect(registeredPrefix).toEqual(declaredPrefix);
      expect(registeredInfix).toEqual(declaredInfix);
    });
  }
});

describe("no package may reintroduce a bespoke hand-written register*Parselets function", () => {
  test("every packages/*/parselets/index.ts is registration-helper-free", () => {
    const packagesDir = path.resolve(__dirname, "../../src/packages");
    const packageDirs = fs.readdirSync(packagesDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    const offenders: string[] = [];
    for (const dir of packageDirs) {
      const indexPath = path.join(packagesDir, dir, "parselets", "index.ts");
      if (!fs.existsSync(indexPath)) continue;
      const content = fs.readFileSync(indexPath, "utf8");
      if (/export function register\w+Parselets\(/.test(content)) {
        offenders.push(indexPath);
      }
    }

    expect(offenders).toEqual([]);
  });
});
