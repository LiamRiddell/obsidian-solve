import type { BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";

/**
 * A user-defined, parameterized, reusable function (`f(x) = 2*x + 1`, then
 * `f(5)` -> `11`) — Calca-parity Phase 1 (see `OTHER_APPS_FEATURE_AUDIT.md`'s
 * Calca section and its "no mechanism for user-defined, parameterized,
 * reusable functions" confirmed-limitation writeup, now being closed).
 *
 * `program` is the function BODY compiled to its own small, independent
 * `BytecodeProgram` — NOT a fragment of the definition line's own bytecode.
 * Every `LOAD_VAR <name>` the body's ordinary parsing would have produced
 * for a parameter name has already been rewritten to `LOAD_PARAM <index>`
 * (see `UserFunctionParselet.ts`'s definition-parsing path) — the body
 * program never touches `vm.getVar()`/the shared variable store for its own
 * parameters, only for genuinely free identifiers (which, today, resolve as
 * "undefined variable" the same as anywhere else — Phase 1 doesn't add
 * closures/lexical capture over outer variables).
 */
export interface UserFunctionDefinition {
  params: string[];
  program: BytecodeProgram;
}

/**
 * Shared, module-level registry — matches the SAME accepted tradeoff as
 * `vm/GlobalVariableStore.ts`/`vm/VMBuiltins.ts`'s `pluginFunctionRegistry`
 * (see `ARCHITECTURE.md` §10's L1 cross-instance-isolation gap): safe today
 * because every `ExpressionEngine` instance registers the same built-in
 * packages, not safe to assume isolation between two engines with
 * genuinely different package sets in the same process. Not a new
 * regression Phase 1 introduces — an existing, disclosed, already-tracked
 * tradeoff this feature inherits rather than one it invents.
 *
 * Definitions register at PARSE time (the instant `UserFunctionParselet`
 * parses a `name(params) = body` line), not at VM-execution time — this
 * deliberately matches how `ScopeManager` already resolves a variable read
 * "as of a given line number" against the closest PRECEDING definition, not
 * a document-wide forward-reference: calling `f(5)` on a line BEFORE `f`'s
 * own definition line falls through to the pre-existing "unknown
 * identifier" behavior, exactly as an undefined `:variable` read would.
 * Redefining a name overwrites its previous definition outright (matches
 * `:name = value`'s own reassignment semantics).
 */
export const userFunctionRegistry = new Map<string, UserFunctionDefinition>();

/** True if `name` is currently a registered user-defined function. */
export function isUserFunction(name: string): boolean {
  return userFunctionRegistry.has(name);
}
