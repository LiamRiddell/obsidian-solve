/**
 * Core Type Definitions for solve-js Engine
 * 
 * This module provides branded types and core interfaces for type safety.
 * 
 * @module Types
 */

import { ErrorFactory } from '@solve-js/errors/UnifiedErrorFramework';

/**
 * Branded type for currency codes (ISO 4217)
 * 
 * @example
 * ```typescript
 * const usd = createCurrencyCode('USD');
 * const eur = createCurrencyCode('EUR');
 * ```
 */
export type CurrencyCode = string & { readonly __brand: 'CurrencyCode' };

/**
 * Branded type for variable names
 * 
 * @example
 * ```typescript
 * const varName = createVariableName('myVariable');
 * ```
 */
export type VariableName = string & { readonly __brand: 'VariableName' };

/**
 * Branded type for expression hashes
 */
export type ExpressionHash = string & { readonly __brand: 'ExpressionHash' };

/**
 * Branded type for line numbers (1-indexed)
 */
export type LineNumber = number & { readonly __brand: 'LineNumber' };

/**
 * Validation result type
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
}

/**
 * Creates a validated currency code
 * 
 * @param code - ISO 4217 currency code
 * @returns Validated currency code
 * @throws Error if code is invalid
 */
export function createCurrencyCode(code: string): CurrencyCode {
  if (!/^[A-Z]{3}$/.test(code)) {
    throw ErrorFactory.validation(
      'INVALID_CURRENCY_CODE',
      `Invalid currency code: ${code}. Must be 3 uppercase letters.`,
      { code }
    );
  }
  return code as CurrencyCode;
}

/**
 * Creates a validated variable name
 * 
 * @param name - Variable name
 * @returns Validated variable name
 * @throws Error if name is invalid
 */
export function createVariableName(name: string): VariableName {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw ErrorFactory.validation(
      'INVALID_VARIABLE_NAME',
      `Invalid variable name: ${name}. Must start with letter or underscore.`,
      { name }
    );
  }
  return name as VariableName;
}

/**
 * Creates a validated expression hash
 * 
 * @param hash - Hash string
 * @returns Validated expression hash
 */
export function createExpressionHash(hash: string): ExpressionHash {
  return hash as ExpressionHash;
}

/**
 * Creates a validated line number
 * 
 * @param num - Line number (1-indexed)
 * @returns Validated line number
 * @throws Error if number is invalid
 */
export function createLineNumber(num: number): LineNumber {
  if (num < 1 || !Number.isInteger(num)) {
    throw ErrorFactory.validation(
      'INVALID_LINE_NUMBER',
      `Invalid line number: ${num}. Must be a positive integer.`,
      { lineNumber: num }
    );
  }
  return num as LineNumber;
}

/**
 * Type guard for currency codes
 */
export function isCurrencyCode(code: string): code is CurrencyCode {
  return /^[A-Z]{3}$/.test(code);
}

/**
 * Type guard for variable names
 */
export function isVariableName(name: string): name is VariableName {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

/**
 * Type guard for line numbers
 */
export function isLineNumber(num: number): num is LineNumber {
  return num >= 1 && Number.isInteger(num);
}
