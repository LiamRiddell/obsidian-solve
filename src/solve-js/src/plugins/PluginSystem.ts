/**
 * @deprecated Use {@link @solve-js/packages/PackageSystem} instead.
 * This file is a re-export shim for backward compatibility.
 */
export {
  PackageManager as PluginManager,
  ProviderPackage,
  PackageRegistry as PluginRegistry,
  PackageDiscovery as PluginDiscovery,
  generatePackageId,
  type SolvePackage as SolvePlugin,
  type PackageBundle as PluginPackage,
  type PackageMetadata,
  type PackageConfig as PluginConfig,
} from "@solve-js/packages/PackageSystem";
