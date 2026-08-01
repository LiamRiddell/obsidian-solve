// Public entry point — the "start here" surface for consuming the engine.
// Deeper/specific needs are covered by each module's own barrel:
// @solve-js/vm, @solve-js/parser, @solve-js/language, @solve-js/format,
// @solve-js/packages, @solve-js/constants (all public), plus the
// advanced-public escape hatches (@solve-js/lexer, @solve-js/normalizer,
// @solve-js/variables, @solve-js/resolvers, @solve-js/errors,
// @solve-js/utilities, @solve-js/uom) for authoring custom packages.

export { PackageRegistry, packageRegistry } from "./PackageRegistry";
export type { IPackageRegistry, IEnginePackage } from "./PackageRegistry";

export { checkPackageCompatibility } from "./PackageCompatibility";
export type {
  CompatibilityReport,
  CompatibilityConflict,
  CompatibilityConflictKind,
  CompatibilitySeverity,
} from "./PackageCompatibility";

export { checkEngineVersionCompatibility, assertEngineVersionCompatible } from "./EngineVersionCompatibility";
export type { EngineVersionCheckResult } from "./EngineVersionCompatibility";

export { ExpressionEngine } from "@solve-js/engine";
export type { LineEvaluation, EvalResults } from "@solve-js/engine";

export { ENGINE_VERSION } from "@solve-js/constants/version";
