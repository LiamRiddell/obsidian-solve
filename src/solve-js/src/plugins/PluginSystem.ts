/**
 * Plugin System for solve-js Engine
 * 
 * This module provides a plugin architecture for extending engine functionality.
 * 
 * @module Plugins
 */

import { ParseletRegistry } from '@solve-js/parser/registry/ParseletRegistry';
import { ErrorFactory } from '@solve-js/errors/UnifiedErrorFramework';

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
  private plugins = new Map<string, SolvePlugin>();
  private registry: ParseletRegistry;

  constructor(registry: ParseletRegistry) {
    this.registry = registry;
  }

  /**
   * Register a plugin
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

    try {
      plugin.register(this.registry);
      this.plugins.set(plugin.name, plugin);
    } catch (error) {
      throw ErrorFactory.config(
        'PLUGIN_REGISTRATION_FAILED',
        `Failed to register plugin ${plugin.name}: ${error}`,
        { pluginName: plugin.name, error: String(error) }
      );
    }
  }

  /**
   * Unregister a plugin
   * 
   * @param pluginName - Name of plugin to unregister
   */
  unregister(pluginName: string): void {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw ErrorFactory.config(
        'PLUGIN_NOT_REGISTERED',
        `Plugin ${pluginName} is not registered`,
        { pluginName }
      );
    }

    if (plugin.unregister) {
      plugin.unregister(this.registry);
    }

    this.plugins.delete(pluginName);
  }

  /**
   * Get registered plugin by name
   */
  getPlugin(name: string): SolvePlugin | undefined {
    return this.plugins.get(name);
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
    return Array.from(this.plugins.values());
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
    for (const [name, plugin] of this.plugins.entries()) {
      if (plugin.unregister) {
        plugin.unregister(this.registry);
      }
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
