import type { QueryClient } from "@tanstack/query-core";
import type { Token } from "@solve-js/lexer";
import type { BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { uomValue, type Value } from "@solve-js/vm/Value";
import type { IAsyncResolver, AsyncCheckResult } from "@solve-js/resolvers/ResolverRegistry";
import { OSRS_ITEM_NAME_TO_ID, osrsItemQueryKey } from "./OsrsItemVocabulary";
import { OSRS_PLUGIN_FN_IDX } from "./OsrsParselet";

const OSRS_BULK_KEY = ["osrs", "bulk"];

/**
 * Async resolver for OSRS Grand Exchange prices.
 *
 * Uses TanStack Query (injected via queryClient) as the single cache layer.
 * preflight() checks queryClient.getQueryData() before VM execution.
 * If items are uncached, returns an AsyncCheckResult that triggers
 * queryClient.fetchQuery() to the Grand Exchange API.
 *
 * Per-item prices are stored under ["osrs", "item", <id>] query keys
 * for synchronous VM handler reads. The bulk fetch goes under ["osrs", "bulk"].
 */
export class OsrsAsyncResolver implements IAsyncResolver {
  readonly namespace = "osrs";

  preflight(
    _tokens: Token[],
    bytecode: BytecodeProgram,
    packageId: string,
    signal: AbortSignal,
    queryClient: QueryClient,
  ): AsyncCheckResult | null {
    const { opcodes, strings } = bytecode;
    const len = opcodes.length;

    // ── Collect all OSRS item IDs referenced in this bytecode ──
    const itemIds: number[] = [];
    let i = 0;

    while (i < len) {
      const op = opcodes[i] as OpCode;

      if (op === OpCode.CALL_PLUGIN) {
        if (i + 2 < len) {
          const fnIdx = opcodes[i + 1];
          const argCount = opcodes[i + 2];

          if (fnIdx === OSRS_PLUGIN_FN_IDX && argCount >= 1 && i >= 2 && opcodes[i - 2] === OpCode.PUSH_STRING) {
            const stringIdx = opcodes[i - 1];
            const itemName = strings[stringIdx];
            const itemId = OSRS_ITEM_NAME_TO_ID.get(itemName.toLowerCase());

            if (itemId !== undefined) {
              itemIds.push(itemId);
            }
          }

          i += 3;
          continue;
        }
      }

      switch (op) {
        case OpCode.PUSH_NUMBER: case OpCode.PUSH_BIGINT: case OpCode.PUSH_HEX:
        case OpCode.PUSH_STRING: case OpCode.PUSH_BOOLEAN:
        case OpCode.LOAD_VAR: case OpCode.STORE_VAR:
          i += 2; break;
        case OpCode.CALL_PLUGIN: case OpCode.CALL_BUILTIN:
          i += 3; break;
        case OpCode.ARR_NEW:
          i += 2; break;
        default:
          i++; break;
      }
    }

    if (itemIds.length === 0) return null;

    // ── Check if all referenced items are in TanStack Query cache ──
    let allCached = true;
    for (const id of itemIds) {
      if (queryClient.getQueryData(osrsItemQueryKey(id)) === undefined) {
        allCached = false;
        break;
      }
    }
    if (allCached) return null;

    // ── Uncached — fetch via TanStack Query (dedup + retry automatic) ──
    const firstItemId = itemIds[0];
    const cachedItemIds = new Set(itemIds);

    // TanStack Query automatically deduplicates concurrent fetchQuery calls
    // for the same queryKey — no manual isInFlight tracking needed.
    const resolver = queryClient.fetchQuery({
      queryKey: osrsItemQueryKey(firstItemId),
      queryFn: ({ signal: qSignal }) => {
        return fetchOsrsBulkPrices(qSignal).then((prices) => {
          // Fan out bulk result into per-item query cache entries.
          // Skip the primary item (firstItemId) — TanStack Query handles
          // that one natively via the fetchQuery return value. Calling
          // setQueryData on the same queryKey that fetchQuery manages
          // causes a state inconsistency where fetchStatus stays "fetching".
          for (const id of cachedItemIds) {
            if (id === firstItemId) continue;
            const price = prices[id.toString()] ?? 0;
            queryClient.setQueryData(osrsItemQueryKey(id), uomValue(price, "gp"));
          }
          const price = prices[firstItemId.toString()] ?? 0;
          return uomValue(price, "gp");
        }).catch((err) => {
          console.warn("[osrs-solve] Bulk price fetch failed:", err);
          // Store 0 gp for all OTHER items so re-evaluation doesn't loop.
          // Skip the primary item — TanStack Query handles it via the
          // fetchQuery return value (same setQueryData avoidance as above).
          // Tag the fallback so the playground can show a timeout indicator.
          for (const id of cachedItemIds) {
            if (id === firstItemId) continue;
            const fallback = uomValue(0, "gp");
            fallback.timedOut = true;
            queryClient.setQueryData(osrsItemQueryKey(id), fallback);
          }
          const result = uomValue(0, "gp");
          result.timedOut = true;
          return result;
        });
      },
      staleTime: 5 * 60 * 1000, // 5 min — prices change infrequently
    });

    return {
      queryKey: osrsItemQueryKey(firstItemId).join(":"),
      resolver,
      packageId,
      signal,
      metadata: { itemCount: itemIds.length, firstItemId },
    };
  }

  destroy(): void {
    // Cache cleared by ResolverRegistry.unregister() via removeQueries({ queryKey: ["osrs"] })
  }
}

// ── Internal: fetch OSRS bulk prices from the Grand Exchange API ──

const OSRS_API_URL = "https://prices.runescape.wiki/api/v1/osrs/latest";

/**
 * Timeout (ms) for OSRS bulk price fetches.
 *
 * If the Grand Exchange API doesn't respond within this window, the fetch
 * is aborted and the resolver falls back to 0 gp — preventing indefinite
 * "Pending" states in the playground and Obsidian plugin.
 */
const OSRS_FETCH_TIMEOUT_MS = 10_000;

async function fetchOsrsBulkPrices(signal: AbortSignal): Promise<Record<string, number>> {
  // Combine the caller's abort signal with a hard timeout so a hanging
  // OSRS API never blocks re-evaluation indefinitely.
  //
  // We manually multiplex two signals into one AbortController rather than
  // using AbortSignal.any() (Chrome 116+) to stay compatible with the
  // TypeScript lib targets used by this project.
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(new DOMException(`OSRS API fetch timed out after ${OSRS_FETCH_TIMEOUT_MS}ms`, "TimeoutError")),
    OSRS_FETCH_TIMEOUT_MS,
  );

  // When the caller's signal aborts (e.g. keystroke-level cancel), propagate
  // the abort to our controller so the in-flight fetch is cancelled.
  const onCallerAbort = () => {
    clearTimeout(timeoutId);
    try { controller.abort(signal.reason); } catch { /* already aborted */ }
  };
  signal.addEventListener("abort", onCallerAbort, { once: true });

  try {
    const response = await fetch(OSRS_API_URL, { signal: controller.signal });
    if (!response.ok) throw new Error(`OSRS API returned ${response.status}`);
    const json = await response.json();
    const data = json?.data as Record<string, { high: number; low: number }> | undefined;
    if (!data) return {};

    const prices: Record<string, number> = {};
    for (const [id, price] of Object.entries(data)) {
      // Use average of high/low for a fair price estimate
      prices[id] = Math.round((price.high + price.low) / 2);
    }
    return prices;
  } finally {
    clearTimeout(timeoutId);
    signal.removeEventListener("abort", onCallerAbort);
  }
}
