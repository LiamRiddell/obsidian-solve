/**
 * Shared Test Utilities for solve-js
 * 
 * Centralizes common test helpers to eliminate duplication across 30+ test files.
 * NOT a test file — this is a utility module imported by test specs.
 * 
 * Located outside __tests__/ to prevent Jest from treating it as a test suite.
 */

import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { Lexer } from "@solve-js/lexer/Lexer";
import { Token } from "@solve-js/lexer/Token";
import { Value } from "@solve-js/vm/Value";
import { ParsingResult } from "@solve-js/types/ParsingResult";

/**
 * Create a fresh ExpressionEngine instance for testing.
 */
export function createEngine(locale = "en", diagnostic = false): ExpressionEngine {
  return new ExpressionEngine(locale, diagnostic);
}

/**
 * Evaluate a single expression and return the Value result.
 * Convenience wrapper around engine.evaluateLine().
 */
export function evalExpr(engine: ExpressionEngine, expr: string, lineNum = 1): Value {
  return engine.evaluateLine(lineNum, expr);
}

/**
 * Evaluate a full document and return the ParsingResult.
 */
export function evalDoc(engine: ExpressionEngine, doc: string): ParsingResult {
  return engine.parseDocument(doc, { inputType: "markdown" });
}

/**
 * Tokenize an expression string and return filtered tokens.
 */
export function tokenize(input: string): Token[] {
  const lexer = new Lexer("en");
  lexer.reset(input);
  return Array.from(lexer).filter(
    (t) => t.type !== "WS" && t.type !== "NEWLINE" && !t.type.startsWith("MD_")
  );
}

/**
 * Assert that a value is approximately equal to expected (for floating point).
 */
export function expectApproximately(actual: number, expected: number, epsilon = 0.0001): void {
  const diff = Math.abs(actual - expected);
  if (diff > epsilon) {
    throw new Error(`Expected ${expected} but got ${actual} (diff: ${diff})`);
  }
}

/**
 * Wait for a condition to be true, with timeout.
 * Replaces fragile setTimeout patterns in tests.
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 1000,
  intervalMs = 10
): Promise<void> {
  const start = performance.now();

  while (performance.now() - start < timeoutMs) {
    const result = await condition();
    if (result) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`waitForCondition timed out after ${timeoutMs}ms`);
}

/**
 * Generate a multi-line document with expressions for testing.
 */
export function generateDoc(lineCount: number): string {
  const lines: string[] = [];
  for (let i = 0; i < lineCount; i++) {
    if (i === 0) {
      lines.push(`:base${i} = ${i + 1}`);
    } else {
      lines.push(`:v${i} = :base${i - 1} + ${i}`);
    }
  }
  return lines.join("\n");
}

/**
 * Generate a markdown document with inline solves for testing.
 */
export function generateInlineDoc(solveCount: number): string {
  const expressions: string[] = [];
  for (let i = 0; i < solveCount; i++) {
    expressions.push(`s\`${i} + ${i + 1}\``);
  }
  return expressions.join(" some text between ");
}

/**
 * Test harness for benchmarking — provides consistent timing.
 */
export function benchmarkFn(fn: () => void, iterations = 10000, warmup = 100): {
  meanMs: number;
  medianMs: number;
  minMs: number;
  maxMs: number;
  totalMs: number;
} {
  // Warmup
  for (let i = 0; i < warmup; i++) {
    fn();
  }

  // Measure
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    times.push(end - start);
  }

  const sorted = [...times].sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);

  return {
    meanMs: sum / iterations,
    medianMs: sorted[Math.floor(iterations / 2)],
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
    totalMs: sum,
  };
}

/**
 * Assert that a Value is a number type with the expected value.
 */
export function expectNumberValue(value: Value, expected: number, epsilon = 0.0001): void {
  if (value.type !== 0) {
    // ValueType.Number = 0
    throw new Error(`Expected Number type but got ${value.type}`);
  }
  expectApproximately(value.toNumber(), expected, epsilon);
}