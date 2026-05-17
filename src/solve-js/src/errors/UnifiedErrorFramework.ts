/**
 * Unified Error Framework for solve-js Engine
 * 
 * This module provides a comprehensive error handling system with categorized errors,
 * severity levels, and recovery strategies.
 * 
 * @module Errors
 */

/**
 * Error categories for classification and handling
 */
export enum ErrorCategory {
  /** Errors during expression parsing */
  PARSING = 'PARSING',
  
  /** Errors during bytecode execution */
  EXECUTION = 'EXECUTION',
  
  /** Errors from input validation */
  VALIDATION = 'VALIDATION',
  
  /** Errors from external services/APIs */
  EXTERNAL = 'EXTERNAL',
  
  /** Internal engine errors */
  INTERNAL = 'INTERNAL',
  
  /** Configuration errors */
  CONFIG = 'CONFIG'
}

/**
 * Error severity levels for logging and handling
 */
export enum ErrorSeverity {
  /** Informational - no action required */
  INFO = 'INFO',
  
  /** Warning - should be reviewed but not critical */
  WARNING = 'WARNING',
  
  /** Error - processing failed but can continue */
  ERROR = 'ERROR',
  
  /** Critical - processing cannot continue */
  CRITICAL = 'CRITICAL'
}

/**
 * Error recovery strategies
 */
export enum ErrorRecovery {
  /** No recovery - fail immediately */
  NONE = 'NONE',
  
  /** Retry the operation with backoff */
  RETRY = 'RETRY',
  
  /** Use fallback value or strategy */
  FALLBACK = 'FALLBACK',
  
  /** Continue with degraded functionality */
  DEGRADED = 'DEGRADED',
  
  /** Skip problematic item and continue */
  SKIP = 'SKIP'
}

/**
 * Result type for operations that can fail
 */
export type Result<T, E = SolveError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Configuration for error recovery
 */
export interface ErrorStrategy {
  recovery: ErrorRecovery;
  maxRetries?: number;
  backoffMs?: number;
  fallback?: () => unknown;
}

/**
 * Base error class for solve-js engine
 * 
 * @example
 * ```typescript
 * throw new SolveError(
 *   ErrorCategory.VALIDATION,
 *   'INVALID_EXPRESSION',
 *   'Expression contains invalid characters',
 *   ErrorSeverity.ERROR,
 *   ErrorRecovery.NONE,
 *   { expression: 'invalid!@#' }
 * );
 * ```
 */
export class SolveError extends Error {
  public readonly timestamp: Date;
  public readonly stack?: string;

  /**
   * Creates a new SolveError instance
   * 
   * @param category - Error category for classification
   * @param code - Unique error code for identification
   * @param message - Human-readable error message
   * @param severity - Error severity level (default: ERROR)
   * @param recovery - Recovery strategy (default: NONE)
   * @param context - Additional context information
   */
  constructor(
    public readonly category: ErrorCategory,
    public readonly code: string,
    message: string,
    public readonly severity: ErrorSeverity = ErrorSeverity.ERROR,
    public readonly recovery: ErrorRecovery = ErrorRecovery.NONE,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SolveError';
    this.timestamp = new Date();
    
    // Capture stack trace (excluding constructor call)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SolveError);
    }
  }

  /**
   * Convert error to JSON-serializable object
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      category: this.category,
      code: this.code,
      message: this.message,
      severity: this.severity,
      recovery: this.recovery,
      context: this.context,
      timestamp: this.timestamp.toISOString()
    };
  }

  /**
   * Check if error is recoverable
   */
  isRecoverable(): boolean {
    return this.recovery !== ErrorRecovery.NONE;
  }

  /**
   * Create a formatted error message with context
   */
  format(): string {
    const base = `[${this.category}] ${this.code}: ${this.message}`;
    if (this.context) {
      const contextStr = JSON.stringify(this.context);
      return `${base} | Context: ${contextStr}`;
    }
    return base;
  }
}

/**
 * Factory for creating common errors
 */
export class ErrorFactory {
  /**
   * Create a validation error
   */
  static validation(
    code: string,
    message: string,
    context?: Record<string, unknown>
  ): SolveError {
    return new SolveError(
      ErrorCategory.VALIDATION,
      code,
      message,
      ErrorSeverity.ERROR,
      ErrorRecovery.NONE,
      context
    );
  }

  /**
   * Create a parsing error
   */
  static parsing(
    code: string,
    message: string,
    context?: Record<string, unknown>
  ): SolveError {
    return new SolveError(
      ErrorCategory.PARSING,
      code,
      message,
      ErrorSeverity.ERROR,
      ErrorRecovery.SKIP,
      context
    );
  }

  /**
   * Create an execution error
   */
  static execution(
    code: string,
    message: string,
    context?: Record<string, unknown>
  ): SolveError {
    return new SolveError(
      ErrorCategory.EXECUTION,
      code,
      message,
      ErrorSeverity.ERROR,
      ErrorRecovery.DEGRADED,
      context
    );
  }

  /**
   * Create an external service error
   */
  static external(
    code: string,
    message: string,
    context?: Record<string, unknown>
  ): SolveError {
    return new SolveError(
      ErrorCategory.EXTERNAL,
      code,
      message,
      ErrorSeverity.ERROR,
      ErrorRecovery.RETRY,
      context
    );
  }

  /**
   * Create an internal error
   */
  static internal(
    code: string,
    message: string,
    context?: Record<string, unknown>
  ): SolveError {
    return new SolveError(
      ErrorCategory.INTERNAL,
      code,
      message,
      ErrorSeverity.CRITICAL,
      ErrorRecovery.NONE,
      context
    );
  }

  /**
   * Create a configuration error
   */
  static config(
    code: string,
    message: string,
    context?: Record<string, unknown>
  ): SolveError {
    return new SolveError(
      ErrorCategory.CONFIG,
      code,
      message,
      ErrorSeverity.CRITICAL,
      ErrorRecovery.NONE,
      context
    );
  }
}

/**
 * Error recovery manager for handling errors with recovery strategies
 */
export class ErrorRecoveryManager {
  /**
   * Execute an operation with error recovery
   * 
   * @param operation - The operation to execute
   * @param strategy - Error recovery strategy
   * @returns Result of the operation
   */
  static async execute<T>(
    operation: () => Promise<T>,
    strategy: ErrorStrategy
  ): Promise<Result<T, SolveError>> {
    let lastError: SolveError | null = null;
    const maxRetries = strategy.maxRetries || 3;
    const backoffMs = strategy.backoffMs || 1000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        return { ok: true, value: result };
      } catch (error) {
        const solvedError = this.normalizeError(error);
        lastError = solvedError;

        if (attempt === maxRetries || strategy.recovery === ErrorRecovery.NONE) {
          break;
        }

        if (strategy.recovery === ErrorRecovery.RETRY) {
          await this.backoff(backoffMs, attempt);
          continue;
        }

        if (strategy.recovery === ErrorRecovery.FALLBACK && strategy.fallback) {
          try {
            const fallbackResult = strategy.fallback();
            return { ok: true, value: fallbackResult as T };
          } catch (fallbackError) {
            // Fallback failed, return original error
            break;
          }
        }

        if (strategy.recovery === ErrorRecovery.DEGRADED) {
          return { ok: false, error: solvedError };
        }
      }
    }

    return { ok: false, error: lastError! };
  }

  /**
   * Normalize any error to SolveError
   */
  static normalizeError(error: unknown): SolveError {
    if (error instanceof SolveError) {
      return error;
    }

    if (error instanceof Error) {
      return ErrorFactory.internal(
        'UNEXPECTED_ERROR',
        error.message,
        { originalError: error.name }
      );
    }

    return ErrorFactory.internal(
      'UNKNOWN_ERROR',
      'An unknown error occurred',
      { error: String(error) }
    );
  }

  /**
   * Exponential backoff with jitter
   */
  private static async backoff(baseMs: number, attempt: number): Promise<void> {
    const exponentialBackoff = baseMs * Math.pow(2, attempt);
    const jitter = Math.random() * 100; // Add randomness to prevent thundering herd
    const delay = exponentialBackoff + jitter;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}
