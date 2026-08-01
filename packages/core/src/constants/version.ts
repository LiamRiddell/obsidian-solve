/**
 * The running engine's own semver version — sourced directly from this
 * package's package.json so it can never drift from what's actually
 * published. Exists so IEnginePackage.engineVersion range checks
 * (api/EngineVersionCompatibility.ts) have something real to check
 * against.
 */
import { version } from "../../package.json";

export const ENGINE_VERSION: string = version;
