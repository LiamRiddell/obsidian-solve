import type { QueryClient } from "@tanstack/query-core";
import { uomValue, type Value } from "@solve-js/vm/Value";
import { OSRS_ITEM_NAME_TO_ID, osrsItemQueryKey } from "./OsrsItemVocabulary";
import { pluginFunctionRegistry } from "@solve-js/vm/VMBuiltins";
import { OSRS_PLUGIN_FN_IDX } from "./OsrsParselet";
import { getActiveQueryClient, setActiveQueryClient } from "@solve-js/services/DataQueryService";

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
    const cached = getActiveQueryClient()?.getQueryData(osrsItemQueryKey(itemId));
    if (cached !== undefined) return cached as Value;
  }

  return uomValue(0, "gp");
}

/**
 * @deprecated The engine now publishes its QueryClient via the
 * package-agnostic setActiveQueryClient in services/DataQueryService.
 * Kept as a thin alias for tests/back-compat.
 */
export function setOsrsQueryClient(qc: QueryClient | null): void {
  setActiveQueryClient(qc);
}

export function registerOsrsPluginFunction(): void {
  pluginFunctionRegistry[OSRS_PLUGIN_FN_IDX] = resolveGameItem;
}

export function unregisterOsrsPluginFunction(): void {
  delete pluginFunctionRegistry[OSRS_PLUGIN_FN_IDX];
}
