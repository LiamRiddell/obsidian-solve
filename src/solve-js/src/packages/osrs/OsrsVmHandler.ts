import type { QueryClient } from "@tanstack/query-core";
import { uomValue, type Value } from "@solve-js/vm/Value";
import { OSRS_ITEM_NAME_TO_ID, osrsItemQueryKey } from "./OsrsItemVocabulary";
import { pluginFunctionRegistry } from "@solve-js/vm/VMBuiltins";
import { OSRS_PLUGIN_FN_IDX } from "./OsrsParselet";

/**
 * OSRS game item resolver — registered in pluginFunctionRegistry at
 * OSRS_PLUGIN_FN_IDX and dispatched via CALL_PLUGIN opcode.
 *
 * Reads item prices from TanStack Query cache (stored by OsrsAsyncResolver
 * after the bulk fetch completes). Returns synchronously — the preflight
 * check ensures prices are cached before the VM runs.
 */
function resolveGameItem(args: Value[]): Value {
  const itemName = args[0].value as string;
  const itemId = OSRS_ITEM_NAME_TO_ID.get(itemName.toLowerCase());

  if (itemId !== undefined) {
    const cached = _activeQueryClient?.getQueryData(osrsItemQueryKey(itemId));
    if (cached !== undefined) return cached as Value;
  }

  return uomValue(0, "gp");
}

// ── QueryClient injection ──
// Set by ExpressionEngine before VM execution so the handler can read
// from the same QueryClient that the resolver writes to.

let _activeQueryClient: QueryClient | null = null;

export function setOsrsQueryClient(qc: QueryClient | null): void {
  _activeQueryClient = qc;
}

export function registerOsrsPluginFunction(): void {
  pluginFunctionRegistry[OSRS_PLUGIN_FN_IDX] = resolveGameItem;
}

export function unregisterOsrsPluginFunction(): void {
  delete pluginFunctionRegistry[OSRS_PLUGIN_FN_IDX];
}
