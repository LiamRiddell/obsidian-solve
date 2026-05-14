/**
 * Production-grade data query service with worker orchestration
 * Refactored to act as a Virtual Query Client orchestrating a background worker
 */

import { QueryClient, QueryObserver, QueryFunctionContext } from "@tanstack/query-core";
import { DataSourceConfig, FetchRequest, FetchResponse } from "@/workers/DataQueryWorker";

// Re-export types from DataQueryWorker
export type { DataSourceConfig };

// ============================================================================
// SERVICE TYPES & INTERFACES
// ============================================================================

export interface ServiceConfig {
  useWorker: boolean;
  workerUrl: string;
  maxConcurrentQueries: number;
  cacheSize: number;
}

export interface DataSourceHandle {
  id: string;
  config: DataSourceConfig;
  get: (queryKey: string[]) => Promise<any>;
  getSync: (queryKey: string[]) => any | null;
  refresh: () => void;
  destroy: () => void;
}

// ============================================================================
// MAIN SERVICE IMPLEMENTATION
// ============================================================================

export class DataQueryService {
  private worker: Worker | null = null;
  private config: ServiceConfig;
  private queryClient: QueryClient;
  private dataSources: Map<string, DataSourceHandle> = new Map();
  private localCache: Map<string, { data: any; timestamp: number }> = new Map();
  private pendingQueries: Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void; dataSourceId: string; queryKey: string[] }> =
    new Map();
  private queryCount = 0;
  
  // Event listeners for cache updates
  private cacheUpdateListeners: Set<(dataSourceId: string, queryKey: string[], data: any) => void> = new Set();
  // Event listeners for errors
  private errorListeners: Set<(dataSourceId: string, queryKey: string[], error: string) => void> = new Set();

  constructor(config: Partial<ServiceConfig> = {}) {
    this.config = {
      useWorker: true,
      workerUrl: this.getWorkerUrl(),
      maxConcurrentQueries: 100,
      cacheSize: 1000,
      ...config,
    };

    // Initialize TanStack Query Client
    this.queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5 * 60 * 1000, // 5 minutes
          gcTime: 10 * 60 * 1000, // 10 minutes
          retry: 3,
          retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 5000),
          refetchOnWindowFocus: false,
          refetchOnReconnect: true,
        },
      },
    });

    if (this.config.useWorker && typeof Worker !== "undefined") {
      this.initializeWorker();
    }

    // Start cache cleanup
    setInterval(() => this.cleanupCache(), 30000); // Every 30 seconds
  }

  private getWorkerUrl(): string {
    // Check if we're in a playground environment
    if (typeof window !== 'undefined' && window.location.pathname.includes('playground')) {
      return new URL('../playground/src/data-query.worker.ts', window.location.href).href;
    }
    // Default worker path for the plugin
    return "/workers/DataQueryWorker.ts";
  }

  // ------------------------------------------------------------------------
  // WORKER INITIALIZATION
  // ------------------------------------------------------------------------

  private initializeWorker(): void {
    try {
      this.worker = new Worker(this.config.workerUrl, { type: "module" });
      
      this.worker.onmessage = this.handleWorkerMessage.bind(this);
      this.worker.onerror = this.handleWorkerError.bind(this);
      
      console.log("[DataQueryService] Worker initialized successfully");
    } catch (error) {
      console.error("[DataQueryService] Failed to initialize worker:", error);
      this.config.useWorker = false;
    }
  }

  private handleWorkerMessage(event: MessageEvent): void {
    const { type, payload } = event.data;

    switch (type) {
      case "FETCH_RESPONSE":
        this.handleFetchResponse(payload);
        break;

      case "FETCH_ERROR":
        this.handleFetchError(payload);
        break;

      case "DATA_SOURCE_REGISTERED":
        console.log("[DataQueryService] Data source registered:", payload.config.id);
        break;

      case "PLUGIN_REGISTERED":
        console.log("[DataQueryService] Plugin registered:", payload.pluginId);
        break;

      case "ERROR":
        console.error("[DataQueryService] Worker error:", payload);
        break;
    }
  }

  private handleWorkerError(error: ErrorEvent): void {
    console.error("[DataQueryService] Worker error:", error);
    // Fallback to main thread execution
    this.config.useWorker = false;
  }

  // ------------------------------------------------------------------------
  // DATA SOURCE MANAGEMENT
  // ------------------------------------------------------------------------

  registerDataSource(config: DataSourceConfig): DataSourceHandle {
    const handle: DataSourceHandle = {
      id: config.id,
      config,
      get: (queryKey) => this.get(config.id, queryKey),
      getSync: (queryKey) => this.getSync(config.id, queryKey),
      refresh: () => this.refreshDataSource(config.id),
      destroy: () => this.unregisterDataSource(config.id),
    };

    this.dataSources.set(config.id, handle);

    // Register with worker if available
    if (this.worker) {
      this.worker.postMessage({
        type: "REGISTER_DATA_SOURCE",
        payload: config,
      });
    }

    return handle;
  }

  unregisterDataSource(dataSourceId: string): void {
    const handle = this.dataSources.get(dataSourceId);
    if (handle) {
      this.dataSources.delete(dataSourceId);

      if (this.worker) {
        this.worker.postMessage({
          type: "UNREGISTER_DATA_SOURCE",
          payload: { dataSourceId },
        });
      }
    }
  }

  // ------------------------------------------------------------------------
  // PLUGIN MANAGEMENT
  // ------------------------------------------------------------------------

  registerPlugin(plugin: any): void {
    // Plugins are now handled natively in the worker
    console.log("[DataQueryService] Plugin registration deprecated - using native worker handlers");
  }

  unregisterPlugin(pluginId: string): void {
    // No-op: plugins are now handled natively in the worker
  }

  // ------------------------------------------------------------------------
  // QUERY EXECUTION
  // ------------------------------------------------------------------------

  async get(dataSourceId: string, queryKey: string[]): Promise<any> {
    // Check local cache first
    const cacheKey = this.getCacheKey(dataSourceId, queryKey);
    const cached = this.localCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 60000) { // 1 minute TTL
      return cached.data;
    }

    // Execute query via Virtual Query Client
    const requestId = `${this.queryCount++}-${Date.now()}`;
    const request: FetchRequest = {
      id: requestId,
      dataSourceId,
      queryKey,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      this.pendingQueries.set(requestId, { resolve, reject, dataSourceId, queryKey });

      if (this.worker && this.config.useWorker) {
        this.worker.postMessage({
          type: "FETCH_REQUEST",
          payload: request,
        });
      } else {
        // Fallback to main thread execution
        this.executeInMainThread(request).then(resolve).catch(reject);
      }
    });
  }

  getSync(dataSourceId: string, queryKey: string[]): any | null {
    const cacheKey = this.getCacheKey(dataSourceId, queryKey);
    const cached = this.localCache.get(cacheKey);
    return cached?.data ?? null;
  }

  private async executeInMainThread(request: FetchRequest): Promise<any> {
    const dataSource = this.dataSources.get(request.dataSourceId);
    if (!dataSource) {
      throw new Error(`Data source not found: ${request.dataSourceId}`);
    }

    // For currency data source, use the Frankfurter API
    if (request.dataSourceId === "currency") {
      const response = await fetch("https://api.frankfurter.dev/v2/rates?base=USD");
      const data = await response.json();
      
      // Parse the rates and calculate the specific rate requested
      const [, from, to] = request.queryKey;
      const rates: Record<string, number> = { USD: 1.0 };
      
      if (data.rates) {
        Object.entries(data.rates).forEach(([currency, rate]) => {
          rates[currency] = rate as number;
        });
      }

      const fromUpper = from?.toUpperCase();
      const toUpper = to?.toUpperCase();

      if (fromUpper === toUpper) return 1;
      if (!rates[fromUpper] || !rates[toUpper]) return 1;

      // Calculate cross rate
      return rates[toUpper] / rates[fromUpper];
    }

    // Default: return null
    return null;
  }

  // ------------------------------------------------------------------------
  // TWO-WAY BINDING: REFRESH MECHANISMS
  // ------------------------------------------------------------------------

  refreshDataSource(dataSourceId: string): void {
    // Refresh all active queries for this data source via TanStack Query
    // This is handled automatically by TanStack Query's cache invalidation
    // For manual refresh, we can use queryClient.invalidateQueries
    const cache = this.queryClient.getQueryCache();
    const queries = cache.findAll({ queryKey: [dataSourceId] });
    queries.forEach(query => {
      this.queryClient.invalidateQueries({ queryKey: query.queryKey });
    });
  }

  refreshAll(): void {
    this.queryClient.invalidateQueries();
  }

  // ------------------------------------------------------------------------
  // MESSAGE HANDLERS
  // ------------------------------------------------------------------------

  private handleFetchResponse(response: FetchResponse): void {
    const pending = this.pendingQueries.get(response.id);
    if (pending) {
      pending.resolve(response.data);
      this.pendingQueries.delete(response.id);

      // Update local cache
      const cacheKey = this.getCacheKey(response.dataSourceId, response.queryKey);
      this.localCache.set(cacheKey, {
        data: response.data,
        timestamp: Date.now(),
      });
      
      // Emit cache update event
      this.emitCacheUpdate(response.dataSourceId, response.queryKey, response.data);
    }
  }

  private handleFetchError(error: { id: string; error: string }): void {
    const pending = this.pendingQueries.get(error.id);
    if (pending) {
      pending.reject(new Error(error.error));
      this.pendingQueries.delete(error.id);
      
      // Emit error event
      this.emitError(pending.dataSourceId, pending.queryKey, error.error);
    }
  }

  // ------------------------------------------------------------------------
  // MEMORY MANAGEMENT
  // ------------------------------------------------------------------------

  private getCacheKey(dataSourceId: string, queryKey: string[]): string {
    return `${dataSourceId}:${JSON.stringify(queryKey)}`;
  }

  private cleanupCache(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [key, entry] of this.localCache) {
      if (now - entry.timestamp > maxAge) {
        this.localCache.delete(key);
      }
    }

    // Enforce cache size limit
    if (this.localCache.size > this.config.cacheSize) {
      const entries = Array.from(this.localCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = entries.slice(0, this.localCache.size - this.config.cacheSize);
      toRemove.forEach(([key]) => this.localCache.delete(key));
    }
  }

  // ------------------------------------------------------------------------
  // SHUTDOWN
  // ------------------------------------------------------------------------

  destroy(): void {
    // Close worker
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    // Clear caches
    this.localCache.clear();
    this.pendingQueries.clear();
    this.dataSources.clear();
    
    // Clear TanStack Query cache
    this.queryClient.clear();
  }
  
  // ------------------------------------------------------------------------
  // TANSTACK QUERY ACCESS
  // ------------------------------------------------------------------------

  getQueryClient(): QueryClient {
    return this.queryClient;
  }
  
  // ------------------------------------------------------------------------
  // EVENT LISTENERS
  // ------------------------------------------------------------------------

  onCacheUpdate(listener: (dataSourceId: string, queryKey: string[], data: any) => void): () => void {
    this.cacheUpdateListeners.add(listener);
    return () => this.cacheUpdateListeners.delete(listener);
  }

  onError(listener: (dataSourceId: string, queryKey: string[], error: string) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  private emitCacheUpdate(dataSourceId: string, queryKey: string[], data: any): void {
    this.cacheUpdateListeners.forEach(listener => {
      try {
        listener(dataSourceId, queryKey, data);
      } catch (error) {
        console.error("[DataQueryService] Error in cache update listener:", error);
      }
    });
  }

  private emitError(dataSourceId: string, queryKey: string[], error: string): void {
    this.errorListeners.forEach(listener => {
      try {
        listener(dataSourceId, queryKey, error);
      } catch (err) {
        console.error("[DataQueryService] Error in error listener:", err);
      }
    });
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const dataQueryService = new DataQueryService({
  useWorker: true,
  maxConcurrentQueries: 100,
  cacheSize: 1000,
});

// Export for direct usage
export default dataQueryService;
