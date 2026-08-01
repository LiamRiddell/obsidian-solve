import { type EngineError, normalizeUnknownError } from "@solve-js/errors/EngineError";

/**
 * A Rust-style `Result<T, E>` — the value half of this engine's error-handling
 * redesign. `E` defaults to `EngineError` (this engine's structured error
 * type) but every combinator here is generic over `E`, so `Result` works
 * equally well for a domain that isn't `EngineError`-shaped.
 *
 * This exact shape used to live in `errors/UnifiedErrorFramework.ts` (kept
 * there as a barrel re-export for backward compatibility) — moved here as
 * its own module because it's genuinely generic (no dependency on
 * `EngineError` beyond the default type parameter) and because the engine
 * is migrating callers to it incrementally: parsing/VM/package code that
 * expects "a failure is a possibility, not an exception" returns
 * `Result<T, EngineError>` instead of throwing; two explicit adapters —
 * {@link throwIfErr} and {@link tryCatch} — are the sanctioned way to cross
 * the boundary between Result-based code and still-throw-based code during
 * the migration (and permanently, at the public API boundary — see
 * `ExpressionEngine.evaluateExpression()`'s documented throw contract).
 */
export type Result<T, E = EngineError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/** Wrap a successful value. */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** Wrap a failure. */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T } {
  return r.ok;
}

export function isErr<T, E>(r: Result<T, E>): r is { ok: false; error: E } {
  return !r.ok;
}

/** Transform the success value; a failure passes through untouched. */
export function map<T, U, E>(r: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return r.ok ? ok(fn(r.value)) : r;
}

/** Transform the error; a success passes through untouched. */
export function mapErr<T, E, F>(r: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return r.ok ? r : err(fn(r.error));
}

/** Chain a Result-returning operation onto a success (a.k.a. flatMap/bind). */
export function andThen<T, U, E>(r: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
  return r.ok ? fn(r.value) : r;
}

/** Unwrap a success, or return `fallback` for a failure. Never throws. */
export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T {
  return r.ok ? r.value : fallback;
}

/** Exhaustive pattern-match — the `match`/`switch` a Rust enum gets for free. */
export function match<T, E, R>(r: Result<T, E>, arms: { ok: (value: T) => R; err: (error: E) => R }): R {
  return r.ok ? arms.ok(r.value) : arms.err(r.error);
}

/**
 * Combine several Results into one — succeeds with a tuple of all values
 * iff every input succeeded; otherwise fails with the FIRST error
 * encountered (left-to-right), matching this codebase's existing
 * fail-fast convention elsewhere (e.g. `BytecodeBuilder`'s constant-pool
 * limit checks).
 */
export function combine<T extends readonly unknown[], E>(
  results: { [K in keyof T]: Result<T[K], E> },
): Result<T, E> {
  const values: unknown[] = [];
  for (const r of results as readonly Result<unknown, E>[]) {
    if (!r.ok) return r;
    values.push(r.value);
  }
  return ok(values as unknown as T);
}

/**
 * Cross from Result-space back to throw-space — the sanctioned boundary
 * adapter for callers (public API surface, older not-yet-migrated code,
 * tests) that still want exception-based control flow. Throws `r.error`
 * as-is (an `EngineError` is already a real `Error` subclass, so this
 * needs no wrapping).
 */
export function throwIfErr<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw r.error;
}

/**
 * Cross from throw-space into Result-space — runs `fn`, converting any
 * thrown value into a Result via `normalize` (defaults to
 * {@link normalizeUnknownError}). The inverse of {@link throwIfErr}; the
 * pairing that lets Result-based and throw-based code interoperate during
 * an incremental migration instead of requiring a single flag-day rewrite.
 */
export function tryCatch<T>(
  fn: () => T,
  normalize: (e: unknown) => EngineError = normalizeUnknownError,
): Result<T, EngineError> {
  try {
    return ok(fn());
  } catch (e) {
    return err(normalize(e));
  }
}

/** Async sibling of {@link tryCatch}. */
export async function tryCatchAsync<T>(
  fn: () => Promise<T>,
  normalize: (e: unknown) => EngineError = normalizeUnknownError,
): Promise<Result<T, EngineError>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(normalize(e));
  }
}
