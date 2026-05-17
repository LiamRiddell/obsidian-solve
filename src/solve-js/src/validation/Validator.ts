/**
 * Validation Framework for solve-js Engine
 * 
 * This module provides input validation and sanitization for expressions.
 * 
 * @module Validation
 */

import { ValidationResult } from '@solve-js/types/core';
import { ErrorFactory } from '@solve-js/errors/UnifiedErrorFramework';
import { EngineConfig } from '@solve-js/constants/Configuration';

/**
 * Validation rule interface
 */
export interface ValidationRule<T> {
  /** Rule name for identification */
  name: string;
  /** Validate a value */
  validate(value: T): ValidationResult;
}

/**
 * Expression validation configuration
 */
export interface ExpressionValidationConfig {
  /** Maximum expression length in characters */
  maxLength: number;
  /** Maximum expression complexity score */
  maxComplexity: number;
  /** Maximum nesting depth for parentheses */
  maxNestingDepth: number;
  /** Allow dangerous characters */
  allowDangerousChars: boolean;
  /** Allowed character patterns */
  allowedPatterns: RegExp[];
  /** Forbidden character patterns */
  forbiddenPatterns: RegExp[];
}

/**
 * Default validation configuration
 */
export const DEFAULT_VALIDATION_CONFIG: ExpressionValidationConfig = {
  maxLength: 1000,
  maxComplexity: 100,
  maxNestingDepth: 10,
  allowDangerousChars: false,
  allowedPatterns: [
    /^[a-zA-Z0-9\s+\-*/^().,=<>!&|?:]+$/ // Basic allowed characters
  ],
  forbiddenPatterns: [
    /[<>]/, // HTML injection prevention
    // Control characters check done separately
  ]
};

/**
 * Validates mathematical expressions
 * 
 * @example
 * ```typescript
 * const validator = new ExpressionValidator();
 * const result = validator.validate('2 + 2');
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 * ```
 */
export class ExpressionValidator implements ValidationRule<string> {
  public readonly name = 'ExpressionValidator';
  private config: ExpressionValidationConfig;

  constructor(config: Partial<ExpressionValidationConfig> = {}) {
    this.config = { ...DEFAULT_VALIDATION_CONFIG, ...config };
  }

  /**
   * Validate an expression
   * 
   * @param expression - Expression to validate
   * @returns Validation result
   */
  validate(expression: string): ValidationResult {
    // Check length
    if (expression.length > this.config.maxLength) {
      return {
        valid: false,
        error: `Expression exceeds maximum length of ${this.config.maxLength} characters`
      };
    }

    // Check for control characters
    if (!this.config.allowDangerousChars) {
      for (let i = 0; i < expression.length; i++) {
        const charCode = expression.charCodeAt(i);
        if (charCode < 32 || charCode === 127) {
          return {
            valid: false,
            error: 'Expression contains control characters'
          };
        }
      }
    }

    // Check allowed patterns
    if (this.config.allowedPatterns.length > 0) {
      const isAllowed = this.config.allowedPatterns.some(pattern => pattern.test(expression));
      if (!isAllowed) {
        return {
          valid: false,
          error: 'Expression contains invalid characters'
        };
      }
    }

    // Check nesting depth
    const nestingDepth = this.calculateNestingDepth(expression);
    if (nestingDepth > this.config.maxNestingDepth) {
      return {
        valid: false,
        error: `Expression exceeds maximum nesting depth of ${this.config.maxNestingDepth}`
      };
    }

    // Check complexity
    const complexity = this.calculateComplexity(expression);
    if (complexity > this.config.maxComplexity) {
      return {
        valid: false,
        error: `Expression exceeds maximum complexity of ${this.config.maxComplexity}`
      };
    }

    // Check balanced parentheses
    if (!this.hasBalancedParentheses(expression)) {
      return {
        valid: false,
        error: 'Expression has unbalanced parentheses'
      };
    }

    return { valid: true };
  }

  /**
   * Calculate expression complexity score
   */
  private calculateComplexity(expression: string): number {
    let score = 0;
    
    // Count operators
    const operators = (expression.match(/[+\-*/^=<>!&|?:]/g) || []).length;
    score += operators;
    
    // Count nested parentheses
    const nestingDepth = this.calculateNestingDepth(expression);
    score += nestingDepth * 2;
    
    // Count function calls
    const functions = (expression.match(/[a-zA-Z_][a-zA-Z0-9_]*\(/g) || []).length;
    score += functions * 3;
    
    return score;
  }

  /**
   * Calculate maximum nesting depth
   */
  private calculateNestingDepth(expression: string): number {
    let maxDepth = 0;
    let currentDepth = 0;
    
    for (const char of expression) {
      if (char === '(') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (char === ')') {
        currentDepth--;
      }
    }
    
    return maxDepth;
  }

  /**
   * Check if parentheses are balanced
   */
  private hasBalancedParentheses(expression: string): boolean {
    let balance = 0;
    
    for (const char of expression) {
      if (char === '(') {
        balance++;
      } else if (char === ')') {
        balance--;
        if (balance < 0) {
          return false;
        }
      }
    }
    
    return balance === 0;
  }
}

/**
 * Sanitizer for cleaning expressions
 */
export class ExpressionSanitizer {
  /**
   * Sanitize an expression
   * 
   * @param expression - Expression to sanitize
   * @returns Sanitized expression
   */
  sanitize(expression: string): string {
    // Remove dangerous characters
    let sanitized = expression.replace(/[<>]/g, '');
    
    // Normalize whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();
    
    // Validate encoding
    if (!this.isValidUTF8(sanitized)) {
      throw ErrorFactory.validation('INVALID_ENCODING', 'Invalid character encoding');
    }
    
    return sanitized;
  }

  /**
   * Check if string is valid UTF-8
   */
  private isValidUTF8(str: string): boolean {
    try {
      new TextEncoder().encode(str);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Input validation manager
 */
export class ValidationManager {
  private expressionValidator: ExpressionValidator;
  private sanitizer: ExpressionSanitizer;

  constructor(config: Partial<ExpressionValidationConfig> = {}) {
    this.expressionValidator = new ExpressionValidator(config);
    this.sanitizer = new ExpressionSanitizer();
  }

  /**
   * Validate and sanitize an expression
   * 
   * @param expression - Expression to validate
   * @returns Validated and sanitized expression or error
   */
  validateExpression(expression: string): ValidationResult & { expression?: string } {
    // First sanitize
    let sanitized: string;
    try {
      sanitized = this.sanitizer.sanitize(expression);
    } catch (error) {
      return { valid: false, error: 'Failed to sanitize expression' };
    }

    // Then validate
    const validation = this.expressionValidator.validate(sanitized);
    if (!validation.valid) {
      return validation;
    }

    return { valid: true, expression: sanitized };
  }

  /**
   * Validate configuration
   */
  validateConfig(config: EngineConfig): ValidationResult {
    const errors: string[] = [];

    // Validate performance config
    if (config.performance.maxDocumentLines > 100000) {
      errors.push('maxDocumentLines cannot exceed 100,000');
    }

    // Validate date config
    if (config.date.maxOffsetYears > 1000) {
      errors.push('maxOffsetYears cannot exceed 1000');
    }

    // Validate dice config
    if (config.dice.maxSides > 10000) {
      errors.push('maxSides cannot exceed 10,000');
    }

    return {
      valid: errors.length === 0,
      error: errors.join('; '),
      warnings: []
    };
  }
}
