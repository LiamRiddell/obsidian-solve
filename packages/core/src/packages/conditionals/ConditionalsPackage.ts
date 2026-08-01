import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";
import { ComparisonParselet } from "./parselets/ComparisonParselet";
import { LogicalParselet } from "./parselets/LogicalParselet";
import { BooleanLiteralParselet } from "./parselets/BooleanLiteralParselet";
import { IfThenElseParselet } from "./parselets/IfThenElseParselet";

/**
 * Comparisons (`==`, `!=`, `<`, `>`, `<=`, `>=`), boolean logic (`true`/
 * `false`, `and`/`or`/`&&`/`||`), and `if <cond> then <val> else <val>`
 * eager-ternary conditionals.
 *
 * The `and`/`or` split is deliberate, not an oversight: "and" already
 * lexes as `PLUS` (a pre-existing arithmetic word-synonym, `en.ts`:
 * `and: "PLUS"`), a Tier-1 hardcoded infix operator no registry-based
 * parselet can intercept — `OpCode.ADD`'s own VM handler special-cases
 * `Boolean && Boolean` instead (see `vm/VM.ts`). "or"/"&&"/"||" have no
 * such collision and are handled normally here via `LogicalParselet`.
 *
 * KNOWN LIMITATION: because "and" is pinned to `PLUS`'s Tier-1 binding
 * power (`Sum`, tighter than comparisons), an unparenthesized `X >= Y and
 * Z < W` does NOT parse as `(X >= Y) and (Z < W)` — "and"'s fixed
 * precedence grabs a comparison operand instead. Use `&&` (correct,
 * dedicated `LogicalAnd` precedence — looser than comparisons) for that
 * pattern, or wrap each side in parens if "and" is preferred:
 * `(X >= Y) and (Z < W)`. "and" alone (no comparisons in the same
 * unparenthesized expression) works fine, e.g. `discount and hasCoupon`.
 *
 * SCOPE DECISION: SoulverCore-style postfix `Y if X` / `Y unless X` (a
 * ternary with no explicit else-branch) is deliberately NOT implemented.
 * This VM's `Value` has no "empty"/"void" representation for the
 * false-branch case (every expression must produce a concrete typed
 * result) — building it properly would mean adding a new sentinel
 * `ValueType` and deciding how every consumer (formatting, DAG
 * propagation, UOM/arithmetic ops) treats it, which is a bigger call than
 * this package should make implicitly. `if X then Y else Z` (both
 * branches required) covers the same need unambiguously today.
 */
export const CONDITIONALS_PACKAGE: IEnginePackage = {
  name: "solve-conditionals",
  prefixParselets: [
    { tokenType: "TRUE", parselet: new BooleanLiteralParselet(true) },
    { tokenType: "FALSE", parselet: new BooleanLiteralParselet(false) },
    { tokenType: "IF", parselet: new IfThenElseParselet() },
  ],
  infixParselets: [
    { tokenType: "EQUALITY", parselet: new ComparisonParselet(OpCode.EQ) },
    { tokenType: "NEQ", parselet: new ComparisonParselet(OpCode.NEQ) },
    { tokenType: "LT", parselet: new ComparisonParselet(OpCode.LT) },
    { tokenType: "GT", parselet: new ComparisonParselet(OpCode.GT) },
    { tokenType: "LTE", parselet: new ComparisonParselet(OpCode.LTE) },
    { tokenType: "GTE", parselet: new ComparisonParselet(OpCode.GTE) },
    { tokenType: "OR", parselet: new LogicalParselet(OpCode.LOGICAL_OR, BindingPower.LogicalOr) },
    { tokenType: "LOGICAL_AND", parselet: new LogicalParselet(OpCode.LOGICAL_AND, BindingPower.LogicalAnd) },
    { tokenType: "LOGICAL_OR", parselet: new LogicalParselet(OpCode.LOGICAL_OR, BindingPower.LogicalOr) },
  ],
};
