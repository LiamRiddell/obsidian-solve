/**
 * The built-in error-code catalog — one typed const object per domain,
 * unioned together here for autocomplete/exhaustiveness in core engine
 * code. Deliberately NOT one central enum: `IEnginePackage` is documented
 * public SDK surface for third-party packages (see `api/PackageRegistry.ts`),
 * and a closed enum would block an external package author from defining
 * their own codes without editing this file. `EngineError.code`'s runtime
 * type stays `string` for exactly that reason — this catalog is for the
 * codes THIS repo owns and wants collision/typo checking on (see
 * `__tests__/errors/ErrorCodeCatalog.spec.ts`), not a hard runtime
 * whitelist.
 *
 * As each package migrates to `Result<void, EngineError>` (see this
 * session's error-handling-refactor plan, Phase 5), it should export its
 * own small `XxxErrorCodes` const object co-located with its parselets —
 * exactly like `CoreErrorCodes` below, just scoped to one domain — and get
 * unioned into `ErrorCode` here. Until a package migrates, its existing
 * free-string codes keep working (ErrorFactory accepts any string); they
 * just aren't caught by the catalog's uniqueness/orphan checks yet.
 */

/**
 * Codes used directly by the parser/VM/engine/errors layers themselves —
 * confirmed against the current source, not aspirational. Grouped by
 * pipeline stage via the comments, not a naming prefix (these predate any
 * naming convention and renaming them is out of scope for introducing the
 * catalog — only NEW codes need to follow a scoped/prefixed style, see
 * `STACK_UNDERFLOW` etc. below).
 */
export const CoreErrorCodes = {
  // ── Parser (parser/PrecedenceParser.ts, parser/BytecodeBuilder.ts, parser/PhrasePattern.ts) ──
  INVALID_NUMBER_LITERAL: "INVALID_NUMBER_LITERAL",
  NO_PREFIX_PARSELET: "NO_PREFIX_PARSELET",
  UNEXPECTED_END_OF_INPUT: "UNEXPECTED_END_OF_INPUT",
  UNEXPECTED_TOKEN_TYPE: "UNEXPECTED_TOKEN_TYPE",
  NESTING_DEPTH_EXCEEDED: "NESTING_DEPTH_EXCEEDED",
  UNEXPECTED_END: "UNEXPECTED_END",
  UNEXPECTED_TRAILING_TOKEN: "UNEXPECTED_TRAILING_TOKEN",
  PARSE_ERROR: "PARSE_ERROR",
  TOO_MANY_NUMERIC_CONSTANTS: "TOO_MANY_NUMERIC_CONSTANTS",
  TOO_MANY_STRING_CONSTANTS: "TOO_MANY_STRING_CONSTANTS",
  NO_MATCHING_PHRASE_ALTERNATIVE: "NO_MATCHING_PHRASE_ALTERNATIVE",
  INVALID_PHRASE_PATTERN: "INVALID_PHRASE_PATTERN",
  PHRASE_KEYWORD_MISMATCH: "PHRASE_KEYWORD_MISMATCH",
  /** User-defined-function definition parsing (`f(x, y) = ...`) — an invalid token where a parameter name was expected. */
  USER_FUNCTION_INVALID_PARAM_NAME: "USER_FUNCTION_INVALID_PARAM_NAME",
  /** `f() = ...` with zero parameters — indistinguishable from a plain no-arg function call, so rejected at definition time. */
  USER_FUNCTION_NO_PARAMS: "USER_FUNCTION_NO_PARAMS",
  /** A user-defined function body calling an async plugin (weather/stocks/currency/...) — rejected at definition time; v1 scope excludes async function bodies. */
  FUNCTION_BODY_MUST_BE_SYNCHRONOUS: "FUNCTION_BODY_MUST_BE_SYNCHRONOUS",
  /** `BytecodeBuilder`'s `userFunctionBodies` side-table exceeding its capacity — same class as `TOO_MANY_NUMERIC_CONSTANTS`/`TOO_MANY_STRING_CONSTANTS` below. */
  TOO_MANY_FUNCTION_DEFINITIONS: "TOO_MANY_FUNCTION_DEFINITIONS",
  /** `BytecodeBuilder`'s `anonymousBodies` side-table (map/reduce inline transform bodies) exceeding its capacity — same class as `TOO_MANY_FUNCTION_DEFINITIONS` above. */
  TOO_MANY_ANONYMOUS_BODIES: "TOO_MANY_ANONYMOUS_BODIES",

  // ── VM (vm/VM.ts, vm/OpRegistry.ts, vm/VMBuiltins.ts) ──
  EVALUATION_ERROR: "EVALUATION_ERROR",
  INSTRUCTION_LIMIT_EXCEEDED: "INSTRUCTION_LIMIT_EXCEEDED",
  STACK_LIMIT_EXCEEDED: "STACK_LIMIT_EXCEEDED",
  /** New this phase — see `VM.ts`'s `safePop()`: a stack-underflow (corrupted bytecode, a buggy plugin) is now a controlled EngineError instead of a raw TypeError. Always `recoverable: false` (internal invariant violation). */
  STACK_UNDERFLOW: "STACK_UNDERFLOW",
  UNDEFINED_VARIABLE: "UNDEFINED_VARIABLE",
  /** New this phase — the Tier-2/`LOAD_GLOBAL_VAR` hardening: a global variable read before its async preflight resolved, surfaced as a controlled error instead of pushing `undefined`. */
  GLOBAL_VARIABLE_NOT_RESOLVED: "GLOBAL_VARIABLE_NOT_RESOLVED",
  UNKNOWN_FUNCTION: "UNKNOWN_FUNCTION",
  /** `unwrapEvalResult()`'s pending-when-expecting-value case — a caller-contract violation, not user-input. */
  UNEXPECTED_PENDING_RESULT: "UNEXPECTED_PENDING_RESULT",
  /** User-defined-function call/definition errors (`CALL_USER_FUNCTION`/`DEFINE_USER_FUNCTION` opcodes) — calling a name with no matching definition, calling with the wrong argument count, and the deliberate v1 restriction that a function body can't itself contain async work. */
  UNDEFINED_FUNCTION: "UNDEFINED_FUNCTION",
  FUNCTION_ARITY_MISMATCH: "FUNCTION_ARITY_MISMATCH",
  USER_FUNCTION_ASYNC_UNSUPPORTED: "USER_FUNCTION_ASYNC_UNSUPPORTED",
  /** A map/reduce transform body (inline expression or user-defined function) calling an async plugin — same v1 scope restriction as `USER_FUNCTION_ASYNC_UNSUPPORTED` above, enforced both at parse time (`MAP_REDUCE_TRANSFORM_MUST_BE_SYNCHRONOUS`, packages/mapreduce/) and as a defense-in-depth runtime backstop here. */
  MAP_REDUCE_ASYNC_UNSUPPORTED: "MAP_REDUCE_ASYNC_UNSUPPORTED",
  /** `pushCallFrame()`'s recursion guard — a nested `CALL_USER_FUNCTION` re-enters `executeBytecode()`, so `maxInstructions` alone can't catch e.g. `f(x) = f(x)`; this is the dedicated backstop. `recoverable: true` (the default for `.execution()`) — ordinary user-written infinite recursion, not an engine bug; the guard exists precisely so it surfaces as a clear error instead of overflowing the native call stack uncatchably. */
  FUNCTION_RECURSION_LIMIT_EXCEEDED: "FUNCTION_RECURSION_LIMIT_EXCEEDED",
  /** `DEFINE_USER_FUNCTION`'s body-index lookup failing — a compiler/VM invariant violation (the opcode stream referenced a `userFunctionBodies` slot that doesn't exist), never a user-input error. */
  INTERNAL_MISSING_FUNCTION_BODY: "INTERNAL_MISSING_FUNCTION_BODY",
  /** `MAP_INVOKE`/`REDUCE_INVOKE`'s anonymous-body-index lookup failing — same class as `INTERNAL_MISSING_FUNCTION_BODY` above, for the `anonymousBodies` side-table instead of `userFunctionBodies`. */
  INTERNAL_MISSING_ANONYMOUS_BODY: "INTERNAL_MISSING_ANONYMOUS_BODY",

  // ── Engine (engine/ExpressionEngine.ts, engine/ExpressionEngineSafety.ts, engine/AsyncResolutionBatcher.ts) ──
  EXPRESSION_TOO_LONG: "EXPRESSION_TOO_LONG",
  EXPRESSION_TOO_COMPLEX: "EXPRESSION_TOO_COMPLEX",
  NORMALIZED_TOKEN_LIMIT_EXCEEDED: "NORMALIZED_TOKEN_LIMIT_EXCEEDED",
  /** `"=>"` with nothing before it — needs an expression or variable name to solve/simplify. */
  THEREFORE_REQUIRES_EXPRESSION: "THEREFORE_REQUIRES_EXPRESSION",
  /** A `"=>"`-triggered expression called an async plugin (weather/stocks/currency) — same v1 scope restriction as user-function/map-reduce bodies. */
  THEREFORE_ASYNC_UNSUPPORTED: "THEREFORE_ASYNC_UNSUPPORTED",

  // ── Config (constants/Configuration.ts) ──
  CONFIG_PATH_NOT_FOUND: "CONFIG_PATH_NOT_FOUND",
  INVALID_CONFIG_PATH: "INVALID_CONFIG_PATH",
  CONFIG_SECTION_NOT_FOUND: "CONFIG_SECTION_NOT_FOUND",
  CONFIG_PROPERTY_NOT_FOUND: "CONFIG_PROPERTY_NOT_FOUND",

  // ── Package/lexer registration-time collisions (lexer/ExpressionLexer.ts) ──
  PLUGIN_OPERATOR_COLLISION: "PLUGIN_OPERATOR_COLLISION",
  PLUGIN_KEYWORD_COLLISION: "PLUGIN_KEYWORD_COLLISION",
  PLUGIN_UNIT_COLLISION: "PLUGIN_UNIT_COLLISION",
  /** A package's declared `IEnginePackage.engineVersion` semver range doesn't satisfy the running engine's ENGINE_VERSION — see api/EngineVersionCompatibility.ts. */
  PACKAGE_ENGINE_VERSION_MISMATCH: "PACKAGE_ENGINE_VERSION_MISMATCH",
  /** A package's declared `IEnginePackage.engineVersion` isn't a parseable semver range at all (a typo in the package's own descriptor). */
  PACKAGE_ENGINE_VERSION_INVALID_RANGE: "PACKAGE_ENGINE_VERSION_INVALID_RANGE",
  /** `OpRegistry.allocateOpcode()`'s dynamic opcode pool (started at 201) exhausted — too many packages calling it. */
  OPCODE_POOL_EXHAUSTED: "OPCODE_POOL_EXHAUSTED",
  /** `VMBuiltins.allocatePluginFunctionIndex()`'s 0-255 index pool (a single opcode-stream byte) exhausted. */
  PLUGIN_FUNCTION_INDEX_POOL_EXHAUSTED: "PLUGIN_FUNCTION_INDEX_POOL_EXHAUSTED",

  // ── vm/Value.ts caller-contract violations (check isRateUnit()/isTimecodeUnit() first) ──
  INVALID_RATE_UNIT: "INVALID_RATE_UNIT",
  INVALID_TIMECODE_UNIT: "INVALID_TIMECODE_UNIT",

  // ── errors/EngineError.ts's own fallback normalization ──
  UNEXPECTED_ERROR: "UNEXPECTED_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

export type CoreErrorCode = (typeof CoreErrorCodes)[keyof typeof CoreErrorCodes];

/**
 * The aggregated catalog type. Currently just `CoreErrorCode` — union in
 * each package's own code-object type here as Phase 5 converts it, e.g.
 * `CoreErrorCode | WeatherErrorCode | StocksErrorCode | ...`.
 */
export type ErrorCode = CoreErrorCode;
