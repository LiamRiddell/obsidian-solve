/**
 * Plugin System for solve-js Engine
 * 
 * This module provides a plugin architecture for extending engine functionality.
 * 
 * @module Plugins
 */

import { ParseletRegistry } from '@solve-js/parser/registry/ParseletRegistry';
import { ErrorFactory } from '@solve-js/errors/UnifiedErrorFramework';
import { sharedLexer } from '@solve-js/lexer/Lexer';
import type { LexerPlugin } from '@solve-js/lexer/ExpressionLexer';
import type { IAsyncResolver } from '@solve-js/resolvers/ResolverRegistry';
import { AsyncResultCache } from '@solve-js/cache/AsyncResultCache';

/**
 * Interface for solve-js plugins
 * 
 * @example
 * ```typescript
 * const myPlugin: SolvePlugin = {
 *   name: 'my-plugin',
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
export interface SolvePlugin {
  /** Plugin name (must be unique) */
  name: string;
  /** Plugin version (semver) */
  version: string;
  /** Plugin description (optional) */
  description?: string;

  /**
   * Domains this plugin uses for cache keys.
   * Enforced at runtime — the engine validates that cache keys
   * are within declared domains. Prevents cross-plugin cache pollution.
   * 
   * Example: ["rates", "weather.current", "weather.forecast"]
   */
  domains?: string[];

  /**
   * Optional lexer extensions to register with the engine's lexer.
   * Plugins can register custom keywords, operators, phrases, and units.
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
   * Register plugin functionality with the engine
   */
  register(registry: ParseletRegistry): void;
  
  /**
   * Optional cleanup when plugin is unregistered
   */
  unregister?(registry: ParseletRegistry): void;
}

/**
 * Package containing multiple plugins
 */
export interface PluginPackage {
  /** Package name */
  name: string;
  /** Package version */
  version: string;
  /** List of plugins in package */
  plugins: SolvePlugin[];
}

// ── Fast Package ID Generator ───────────────────────────────────────────────
// Uses Math.random() prefix + monotonic counter instead of crypto.randomUUID().
// 4-char base36 prefix (1.7M possible values) + counter. ~7 chars, ~30ns to generate.
// Collision probability < 0.003 across 100 instances in the same session.

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
  /** The plugin itself */
  plugin: SolvePlugin;
}

/**
 * Plugin manager for registering and managing plugins
 * 
 * @example
 * ```typescript
 * const pluginManager = new PluginManager(registry);
 * pluginManager.register(myPlugin);
 * pluginManager.unregister('my-plugin');
 * ```
 */
export class PluginManager {
  private plugins = new Map<string, PackageMetadata>();
  private registry: ParseletRegistry;
  /** Forward reference to the engine's ResolverRegistry (set by ExpressionEngine). */
  resolverRegistry: import('@solve-js/resolvers/ResolverRegistry').ResolverRegistry | null = null;

  constructor(registry: ParseletRegistry) {
    this.registry = registry;
  }

  /**
   * Register a plugin. Generates a packageId and validates domains.
   * 
   * @param plugin - Plugin to register
   * @throws Error if plugin name already registered
   */
  register(plugin: SolvePlugin): void {
    if (this.plugins.has(plugin.name)) {
      throw ErrorFactory.config(
        'PLUGIN_ALREADY_REGISTERED',
        `Plugin ${plugin.name} is already registered`,
        { pluginName: plugin.name }
      );
    }

    const packageId = generatePackageId();

    // Validate domains (if declared) — prevent empty/invalid domain names
    if (plugin.domains) {
      for (const domain of plugin.domains) {
        if (!domain || typeof domain !== 'string' || domain.includes(':')) {
          throw ErrorFactory.config(
            'PLUGIN_INVALID_DOMAIN',
            `Plugin ${plugin.name}: invalid domain "${domain}". Domains must be non-empty strings without colons.`,
            { pluginName: plugin.name, packageId, domain }
          );
        }
      }
    }

    // Register lexer extensions first so custom token types are
    // available when the plugin's register() call registers parselets.
    if (plugin.lexerPlugin) {
      sharedLexer.registerPlugin(plugin.lexerPlugin);
    }

    // Register async resolvers if the plugin provides them
    if (plugin.asyncResolvers && this.resolverRegistry) {
      for (const resolver of plugin.asyncResolvers) {
        this.resolverRegistry.register(resolver);
      }
    }

    try {
      plugin.register(this.registry);
      this.plugins.set(plugin.name, { id: packageId, plugin });
    } catch (error) {
      // Clean up on failure
      if (plugin.asyncResolvers && this.resolverRegistry) {
        for (const resolver of plugin.asyncResolvers) {
          this.resolverRegistry.unregister(resolver.namespace);
        }
      }
      throw ErrorFactory.config(
        'PLUGIN_REGISTRATION_FAILED',
        `Failed to register plugin ${plugin.name}: ${error}`,
        { pluginName: plugin.name, packageId, error: String(error) }
      );
    }
  }

  /**
   * Unregister a plugin
   * 
   * @param pluginName - Name of plugin to unregister
   */
  unregister(pluginName: string): void {
    const meta = this.plugins.get(pluginName);
    if (!meta) {
      throw ErrorFactory.config(
        'PLUGIN_NOT_REGISTERED',
        `Plugin ${pluginName} is not registered`,
        { pluginName }
      );
    }

    if (meta.plugin.unregister) {
      meta.plugin.unregister(this.registry);
    }

    // Unregister lexer extensions if the plugin registered any
    if (meta.plugin.lexerPlugin) {
      sharedLexer.unregisterPlugin(meta.plugin.lexerPlugin);
    }

    // Unregister async resolvers
    if (meta.plugin.asyncResolvers && this.resolverRegistry) {
      for (const resolver of meta.plugin.asyncResolvers) {
        this.resolverRegistry.unregister(resolver.namespace);
      }
    }

    // Clear all cached data for this plugin
    AsyncResultCache.clearPackage(meta.id);

    this.plugins.delete(pluginName);
  }

  /**
   * Get a plugin's metadata (includes its generated packageId).
   * Returns undefined if not registered.
   */
  getPluginMeta(pluginName: string): PackageMetadata | undefined {
    return this.plugins.get(pluginName);
  }

  /**
   * Get a plugin's generated package ID by its name.
   */
  getPackageId(pluginName: string): string | undefined {
    return this.plugins.get(pluginName)?.id;
  }

  /**
   * Get registered plugin by name
   */
  getPlugin(name: string): SolvePlugin | undefined {
    return this.plugins.get(name)?.plugin;
  }

  /**
   * Check if plugin is registered
   */
  hasPlugin(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Get all registered plugins
   */
  getPlugins(): SolvePlugin[] {
    return Array.from(this.plugins.values()).map(m => m.plugin);
  }

  /**
   * Register multiple plugins from a package
   */
  registerPackage(pkg: PluginPackage): void {
    for (const plugin of pkg.plugins) {
      this.register(plugin);
    }
  }

  /**
   * Unregister all plugins
   */
  clear(): void {
    for (const [name, meta] of this.plugins.entries()) {
      if (meta.plugin.unregister) {
        meta.plugin.unregister(this.registry);
      }
      // Unregister lexer extensions if the plugin registered any
      if (meta.plugin.lexerPlugin) {
        sharedLexer.unregisterPlugin(meta.plugin.lexerPlugin);
      }
      // Unregister async resolvers
      if (meta.plugin.asyncResolvers && this.resolverRegistry) {
        for (const resolver of meta.plugin.asyncResolvers) {
          this.resolverRegistry.unregister(resolver.namespace);
        }
      }
      // Clear all cached data for this plugin
      AsyncResultCache.clearPackage(meta.id);
      this.plugins.delete(name);
    }
  }
}

/**
 * Provider package for built-in functionality
 */
export class ProviderPackage implements SolvePlugin {
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
 * Plugin discovery system for auto-loading plugins
 */
export class PluginDiscovery {
  /**
   * Discover plugins from a directory
   * 
   * @param directoryPath - Path to directory containing plugins
   * @returns List of discovered plugins
   */
  static async discoverFromDirectory(directoryPath: string): Promise<SolvePlugin[]> {
    // In a real implementation, this would scan the directory for plugin files
    // For now, return empty array
    return [];
  }

  /**
   * Discover plugins from npm packages
   * 
   * @param packageNamePattern - Pattern to match package names
   * @returns List of discovered plugins
   */
  static async discoverFromPackages(packageNamePattern: string): Promise<SolvePlugin[]> {
    // In a real implementation, this would scan node_modules
    // For now, return empty array
    return [];
  }
}

/**
 * Plugin configuration interface
 */
export interface PluginConfig {
  name: string;
  enabled: boolean;
  settings?: Record<string, unknown>;
}

/**
 * Plugin registry for managing plugin configurations
 */
export class PluginRegistry {
  private configs = new Map<string, PluginConfig>();

  /**
   * Register plugin configuration
   */
  registerConfig(config: PluginConfig): void {
    this.configs.set(config.name, config);
  }

  /**
   * Get plugin configuration
   */
  getConfig(name: string): PluginConfig | undefined {
    return this.configs.get(name);
  }

  /**
   * Check if plugin is enabled
   */
  isEnabled(name: string): boolean {
    const config = this.configs.get(name);
    return config?.enabled ?? true;
  }

  /**
   * Enable or disable plugin
   */
  setEnabled(name: string, enabled: boolean): void {
    const config = this.configs.get(name) || { name, enabled: true };
    config.enabled = enabled;
    this.configs.set(name, config);
  }
}
