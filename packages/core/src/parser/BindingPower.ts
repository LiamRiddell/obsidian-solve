/**
 * Named precedence levels for the Pratt parser, from loosest (`Lowest`) to
 * tightest (`Call`) binding. A custom infix parselet compares its own
 * binding power against the current expression's to decide whether to
 * consume the next operator (higher power binds tighter, e.g. `*` over `+`).
 *
 * Package authors reference these when registering an infix parselet via
 * `IPackageRegistry.registerInfixParselet` — see the built-in packages for
 * examples of picking an appropriate level (e.g. arithmetic `+`/`-` use
 * `Sum`, `*`/`/` use `Product`).
 */
export const BindingPower = {
  Lowest: 0,
  Assignment: 10,
  LogicalOr: 12,   // `or`, `||` — loosest of the boolean-logic operators
  LogicalAnd: 14,  // `&&` — binds tighter than `or` ("a or b and c" = "a or (b and c)")
  Conditional: 20, // comparisons (`==`, `<`, `>=`, ...) — tighter than and/or, looser than arithmetic
  Sum: 30,
  BitwiseXor: 35,
  Product: 40,
  Exponent: 50,
  Prefix: 60,
  Postfix: 70,
  Call: 80,
} as const;

export function setBindingPower(name: string, power: number): void {
  (BindingPower as Record<string, number>)[name] = power;
}

export function getBindingPower(name: string): number {
  return (BindingPower as Record<string, number>)[name] ?? 0;
}

// ── Built-in Infix Operator Binding Power Table ──────────────────────────────
// Pre-computed Uint8Array lookup indexed by token typeId.
// value > 0  → built-in infix operator with that binding power
// value = 0  → not a built-in infix — fall through to Tier 2 parselet registry
//
// Built at module load via buildBindingPowerTable(). The table is sparse —
// most entries are 0 since only ~15 of 80+ token types are infix operators.
//
// Performance: Uint8Array[typeId] is a single typed array load — no Map.get(),
// no string hashing, no property chain. V8 eliminates bounds checks when typeId
// is known to be within array length.

import { TokenTypes } from "@solve-js/lexer/Token";
import { tokenTypeId } from "@solve-js/lexer/Token";

/**
 * Mapping of token type names → binding powers for built-in infix operators.
 * Only operators listed here get the Tier 1 fast path in PrecedenceParser.
 * All other infix tokens use the Tier 2 parselet registry fallback.
 */
const BUILTIN_INFIX_BP: Record<string, number> = {
  // Arithmetic (infix, left-associative)
  [TokenTypes.PLUS]:     BindingPower.Sum,
  [TokenTypes.MINUS]:    BindingPower.Sum,
  [TokenTypes.STAR]:     BindingPower.Product,
  [TokenTypes.SLASH]:    BindingPower.Product,
  [TokenTypes.MOD]:      BindingPower.Product,

  // Arithmetic (infix, RIGHT-associative — PrecedenceParser handles this specially)
  [TokenTypes.CARET]:    BindingPower.Exponent,

  // Bitwise (infix, left-associative)
  [TokenTypes.LSHIFT]:   BindingPower.BitwiseXor,
  [TokenTypes.RSHIFT]:   BindingPower.BitwiseXor,
  [TokenTypes.BIT_AND]:  BindingPower.BitwiseXor,
  [TokenTypes.BIT_OR]:   BindingPower.BitwiseXor,
  [TokenTypes.BIT_XOR]:  BindingPower.BitwiseXor,

  // Postfix (no right operand — PrecedenceParser handles this specially)
  [TokenTypes.PERCENT]:  BindingPower.Postfix,

  // Percentage keyword (infix, left-associative: "50% of 200" → MUL)
  [TokenTypes.OF]:       BindingPower.Product,
};

// Note: These token types are intentionally NOT in the BP_TABLE — they stay in
// the Tier 2 parselet registry because they require complex handling:
//   IN, TO    → UoM conversion parselets (peek at target unit token, complex logic)
//   DOT       → Property access (chained OBJ_GET, needs left-token tracking)
//   EQUALS    → Assignment (VariableParselet handles :var = expr pattern)
//   EQUALITY, NEQ, GTE, LTE → Comparison ops (need dedicated VM opcodes — task 2.15a)
//   COMMA     → Argument separator (function calls, array/object literals)

/** Cached BP_TABLE — built once at module load, immutable thereafter. */
let _bpTable: Uint8Array | null = null;

/**
 * Build the Uint8Array binding power table indexed by token typeId.
 * Idempotent — returns cached table on subsequent calls.
 *
 * Must be called after all token types are registered (via registerAllTokenTypes())
 * and after plugin providers have registered their token types.
 */
export function buildBindingPowerTable(): Uint8Array {
  if (_bpTable) return _bpTable;

  // Size to the largest registered typeId + 1
  let maxId = 0;
  for (const name of Object.keys(BUILTIN_INFIX_BP)) {
    const id = tokenTypeId(name);
    if (id > maxId) maxId = id;
  }
  // Also scan all TokenTypes to ensure table covers all registered IDs
  for (const name of Object.values(TokenTypes)) {
    const id = tokenTypeId(name);
    if (id > maxId) maxId = id;
  }

  const table = new Uint8Array(maxId + 1);
  for (const [name, bp] of Object.entries(BUILTIN_INFIX_BP)) {
    const id = tokenTypeId(name);
    table[id] = bp;
  }

  _bpTable = table;
  return table;
}

/**
 * Invalidate the cached BP table — call when plugins register new token types
 * that should participate in the built-in fast path.
 */
export function invalidateBindingPowerTable(): void {
  _bpTable = null;
}
