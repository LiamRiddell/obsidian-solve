/**
 * The engine's structured error type — the "Rust/Go-style, verbose, easy to
 * tell the issue" half of the error-handling redesign (the other half is
 * `Result.ts`).
 *
 * Historical note: an earlier version of this class (`UnifiedErrorFramework.ts`,
 * still the import path most of the codebase uses — see that file, now a
 * pure re-export barrel) had a much larger field set (`severity`,
 * `recovery` — a 5-value enum, `ErrorRecoveryManager`) that was almost
 * entirely dead: nothing downstream ever read `.severity`/`.recovery`,
 * only `.message` reliably survived to a caller. This version is smaller
 * and deliberately keeps only fields something actually consumes.
 */

import type { ErrorCode } from "@solve-js/errors/ErrorCode";

/** A character-offset (and optional line/col) span into the original expression text — for a future "underline the offending token" UI, not yet wired to one. */
export interface SourceSpan {
  start: number;
  end: number;
  line?: number;
  col?: number;
}

/**
 * Error classification — kept from the original framework, now actually
 * consulted: it's the `format()` header and lets host code group errors
 * by pipeline stage without string-matching `.code`.
 */
export enum ErrorCategory {
  /** Errors during expression parsing. */
  PARSING = "PARSING",
  /** Errors during bytecode execution. */
  EXECUTION = "EXECUTION",
  /** Errors from input validation (safety limits, config). */
  VALIDATION = "VALIDATION",
  /** Errors from external services/APIs (currency rates, weather, stocks). */
  EXTERNAL = "EXTERNAL",
  /** Internal engine invariant violations — see `recoverable`'s doc comment. */
  INTERNAL = "INTERNAL",
  /** Configuration errors. */
  CONFIG = "CONFIG",
}

export interface EngineErrorInit {
  /** Catalog code — see `errors/ErrorCode.ts`. Not a free string: every code used by a BUILT-IN package should be registered there so `ErrorCodeCatalog.spec.ts` can catch collisions/typos. Third-party packages may still use any string here — `EngineError.code`'s runtime type is `string`. */
  code: ErrorCode | (string & {});
  /** Short, single-line, `Error.message`-compatible. Existing `.toThrow(/pattern/)`/`.message` assertions keep working against this field — richer detail goes in `expected`/`found`/`suggestion`, not crammed into this string. */
  message: string;
  /** What the parser/validator/VM expected to see, in plain words — e.g. "a city name", "a 4-digit year", "end of expression". */
  expected?: string;
  /** What was actually found instead — e.g. "end of expression", `NUMBER "5"`, the offending token's literal text. */
  found?: string;
  /** An actionable, worked-example fix — e.g. `e.g. "weather in London"`. Mirrors this codebase's best existing messages (`WEATHER_EXPECTED_CITY`, `AS_CONVERTER_EXPECTED_NAME`). */
  suggestion?: string;
  /**
   * `true` (the default) for every EXPECTED failure mode of user input or
   * environment — bad syntax, an unknown variable/function, a safety limit
   * exceeded, an external API being down. `false` is reserved for genuine
   * ENGINE-INTERNAL invariant violations (corrupted bytecode, a stack
   * underflow from a buggy plugin, an "impossible" state) —
   * `ErrorFactory.internal()`/`.config()` default to `false`, every other
   * factory method defaults to `true`.
   *
   * This does NOT gate "does evaluation of the rest of the document
   * continue" — with this engine's per-line containment, it always does,
   * even for a `recoverable: false` error (see `ARCHITECTURE.md`'s
   * async-batcher/Tier-2 hardening notes). It gates MESSAGE FRAMING and
   * telemetry: "fix your syntax" vs. "this is an engine bug, worth
   * reporting" — see `EngineError.isFatal()`.
   */
  recoverable?: boolean;
  /** Character-offset span into the source expression, when available. Not yet threaded through every call site — populate opportunistically, don't block on retrofitting every existing throw site. */
  span?: SourceSpan;
  /** Free-form structured context. The one field the pre-existing framework's real consumer (`ThreeTierEvaluator.ts`'s DAG-preservation-on-compile-error path) actually reads — kept name- and shape-compatible on purpose. */
  context?: Record<string, unknown>;
  /** The underlying error this one wraps, if any — passed straight through to native `Error.cause` (ES2022), so Node's default printer, most loggers, and `instanceof Error` tooling understand the chain for free. */
  cause?: unknown;
}

/**
 * The engine's structured error type. Still a real `Error` subclass (so
 * `throw`/`catch`/`instanceof Error` all keep working exactly as before),
 * but now every field except the removed `severity`/`recovery` pair is
 * something real code reads.
 */
export class EngineError extends Error {
  readonly category: ErrorCategory;
  readonly code: string;
  readonly expected?: string;
  readonly found?: string;
  readonly suggestion?: string;
  readonly recoverable: boolean;
  readonly span?: SourceSpan;
  readonly context?: Record<string, unknown>;
  readonly timestamp: Date;
  /**
   * Set explicitly (not via `super(message, {cause})`) — this repo's
   * `tsconfig.json` targets ES6/ES5-ES7 lib, which predates TypeScript's
   * ES2022 `Error` constructor `cause`-option overload. `Error.prototype.cause`
   * is still a real runtime feature in every target this engine actually
   * runs in (Node 16.9+, all evergreen browsers, Electron/Obsidian's
   * bundled Chromium) regardless of the TS lib target used to type-check
   * against it — assigning it directly gets the same Node-printer/logger
   * interop with no build-config change needed.
   */
  readonly cause?: unknown;

  constructor(category: ErrorCategory, init: EngineErrorInit) {
    super(init.message);
    this.name = "EngineError";
    this.category = category;
    this.code = init.code;
    this.expected = init.expected;
    this.found = init.found;
    this.suggestion = init.suggestion;
    this.recoverable = init.recoverable ?? true;
    this.span = init.span;
    this.context = init.context;
    this.cause = init.cause;
    this.timestamp = new Date();
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EngineError);
    }
  }

  /** `!recoverable` — see `EngineErrorInit.recoverable`'s doc comment for what this actually gates (message framing/telemetry, not whether evaluation continues). */
  isFatal(): boolean {
    return !this.recoverable;
  }

  /** Walk `.cause` repeatedly, collecting the full chain (this error first). */
  causeChain(): unknown[] {
    const chain: unknown[] = [this];
    let current: unknown = this.cause;
    while (current !== undefined && current !== null) {
      chain.push(current);
      current = current instanceof Error ? (current as Error & { cause?: unknown }).cause : undefined;
    }
    return chain;
  }

  /**
   * Rust/Go-style multi-line renderer — the NEW thing a host/CLI/test
   * reaches for when it wants the full, verbose picture, as distinct from
   * `.message` (kept short and stable for existing assertions). Example:
   *
   * ```
   * error[WEATHER_EXPECTED_CITY]: Expected a city name after "weather in"
   *   expected: a city name
   *   found: end of expression
   *   suggestion: e.g. "weather in London"
   * ```
   */
  format(): string {
    const lines = [`error[${this.code}]: ${this.message}`];
    if (this.expected) lines.push(`  expected: ${this.expected}`);
    if (this.found) lines.push(`  found: ${this.found}`);
    if (this.suggestion) lines.push(`  suggestion: ${this.suggestion}`);
    return lines.join("\n");
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      category: this.category,
      code: this.code,
      message: this.message,
      expected: this.expected,
      found: this.found,
      suggestion: this.suggestion,
      recoverable: this.recoverable,
      span: this.span,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
    };
  }
}

/**
 * Factory for creating classified `EngineError`s. Every method accepts
 * EITHER the original, minimal 3-arg shape (`code, message, context?` —
 * every existing call site across the codebase keeps compiling unchanged)
 * OR the richer `EngineErrorInit` object (for `expected`/`found`/
 * `suggestion`/`recoverable`/`span`/`cause`) — upgrade a call site to the
 * richer form only when you're already touching it, no separate churn
 * pass required.
 */
export class ErrorFactory {
  private static build(
    category: ErrorCategory,
    defaultRecoverable: boolean,
    codeOrInit: string | EngineErrorInit,
    message?: string,
    context?: Record<string, unknown>,
  ): EngineError {
    const init: EngineErrorInit =
      typeof codeOrInit === "string"
        ? { code: codeOrInit, message: message!, context }
        : codeOrInit;
    return new EngineError(category, { recoverable: defaultRecoverable, ...init });
  }

  static validation(code: string, message: string, context?: Record<string, unknown>): EngineError;
  static validation(init: EngineErrorInit): EngineError;
  static validation(codeOrInit: string | EngineErrorInit, message?: string, context?: Record<string, unknown>): EngineError {
    return ErrorFactory.build(ErrorCategory.VALIDATION, true, codeOrInit, message, context);
  }

  static parsing(code: string, message: string, context?: Record<string, unknown>): EngineError;
  static parsing(init: EngineErrorInit): EngineError;
  static parsing(codeOrInit: string | EngineErrorInit, message?: string, context?: Record<string, unknown>): EngineError {
    return ErrorFactory.build(ErrorCategory.PARSING, true, codeOrInit, message, context);
  }

  static execution(code: string, message: string, context?: Record<string, unknown>): EngineError;
  static execution(init: EngineErrorInit): EngineError;
  static execution(codeOrInit: string | EngineErrorInit, message?: string, context?: Record<string, unknown>): EngineError {
    return ErrorFactory.build(ErrorCategory.EXECUTION, true, codeOrInit, message, context);
  }

  static external(code: string, message: string, context?: Record<string, unknown>): EngineError;
  static external(init: EngineErrorInit): EngineError;
  static external(codeOrInit: string | EngineErrorInit, message?: string, context?: Record<string, unknown>): EngineError {
    return ErrorFactory.build(ErrorCategory.EXTERNAL, true, codeOrInit, message, context);
  }

  /** Defaults `recoverable: false` — reserve for genuine engine-internal invariant violations, not user-input errors. */
  static internal(code: string, message: string, context?: Record<string, unknown>): EngineError;
  static internal(init: EngineErrorInit): EngineError;
  static internal(codeOrInit: string | EngineErrorInit, message?: string, context?: Record<string, unknown>): EngineError {
    return ErrorFactory.build(ErrorCategory.INTERNAL, false, codeOrInit, message, context);
  }

  /** Defaults `recoverable: false` — a bad config is an environment-setup problem, not a per-line user-input error. */
  static config(code: string, message: string, context?: Record<string, unknown>): EngineError;
  static config(init: EngineErrorInit): EngineError;
  static config(codeOrInit: string | EngineErrorInit, message?: string, context?: Record<string, unknown>): EngineError {
    return ErrorFactory.build(ErrorCategory.CONFIG, false, codeOrInit, message, context);
  }
}

/**
 * Normalize any thrown value into an `EngineError` — an `EngineError`
 * passes through as-is; a plain `Error` gets wrapped (message preserved,
 * original attached via `cause`); anything else becomes a generic
 * "unknown error" wrapping the stringified value. Used at every
 * throw-space/Result-space boundary (`Result.tryCatch`'s default
 * `normalize`, the VM's outer execution try/catch, `AsyncResolutionBatcher`'s
 * per-line containment) so a raw `TypeError` from a genuine engine bug
 * still surfaces as a structured, catalogued error instead of an opaque
 * uncaught exception.
 */
export function normalizeUnknownError(error: unknown): EngineError {
  if (error instanceof EngineError) return error;
  if (error instanceof Error) {
    return ErrorFactory.internal({
      code: "UNEXPECTED_ERROR",
      message: error.message,
      context: { originalErrorName: error.name },
      cause: error,
    });
  }
  return ErrorFactory.internal({
    code: "UNKNOWN_ERROR",
    message: "An unknown error occurred",
    context: { error: String(error) },
  });
}
