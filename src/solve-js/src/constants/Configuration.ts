/**
 * Configuration Module for solve-js Engine
 * 
 * This module provides centralized configuration management with validation.
 * 
 * @module Configuration
 */

/**
 * Date-related configuration
 */
export interface DateConfig {
  /** Default offset in days for date calculations */
  readonly defaultOffsetDays: number;
  /** Maximum allowed offset in years (positive) */
  readonly maxOffsetYears: number;
  /** Maximum allowed offset in years (negative) */
  readonly minOffsetYears: number;
  /** Default date format for display */
  readonly defaultFormat: string;
}

/**
 * Dice-related configuration
 */
export interface DiceConfig {
  /** Default number of sides on a die */
  readonly defaultSides: number;
  /** Maximum allowed sides */
  readonly maxSides: number;
  /** Maximum number of dice per roll */
  readonly maxDice: number;
  /** Default number of dice */
  readonly defaultDice: number;
}

/**
 * Performance-related configuration
 */
export interface PerformanceConfig {
  /** Default cache size (number of entries) */
  readonly defaultCacheSize: number;
  /** Maximum document lines to process */
  readonly maxDocumentLines: number;
  /** Parse timeout in milliseconds */
  readonly parseTimeoutMs: number;
  /** Execution timeout in milliseconds */
  readonly executionTimeoutMs: number;
}

/**
 * Validation-related configuration
 */
export interface ValidationConfig {
  /** Maximum expression length in characters */
  readonly maxExpressionLength: number;
  /** Maximum expression complexity score */
  readonly maxComplexity: number;
  /** Maximum nesting depth for parentheses */
  readonly maxNestingDepth: number;
}

/**
 * Worker-related configuration
 */
export interface WorkerConfig {
  /** Maximum concurrent workers */
  readonly maxConcurrentWorkers: number;
  /** Worker idle timeout in milliseconds */
  readonly idleTimeoutMs: number;
  /** Maximum retry attempts for failed operations */
  readonly maxRetries: number;
  /** Base backoff delay in milliseconds */
  readonly baseBackoffMs: number;
}

/**
 * Complete engine configuration
 */
export interface EngineConfig {
  readonly date: DateConfig;
  readonly dice: DiceConfig;
  readonly performance: PerformanceConfig;
  readonly validation: ValidationConfig;
  readonly worker: WorkerConfig;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: EngineConfig = {
  date: {
    defaultOffsetDays: 0,
    maxOffsetYears: 100,
    minOffsetYears: -100,
    defaultFormat: 'YYYY-MM-DD'
  },
  dice: {
    defaultSides: 6,
    maxSides: 1000,
    maxDice: 100,
    defaultDice: 1
  },
  performance: {
    defaultCacheSize: 1000,
    maxDocumentLines: 10000,
    parseTimeoutMs: 5000,
    executionTimeoutMs: 10000
  },
  validation: {
    maxExpressionLength: 1000,
    maxComplexity: 100,
    maxNestingDepth: 10
  },
  worker: {
    maxConcurrentWorkers: 4,
    idleTimeoutMs: 30000,
    maxRetries: 3,
    baseBackoffMs: 1000
  }
};

/**
 * Configuration manager for engine settings
 * 
 * @example
 * ```typescript
 * const configManager = new ConfigManager();
 * configManager.set('performance.defaultCacheSize', 2000);
 * const cacheSize = configManager.get('performance.defaultCacheSize');
 * ```
 */
export class ConfigManager {
  private config: EngineConfig;

  constructor(config: Partial<EngineConfig> = {}) {
    this.config = this.mergeConfig(DEFAULT_CONFIG, config);
  }

  /**
   * Get configuration value by path
   * 
   * @param path - Dot-notation path to config value
   * @returns Configuration value
   */
  get<T>(path: string): T {
    const keys = path.split('.');
    let current: unknown = this.config;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = (current as Record<string, unknown>)[key];
      } else {
        throw new Error(`Configuration path not found: ${path}`);
      }
    }

    return current as T;
  }

  /**
   * Set configuration value by path
   * 
   * @param path - Dot-notation path to config value
   * @param value - New value
   */
  set<T>(path: string, value: T): void {
    const keys = path.split('.');
    if (keys.length < 2) {
      throw new Error(`Invalid path: ${path}. Must be in format 'section.property'`);
    }
    
    const section = keys[0];
    const property = keys[1];
    
    if (!(section in this.config)) {
      throw new Error(`Configuration section not found: ${section}`);
    }
    
    const sectionConfig = this.config[section as keyof EngineConfig];
    if (sectionConfig && typeof sectionConfig === 'object') {
      (sectionConfig as any)[property] = value;
    } else {
      throw new Error(`Configuration property not found: ${path}`);
    }
  }

  /**
   * Get complete configuration
   */
  getConfig(): EngineConfig {
    return { ...this.config };
  }

  /**
   * Update multiple configuration values
   */
  update(config: Partial<EngineConfig>): void {
    this.config = this.mergeConfig(this.config, config);
  }

  /**
   * Reset to default configuration
   */
  reset(): void {
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * Validate configuration values
   */
  validate(): ValidationResult {
    const errors: string[] = [];

    // Validate performance config
    if (this.config.performance.maxDocumentLines > 100000) {
      errors.push('maxDocumentLines cannot exceed 100,000');
    }

    // Validate date config
    if (this.config.date.maxOffsetYears > 1000) {
      errors.push('maxOffsetYears cannot exceed 1000');
    }

    // Validate dice config
    if (this.config.dice.maxSides > 10000) {
      errors.push('maxSides cannot exceed 10,000');
    }

    return {
      valid: errors.length === 0,
      error: errors.join('; '),
      warnings: []
    };
  }

  private mergeConfig(
    base: EngineConfig,
    override: Partial<EngineConfig>
  ): EngineConfig {
    return {
      date: { ...base.date, ...override.date },
      dice: { ...base.dice, ...override.dice },
      performance: { ...base.performance, ...override.performance },
      validation: { ...base.validation, ...override.validation },
      worker: { ...base.worker, ...override.worker }
    };
  }
}

/**
 * Result type for validation
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
}
