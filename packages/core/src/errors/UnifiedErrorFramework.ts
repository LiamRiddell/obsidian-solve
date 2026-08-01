/**
 * Backward-compatible re-export barrel.
 *
 * This file used to hold the whole error framework in one place
 * (`ErrorCategory`, `ErrorSeverity`, `ErrorRecovery`, `EngineError`,
 * `ErrorFactory`, `ErrorRecoveryManager`, `Result`) — ~100+ call sites
 * across this codebase import from `@solve-js/errors/UnifiedErrorFramework`
 * by that exact path, so it stays alive as a barrel rather than being
 * deleted, to avoid a synchronized cross-repo import-path edit.
 *
 * The real content now lives in three focused modules (see each for the
 * design rationale):
 * - `errors/Result.ts` — the generic `Result<T, E>` type + combinators.
 * - `errors/EngineError.ts` — `ErrorCategory`, `EngineError`, `ErrorFactory`,
 *   `normalizeUnknownError`.
 * - `errors/ErrorCode.ts` — the built-in error-code catalog.
 *
 * Removed, not migrated (confirmed zero production consumers before
 * deletion — see this session's error-handling-refactor research): the
 * `ErrorSeverity` enum, the 5-value `ErrorRecovery` enum, and
 * `ErrorRecoveryManager` (its retry/fallback concern is already better
 * handled by the TanStack `QueryClient` already wired into
 * `ExpressionEngine`). If you're looking for retry-with-backoff logic,
 * that's `services/DataQueryService.ts`'s `QueryClient`, not this module.
 */

export { ErrorCategory, EngineError, ErrorFactory, normalizeUnknownError } from "./EngineError";
export type { EngineErrorInit, SourceSpan } from "./EngineError";

export {
  ok,
  err,
  isOk,
  isErr,
  map,
  mapErr,
  andThen,
  unwrapOr,
  match,
  combine,
  throwIfErr,
  tryCatch,
  tryCatchAsync,
} from "./Result";
export type { Result } from "./Result";

export { CoreErrorCodes } from "./ErrorCode";
export type { ErrorCode, CoreErrorCode } from "./ErrorCode";
