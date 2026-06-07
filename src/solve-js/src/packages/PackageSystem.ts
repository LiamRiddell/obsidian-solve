/**
 * Package System for solve-js Engine
 * 
 * This module provides a package architecture for extending engine functionality.
 * 
 * @module Packages
 */

import { ParseletRegistry } from '@solve-js/parser/registry/ParseletRegistry';
import { ErrorFactory } from '@solve-js/errors/UnifiedErrorFramework';
import { sharedLexer } from '@solve-js/lexer/Lexer';
import type { LexerPlugin } from '@solve-js/lexer/ExpressionLexer';
import type { IAsyncResolver } from '@solve-js/resolvers/ResolverRegistry';

/**
 * Interface for solve-js packages
 * 
 * @example
 * ```typescript
 * const myPackage: SolvePackage = {
 *   name: 'my-package',
 *   version: '1.0.0',
 *   register(registry) {
 *     // Register custom parselets
 *   },
 *   unregister(registry) {
 *     // Clean up if needed
 *   }
 * };
 * ```
 */
export interface SolvePackage {
  /** Package name (must be unique) */
  name: string;
  /** Package version (semver) */
  version: string;
  /** Package description (optional) */
  description?: string;

  /**
   * Domains this package uses for cache keys.
   * Enforced at runtime — the engine validates that cache keys
   * are within declared domains. Prevents cross-package cache pollution.
   * 
   * Example: ["rates", "weather.current", "weather.forecast"]
   */
  domains?: string[];

  /**
   * Optional lexer extensions to register with the engine's lexer.
   * Packages can register custom keywords, operators, phrases, and units.
   * These are registered before `register()` is called so parselets
   * can depend on the custom token types being available.
   */
  lexerPlugin?: LexerPlugin;

  /**
   * Optional async resolvers for data that needs to be fetched.
   * The engine calls preflight() before VM execution for each resolver
   * and returns Pending if data is not yet cached.
   */
  asyncResolvers?: IAsyncResolver[];
  
  /**
   * Register package functionality with the engine
   */
  register(registry: ParseletRegistry): void;
  
  /**
   * Optional cleanup when package is unregistered
   */
  unregister?(registry: ParseletRegistry): void;
}

/**
 * @deprecated Use {@link SolvePackage} instead.
 */
export type SolvePlugin = SolvePackage;

/**
 * Package bundle containing multiple packages
 */
export interface PackageBundle {
  /** Bundle name */
  name: string;
  /** Bundle version */
  version: string;
  /** List of packages in bundle */
  packages: SolvePackage[];
}

/**
 * @deprecated Use {@link PackageBundle} instead.
 */
export type PluginPackage = PackageBundle;

// ── Fast Package ID Generator ───────────────────────────────────────────────

class PackageIdGenerator {
  private prefix = ((Math.random() * 0xFFFFFF) | 0).toString(36).padStart(4, '0');
  private counter = 0;

  next(): string { return `${this.prefix}${this.counter++}`; }
}

const idGen = new PackageIdGenerator();

/** Generate a fast unique package ID. ~6-7 chars, non-crypto, low collision rate. */
export function generatePackageId(): string {
  return idGen.next();
}

/** Wrapper holding a package's runtime metadata (not exposed to package code). */
export interface PackageMetadata {
  /** Fast unique ID generated at registration time */
  id: string;
  /** The package itself */
  package: SolvePackage;
}

/**
 * Package manager for registering and managing packages
 * 
 * @example
 * ```typescript
 * const packageManager = new PackageManager(registry);
 * packageManager.register(myPackage);
 * packageManager.unregister('my-package');
 * ```
 */
export class PackageManager {
  private packages = new Map<string, PackageMetadata>();
  private registry: ParseletRegistry;
  /** Forward reference to the engine's ResolverRegistry (set by ExpressionEngine). */
  resolverRegistry: import('@solve-js/resolvers/ResolverRegistry').ResolverRegistry | null = null;

  constructor(registry: ParseletRegistry) {
    this.registry = registry;
  }

  /**
   * Register a package. Generates a packageId and validates domains.
   * 
   * @param pkg - Package to register
   * @throws Error if package name already registered
   */
  register(pkg: SolvePackage): void {
    if (this.packages.has(pkg.name)) {
      throw ErrorFactory.config(
        'PACKAGE_ALREADY_REGISTERED',
        `Package ${pkg.name} is already registered`,
        { packageName: pkg.name }
      );
    }

    const packageId = generatePackageId();

    // Validate domains (if declared)
    if (pkg.domains) {
      for (const domain of pkg.domains) {
        if (!domain || typeof domain !== 'string' || domain.includes(':')) {
          throw ErrorFactory.config(
            'PACKAGE_INVALID_DOMAIN',
            `Package ${pkg.name}: invalid domain "${domain}". Domains must be non-empty strings without colons.`,
            { packageName: pkg.name, packageId, domain }
          );
        }
      }
    }

    // Register lexer extensions first
    if (pkg.lexerPlugin) {
      sharedLexer.registerPlugin(pkg.lexerPlugin);
    }

    // Register async resolvers if the package provides them
    if (pkg.asyncResolvers && this.resolverRegistry) {
      for (const resolver of pkg.asyncResolvers) {
        this.resolverRegistry.register(resolver);
      }
    }

    try {
      pkg.register(this.registry);
      this.packages.set(pkg.name, { id: packageId, package: pkg });
    } catch (error) {
      // Clean up on failure
      if (pkg.asyncResolvers && this.resolverRegistry) {
        for (const resolver of pkg.asyncResolvers) {
          this.resolverRegistry.unregister(resolver.namespace);
        }
      }
      throw ErrorFactory.config(
        'PACKAGE_REGISTRATION_FAILED',
        `Failed to register package ${pkg.name}: ${error}`,
        { packageName: pkg.name, packageId, error: String(error) }
      );
    }
  }

  unregister(packageName: string): void {
    const meta = this.packages.get(packageName);
    if (!meta) {
      throw ErrorFactory.config(
        'PACKAGE_NOT_REGISTERED',
        `Package ${packageName} is not registered`,
        { packageName }
      );
    }

    if (meta.package.unregister) {
      meta.package.unregister(this.registry);
    }

    if (meta.package.lexerPlugin) {
      sharedLexer.unregisterPlugin(meta.package.lexerPlugin);
    }

    if (meta.package.asyncResolvers && this.resolverRegistry) {
      for (const resolver of meta.package.asyncResolvers) {
        this.resolverRegistry.unregister(resolver.namespace);
      }
    }

    // Cache cleared by ResolverRegistry.unregister() via removeQueries()
    this.packages.delete(packageName);
  }

  getPackageMeta(packageName: string): PackageMetadata | undefined {
    return this.packages.get(packageName);
  }

  getPackageId(packageName: string): string | undefined {
    return this.packages.get(packageName)?.id;
  }

  getPackage(name: string): SolvePackage | undefined {
    return this.packages.get(name)?.package;
  }

  hasPackage(name: string): boolean {
    return this.packages.has(name);
  }

  getPackages(): SolvePackage[] {
    return Array.from(this.packages.values()).map(m => m.package);
  }

  registerBundle(bundle: PackageBundle): void {
    for (const pkg of bundle.packages) {
      this.register(pkg);
    }
  }

  /** @deprecated Use {@link registerBundle} instead. */
  registerPackage(pkg: PackageBundle): void {
    this.registerBundle(pkg);
  }

  clear(): void {
    for (const [name, meta] of this.packages.entries()) {
      if (meta.package.unregister) {
        meta.package.unregister(this.registry);
      }
      if (meta.package.lexerPlugin) {
        sharedLexer.unregisterPlugin(meta.package.lexerPlugin);
      }
      if (meta.package.asyncResolvers && this.resolverRegistry) {
        for (const resolver of meta.package.asyncResolvers) {
          this.resolverRegistry.unregister(resolver.namespace);
        }
      }
      // Cache cleared by ResolverRegistry.unregister() via removeQueries()
      this.packages.delete(name);
    }
  }
}

// ── Deprecated aliases for backward compatibility ──────────────────────────

/**
 * @deprecated Use {@link PackageManager} instead.
 */
export const PluginManager = PackageManager;

/**
 * Provider package for built-in functionality
 */
export class ProviderPackage implements SolvePackage {
  constructor(
    public name: string,
    public version: string,
    public description?: string,
    private registrationFn?: (registry: ParseletRegistry) => void
  ) {}

  register(registry: ParseletRegistry): void {
    if (this.registrationFn) {
      this.registrationFn(registry);
    }
  }

  unregister?(registry: ParseletRegistry): void {
    // Optional cleanup logic
  }
}

/**
 * Package discovery system for auto-loading packages
 */
export class PackageDiscovery {
  /**
   * @deprecated Not yet implemented.
   */
  static async discoverFromDirectory(directoryPath: string): Promise<SolvePackage[]> {
    return [];
  }

  /**
   * @deprecated Not yet implemented.
   */
  static async discoverFromPackages(packageNamePattern: string): Promise<SolvePackage[]> {
    return [];
  }
}

/** @deprecated Use {@link PackageDiscovery} instead. */
export const PluginDiscovery = PackageDiscovery;

/**
 * Package configuration interface
 */
export interface PackageConfig {
  name: string;
  enabled: boolean;
  settings?: Record<string, unknown>;
}

/**
 * Package registry for managing package configurations
 */
export class PackageRegistry {
  private configs = new Map<string, PackageConfig>();

  registerConfig(config: PackageConfig): void {
    this.configs.set(config.name, config);
  }

  getConfig(name: string): PackageConfig | undefined {
    return this.configs.get(name);
  }

  isEnabled(name: string): boolean {
    const config = this.configs.get(name);
    return config?.enabled ?? true;
  }

  setEnabled(name: string, enabled: boolean): void {
    const config = this.configs.get(name) || { name, enabled: true };
    config.enabled = enabled;
    this.configs.set(name, config);
  }
}

/** @deprecated Use {@link PackageRegistry} instead. */
export const PluginRegistry = PackageRegistry;
