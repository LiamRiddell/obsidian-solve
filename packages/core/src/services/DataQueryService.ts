/**
 * QueryClient factory for the solve-js engine.
 *
 * Creates a TanStack Query QueryClient with sensible defaults for
 * stale-while-revalidate, garbage collection, and retry behavior.
 * The QueryClient is injected into resolvers via the engine, so
 * no global singleton is needed.
 *
 * Removed in this refactor:
 * - DataQueryWorker (worker thread) — doesn't solve anything in Obsidian's single-threaded env
 * - localCache (raw Map) — replaced by TanStack Query's built-in cache
 * - pendingQueries (manual promise plumbing) — TanStack Query handles dedup
 * - DataSourceHandle, registerDataSource, unregisterDataSource — no longer needed
 * - cleanupCache timer — TanStack Query's gc does this automatically
 * - cacheUpdateListeners / errorListeners — TanStack Query has its own observer API
 */

import { QueryClient } from "@tanstack/query-core";

// ── Active query client (execution context) ───────────────────────────────
// Synchronous VM plugin functions (dispatched via CALL_PLUGIN) can't receive
// the engine's QueryClient through their (args) => Value ABI, so the engine
// publishes the client here before each execution and package handlers read
// it back. This module is the package-agnostic home for that hand-off —
// the engine must not import from a specific package (e.g. packages/osrs)
// to wire it.

let _activeQueryClient: QueryClient | null = null;

/** Publish the QueryClient for the execution about to run. Set by the engine. */
export function setActiveQueryClient(qc: QueryClient | null): void {
  _activeQueryClient = qc;
}

/** Read the QueryClient of the currently executing engine, if any. */
export function getActiveQueryClient(): QueryClient | null {
  return _activeQueryClient;
}

/**
 * Create a new TanStack Query QueryClient with project defaults.
 * Each engine instance gets its own client for isolation.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,       // 5 minutes
        gcTime: 10 * 60 * 1000,          // 10 minutes
        retry: 3,
        retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 5000),
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,       // Not relevant in Obsidian plugin context
      },
    },
  });
}
