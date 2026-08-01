/**
 * Configuration Module for solve-js Engine
 * 
 * This module provides the **single source of truth** for all engine configuration.
 * Every configurable aspect of the engine — from safety limits and performance
 * budgets to VM constraints and worker pool sizing — is defined here.
 * 
 * ### Design principles
 * 
 * 1. **Engine owns its config.** The engine defines its own config shape and defaults.
 *    Consumers (e.g., the Obsidian plugin) pass partial overrides; all unspecified
 *    fields fall back to `DEFAULT_CONFIG`.
 * 
 * 2. **Self-documenting.** Every interface and field has descriptive JSDoc so the
 *    config is understandable at a glance, whether you're using the engine as an
 *    npm package or reading the source.
 * 
 * 3. **Minimal consumer knowledge.** Consumers only need to pass `Partial<EngineConfig>`.
 *    They don't need to replicate the full config shape — just the fields they
 *    want to override.
 * 
 * @module Configuration
 */

import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";

/**
 * Date-related configuration.
 * Controls the bounds and formatting for date/time expression evaluation
 * (e.g., `today + 20 days`, `last monday`).
 */
export interface DateConfig {
  /** Default offset in days for relative date calculations when no offset is specified */
  readonly defaultOffsetDays: number;
  /** Maximum allowed positive offset in years (safety limit) */
  readonly maxOffsetYears: number;
  /** Maximum allowed negative offset in years (safety limit) */
  readonly minOffsetYears: number;
  /** Default date string format for display (moment.js format string) */
  readonly defaultFormat: string;
}

/**
 * Dice-related configuration.
 * Controls dice expression evaluation (e.g., `roll(1, 100)`, `3d6`).
 */
export interface DiceConfig {
  /** Default number of sides on a die when not specified */
  readonly defaultSides: number;
  /** Maximum allowed sides per die (prevents excessive allocation) */
  readonly maxSides: number;
  /** Maximum number of dice in a single roll expression */
  readonly maxDice: number;
  /** Default number of dice when not specified */
  readonly defaultDice: number;
}

/**
 * Performance-related configuration.
 * Controls caching, timeouts, and processing limits to prevent runaway
 * resource consumption on large documents.
 */
export interface PerformanceConfig {
  /**
   * Maximum number of entries in {@link ExpressionEngine}'s bytecode cache
   * (per-instance, keyed by expression text) before the oldest entry is
   * evicted. Raise this for documents with many distinct expressions if
   * repeated re-evaluation (e.g. scrolling) is re-parsing instead of
   * hitting cache — bug fix (release hardening pass): this field used to
   * be read nowhere; the cache size was a hardcoded, unconfigurable
   * constant. Note this does NOT bound {@link LineCache}, which has no
   * size limit of its own.
   */
  readonly defaultCacheSize: number;
  /** Maximum number of document lines processed in a single pass */
  readonly maxDocumentLines: number;
  /** Maximum time (ms) allowed for parsing a single expression before timeout */
  readonly parseTimeoutMs: number;
  /** Maximum time (ms) allowed for executing a single expression before timeout */
  readonly executionTimeoutMs: number;
}

/**
 * Validation / safety-limit configuration.
 * Protects against runaway expressions that could cause excessive memory use
 * or stack overflow. These limits are checked during lexing and parsing.
 */
export interface ValidationConfig {
  /** Maximum expression length in characters. Prevents excessively long strings from entering the pipeline. */
  readonly maxExpressionLength: number;
  /** Maximum expression complexity score (`tokens + functionCalls×5 + nestingDepth×10`). Protects against deeply nested or combinatorially complex expressions. */
  readonly maxComplexity: number;
  /** Maximum parentheses nesting depth. Prevents stack overflow in the recursive-descent parser. */
  readonly maxNestingDepth: number;
  /**
   * Auto-balance unmatched parentheses by appending missing closing parens
   * or prepending missing opening parens. When disabled, unbalanced expressions
   * cause parse errors instead of being silently corrected.
   *
   * Disabled by default for strict parsing. Enable for forgiving user input
   * (e.g., chat-style calculators where users often omit closing parens).
   * Has zero overhead when disabled — the O(n) paren-count scan is skipped.
   */
  readonly autoBalanceParens: boolean;
}

/**
 * Worker pool configuration.
 * Controls the parallel execution workers used for batch evaluation.
 */
export interface WorkerConfig {
  /** Maximum number of concurrent Web Workers allowed */
  readonly maxConcurrentWorkers: number;
  /** Time (ms) a worker stays alive while idle before being terminated */
  readonly idleTimeoutMs: number;
  /** Maximum retry attempts for a failed worker operation */
  readonly maxRetries: number;
  /** Base backoff delay (ms) between retries (exponential backoff applied on top) */
  readonly baseBackoffMs: number;
}  /**
   * Diagnostic / telemetry configuration.
   * Controls the diagnostic event pipeline for profiling and debugging.
   * All diagnostics are disabled by default for maximum production performance.
   */
  export interface DiagnosticConfig {
    /** Master switch: enable the diagnostic pipeline (collectors receive events for all pipeline stages) */
    readonly enabled: boolean;
    /** Enable VM trace mode — emits per-opcode execution events (very verbose; disables some optimizations) */
    readonly vmTraceEnabled: boolean;
  }

  /**
   * Virtual Machine configuration.
   * Controls the internal bytecode VM that executes compiled expressions.
   */
  export interface VMConfig {
    /** Maximum stack depth (value slots) for VM execution — prevents stack overflow in recursive/pratt-parser generated bytecode */
    readonly maxStackDepth: number;
    /** Maximum opcodes executed per expression — halts runaway infinite loops */
    readonly maxInstructions: number;
  }

/**
 * Complete engine configuration.
 *
 * Every field has a default in `DEFAULT_CONFIG`. To customize, pass a
 * `Partial<EngineConfig>` when constructing `ExpressionEngine`. Only the
 * sections/fields you supply are overridden; all others use their defaults.
 *
 * @example
 * ```typescript
 * import { ExpressionEngine } from "solve-js";
 *
 * const engine = new ExpressionEngine("en", false, {
 *   validation: {
 *     maxExpressionLength: 1000,
 *     maxComplexity: 200,
 *   },
 *   // date, dice, performance, vm, worker, diagnostic all use defaults
 * });
 * ```
 */
export interface EngineConfig {
    /** Date/time expression evaluation bounds and formatting */
    readonly date: DateConfig;
    /** Dice roll expression controls */
    readonly dice: DiceConfig;
    /** Performance budgets and cache sizing */
    readonly performance: PerformanceConfig;
    /** Safety limits for expression complexity */
    readonly validation: ValidationConfig;
    /** Internal bytecode VM configuration */
    readonly vm: VMConfig;
    /** Parallel worker pool configuration */
    readonly worker: WorkerConfig;
    /** Diagnostic pipeline configuration */
    readonly diagnostic: DiagnosticConfig;
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
     // Preserves the effective cache size the hardcoded (now-removed)
     // BYTECODE_CACHE_MAX_ENTRIES constant had, so wiring this field up
     // doesn't silently shrink the default cache for existing consumers.
     defaultCacheSize: 2000,
     maxDocumentLines: 10000,
     parseTimeoutMs: 5000,
     executionTimeoutMs: 10000
   },
    validation: {
      maxExpressionLength: 2000,
      maxComplexity: 500,
      maxNestingDepth: 50,
      autoBalanceParens: false,
    },
    vm: {
      maxStackDepth: 200,
      maxInstructions: 50000,
    },
    worker: {
      maxConcurrentWorkers: 4,
      idleTimeoutMs: 30000,
      maxRetries: 3,
      baseBackoffMs: 1000,
    },
    diagnostic: {
      enabled: false,
      vmTraceEnabled: false,
    },
  };

/**
 * Merge a partial config override onto a base `EngineConfig`, section by
 * section — `{ ...base.section, ...override.section }` for each of the 7
 * top-level sections, not a single top-level spread.
 *
 * A shallow `{ ...base, ...override }` at the TOP level replaces an entire
 * section wholesale the moment a caller overrides even one field in it
 * (e.g. `{ performance: { defaultCacheSize: 500 } }` would silently drop
 * every other `performance.*` field back to `undefined`, not to its
 * default) — this function exists specifically so every config consumer
 * shares one correct merge instead of each hand-rolling (and risking) its
 * own. `ConfigManager` and `ExpressionEngine` both call this rather than
 * either duplicating the section list or instantiating a whole
 * `ConfigManager` just to reuse its private merge logic.
 */
export function mergeEngineConfig(
  base: EngineConfig,
  override: Partial<EngineConfig>
): EngineConfig {
  return {
    date: { ...base.date, ...override.date },
    dice: { ...base.dice, ...override.dice },
    performance: { ...base.performance, ...override.performance },
    validation: { ...base.validation, ...override.validation },
    vm: { ...base.vm, ...override.vm },
    worker: { ...base.worker, ...override.worker },
    diagnostic: { ...base.diagnostic, ...override.diagnostic },
  };
}

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
    this.config = mergeEngineConfig(DEFAULT_CONFIG, config);
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
        throw ErrorFactory.config(
          "CONFIG_PATH_NOT_FOUND",
          `Configuration path not found: ${path}`,
          { path }
        );
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
      throw ErrorFactory.config(
        "INVALID_CONFIG_PATH",
        `Invalid path: ${path}. Must be in format 'section.property'`,
        { path }
      );
    }
    
    const section = keys[0];
    const property = keys[1];
    
    if (!(section in this.config)) {
      throw ErrorFactory.config(
        "CONFIG_SECTION_NOT_FOUND",
        `Configuration section not found: ${section}`,
        { section, path }
      );
    }
    
    const sectionConfig = this.config[section as keyof EngineConfig];
    if (sectionConfig && typeof sectionConfig === 'object') {
      (sectionConfig as unknown as Record<string, unknown>)[property] = value;
    } else {
      throw ErrorFactory.config(
        "CONFIG_PROPERTY_NOT_FOUND",
        `Configuration property not found: ${path}`,
        { path }
      );
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
    this.config = mergeEngineConfig(this.config, config);
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
}

/**
 * Result type for {@link ConfigManager.validate}.
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
}

