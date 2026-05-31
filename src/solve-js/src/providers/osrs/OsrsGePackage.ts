/**
 * OSRS Grand Exchange price lookup package.
 *
 * Provides `ge("Item name")` and `price("Item name")` syntax for querying
 * Old School RuneScape Grand Exchange prices via the free OSRS Wiki REST API.
 *
 * ## Architecture
 *
 * This package demonstrates the full plugin integration surface:
 *
 * **1. Lexer Plugin** — Registers `ge` and `price` as keywords.
 * When the lexer encounters these identifiers, it emits a `GE` token
 * instead of `IDENT`. No lexer core changes needed.
 *
 * **2. Prefix Parselet** — `GeLookupParselet` handles the `GE` token.
 * Parses `ge("Abyssal whip")` and compiles to CALL_PLUGIN bytecode:
 * ```
 *   PUSH_STRING "Abyssal whip"
 *   CALL_PLUGIN <fnIdx> 1
 * ```
 *
 * **3. VM Plugin Function** — Registered in `pluginFunctionRegistry` at
 * `OSRS_GE_FN_INDEX`. Two-phase execution:
 *   - **Sync cache hit**: returns `numberValue(price)` immediately
 *   - **Async cache miss**: returns `Promise<Value>`, VM detects and
 *     returns `{ type: 'pending' }`. The engine re-evaluates when resolved.
 *
 * **4. No ResolverRegistry needed** — CALL_PLUGIN handles the full async
 * lifecycle natively. This is simpler than the currency resolver's
 * preflight approach and suitable for packages where async data is
 * triggered by function calls, not by opcode-level inline operations.
 *
 * ## Usage
 *
 * ```typescript
 * import { solve } from "@solve-js/api/SolveAPI";
 * import { OSRS_GE_PACKAGE } from "@solve-js/providers/osrs/OsrsGePackage";
 *
 * solve.registerPackage(OSRS_GE_PACKAGE);
 *
 * // Now users can write:
 * //   ge("Abyssal whip")          → 1,234,567 (current GE price)
 * //   ge("Dragon bones") * 100   → price × quantity
 * //   price("Rune scimitar")      → same as ge(...)
 * ```
 *
 * ## Data Flow
 *
 * ```
 *  ┌──────────────┐    ┌─────────────┐    ┌───────────────┐
 *  │ LexerPlugin  │ →  │ GeLookup    │ →  │ CALL_PLUGIN   │
 *  │ ge → "GE"    │    │ Parselet    │    │ opcode in VM  │
 *  └──────────────┘    └─────────────┘    └───────┬───────┘
 *                                                 │
 *                         ┌───────────────────────┘
 *                         ▼
 *               ┌────────────────────┐
 *               │ pluginFunctionReg  │
 *               │ [OSRS_GE_FN_INDEX] │
 *               └────────┬───────────┘
 *                        │
 *              ┌─────────┴─────────┐
 *              ▼                   ▼
 *     ┌──────────────┐    ┌──────────────┐
 *     │ getCached    │    │ fetchGePrice │
 *     │ Price() sync │    │ () async     │
 *     └──────┬───────┘    └──────┬───────┘
 *            │                   │
 *            ▼                   ▼
 *     numberValue(price)   Promise<Value>
 *     (immediate)          → VM returns pending
 *                          → AsyncResolutionBatcher
 *                          → re-evaluate → sync cache hit
 * ```
 *
 * ## Cache Strategy
 *
 * - **Mapping cache**: item name → ID, refreshed every 30 minutes
 * - **Price cache**: ID → latest price, 60-second TTL
 * - **Bulk endpoint**: /latest returns ALL prices in one request —
 *   looking up any item populates the entire price cache, so subsequent
 *   lookups for other items are instant cache hits
 * - **Request deduplication**: in-flight requests are tracked, concurrent
 *   lookups for the same endpoint share a single HTTP request
 * - **Rate limiting**: no hard throttle (OSRS Wiki has no published limit),
 *   but bulk endpoint means we hit the API at most once per 60 seconds
 *
 * @packageDocumentation
 */

import type { ISolvePackage } from "@solve-js/api/SolveAPI";
import { GeLookupParselet } from "@solve-js/providers/osrs/parselets/GeLookupParselet";
import { createGeFunction } from "@solve-js/providers/osrs/OsrsGeFunction";
import { pluginFunctionRegistry } from "@solve-js/vm/VMBuiltins";

/**
 * Plugin function registry index for the OSRS GE lookup function.
 *
 * Allocated from the plugin range (1000–1999) to avoid collision with
 * built-in functions (0–37) and test indices (100–250).
 *
 * FUTURE: Replace with dynamic allocation via {@link DomainRegistry}
 * when the plugin infrastructure is formalized.
 */
export const OSRS_GE_FN_INDEX = 1000;

/**
 * The complete OSRS Grand Exchange package.
 *
 * Register with the SolveAPI to enable `ge(...)` / `price(...)` syntax:
 *
 * ```typescript
 * solve.registerPackage(OSRS_GE_PACKAGE);
 * ```
 */
export const OSRS_GE_PACKAGE: ISolvePackage = {
	name: "osrs-grand-exchange",

	/**
	 * Lexer plugin: registers `ge` and `price` as keyword tokens.
	 * The ExpressionLexer tokenizes them as `GE` instead of `IDENT`,
	 * and the parser uses the prefix parselet below to handle them.
	 */
	lexerPlugin: {
		keywords: {
			ge: "GE",
			price: "GE",
		},
	},

	/**
	 * Prefix parselet: handles `GE` token → compiles to CALL_PLUGIN bytecode.
	 * The parselet reads the function index from OSRS_GE_FN_INDEX at
	 * construction time, embedding it into the compiled bytecode.
	 */
	prefixParselets: [
		{
			tokenType: "GE",
			parselet: new GeLookupParselet(OSRS_GE_FN_INDEX, "GE"),
		},
	],
};

/**
 * Initialize the OSRS GE package.
 *
 * Registers the async lookup function in {@link pluginFunctionRegistry}
 * and registers the package with the shared SolveAPI.
 *
 * Called once at application startup or when the OSRS plugin is enabled.
 * Safe to call multiple times — idempotent.
 */
export function initializeOsrsGe(): void {
	// Register the VM plugin function (idempotent — overwrite is safe,
	// the function is stateless aside from the module-level caches)
	pluginFunctionRegistry[OSRS_GE_FN_INDEX] = createGeFunction();
}

// ── Auto-initialize at module load ──────────────────────────────────────
// Registering the VM function as a side-effect ensures that simply importing
// OSRS_GE_PACKAGE (or adding it to BUILTIN_PACKAGES) is sufficient — no
// separate initializeOsrsGe() call needed. The function is idempotent,
// so repeated imports (e.g., hot-reload in dev) are safe.
initializeOsrsGe();
