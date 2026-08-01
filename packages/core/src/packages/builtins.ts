/**
 * Built-in packages.
 *
 * Each domain is a self-contained package (its own directory, its own
 * `{Domain}Package.ts` defining an IEnginePackage, its own `index.ts`
 * barrel) — the same shape as third-party packages such as the OSRS
 * example in `src/solve-js/examples/osrs/`. This file's only job is to
 * assemble them into BUILTIN_PACKAGES; it re-exports each named package
 * too, since existing call sites import them directly from here.
 *
 * This enables:
 * - Selective disable of built-in packages
 * - External packages to replace/extend built-in ones
 */
import type { IEnginePackage } from "@solve-js/api/PackageRegistry";

import { ARITHMETIC_PACKAGE } from "./arithmetic";
import { PERCENTAGE_PACKAGE } from "./percentage";
import { FUNCTION_PACKAGE } from "./function";
import { DATETIME_PACKAGE } from "./datetime";
import { DICE_PACKAGE } from "./dice";
import { VARIABLES_PACKAGE } from "./variables";
import { UOM_PACKAGE } from "./uom";
import { CURRENCY_PACKAGE } from "./currency";
import { VECTOR_PACKAGE } from "./vector";
import { BIGINT_PACKAGE } from "./biginteger";

export {
  ARITHMETIC_PACKAGE,
  PERCENTAGE_PACKAGE,
  FUNCTION_PACKAGE,
  DATETIME_PACKAGE,
  DICE_PACKAGE,
  VARIABLES_PACKAGE,
  UOM_PACKAGE,
  CURRENCY_PACKAGE,
  VECTOR_PACKAGE,
  BIGINT_PACKAGE,
};

// ── All built-in packages (registration order matters: arithmetic first) ──
// Note: OSRS is NOT a built-in package — it's a full worked example of
// writing a package with the framework (lexer plugin, async resolver, VM
// handler), kept in src/solve-js/examples/osrs/ rather than shipped as
// part of the engine. See ExpressionEngine's `packages` constructor
// parameter to register it (or any other package) alongside these.
export const BUILTIN_PACKAGES: IEnginePackage[] = [
  ARITHMETIC_PACKAGE,
  PERCENTAGE_PACKAGE,
  FUNCTION_PACKAGE,
  DATETIME_PACKAGE,
  DICE_PACKAGE,
  VARIABLES_PACKAGE,
  UOM_PACKAGE,
  CURRENCY_PACKAGE,
  VECTOR_PACKAGE,
  BIGINT_PACKAGE,
];
