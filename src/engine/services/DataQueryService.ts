/**
 * Production-grade data query service with worker orchestration
 * Provides two-way binding, plugin support, and scalable architecture
 */

import { DataSourceConfig, QueryRequest, QueryResponse, SubscriptionRequest, PluginRegistration } from "@/workers/DataQueryWorker";

// Re-export types from DataQueryWorker
export type { DataSourceConfig, PluginRegistration };

// ============================================================================
// SERVICE TYPES & INTERFACES
// ============================================================================

export interface ServiceConfig {
  useWorker: boolean;
  workerUrl: string;
  maxConcurrentQueries: number;
  cacheSize: number;
}

export interface Subscription {
  id: string;
  dataSourceId: string;
  queryKey: string[];
  callback: (data: any, error?: string) => void;
  unsubscribe: () => void;
}

export interface DataSourceHandle {
  id: string;
  config: DataSourceConfig;
  subscribe: (queryKey: string[], callback: (data: any, error?: string) => void) => Subscription;
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
  private dataSources: Map<string, DataSourceHandle> = new Map();
  private localCache: Map<string, { data: any; timestamp: number }> = new Map();
  private pendingQueries: Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void }> =
    new Map();
  private subscriptions: Map<string, Subscription> = new Map();
  private queryCount = 0;

  constructor(config: Partial<ServiceConfig> = {}) {
    this.config = {
      useWorker: true,
      workerUrl: "/workers/DataQueryWorker.ts",
      maxConcurrentQueries: 100,
      cacheSize: 1000,
      ...config,
    };

    if (this.config.useWorker && typeof Worker !== "undefined") {
      this.initializeWorker();
    }

    // Start cache cleanup
    setInterval(() => this.cleanupCache(), 30000); // Every 30 seconds
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
      case "QUERY_RESULT":
        this.handleQueryResult(payload);
        break;

      case "QUERY_ERROR":
        this.handleQueryError(payload);
        break;

      case "SUBSCRIPTION_UPDATE":
        this.handleSubscriptionUpdate(payload);
        break;

      case "SUBSCRIPTION_REGISTERED":
        console.log("[DataQueryService] Subscription registered:", payload.callbackId);
        break;

      case "SUBSCRIPTION_UNREGISTERED":
        console.log("[DataQueryService] Subscription unregistered:", payload.callbackId);
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
      subscribe: (queryKey, callback) => this.subscribe(config.id, queryKey, callback),
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
      // Unsubscribe all subscriptions for this data source
      for (const [subId, subscription] of this.subscriptions) {
        if (subscription.dataSourceId === dataSourceId) {
          this.unsubscribe(subId);
        }
      }

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

  registerPlugin(plugin: PluginRegistration): void {
    if (this.worker) {
      this.worker.postMessage({
        type: "REGISTER_PLUGIN",
        payload: plugin,
      });
    }
  }

  unregisterPlugin(pluginId: string): void {
    if (this.worker) {
      this.worker.postMessage({
        type: "UNREGISTER_PLUGIN",
        payload: { pluginId },
      });
    }
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

    // Execute query
    const requestId = `${this.queryCount++}-${Date.now()}`;
    const request: QueryRequest = {
      id: requestId,
      dataSourceId,
      queryKey,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      this.pendingQueries.set(requestId, { resolve, reject });

      if (this.worker && this.config.useWorker) {
        this.worker.postMessage({
          type: "EXECUTE_QUERY",
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

  private async executeInMainThread(request: QueryRequest): Promise<any> {
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
  // SUBSCRIPTION MANAGEMENT (Two-Way Binding)
  // ------------------------------------------------------------------------

  subscribe(
    dataSourceId: string,
    queryKey: string[],
    callback: (data: any, error?: string) => void
  ): Subscription {
    const subscriptionId = `${dataSourceId}-${JSON.stringify(queryKey)}-${Date.now()}`;
    
    const subscription: Subscription = {
      id: subscriptionId,
      dataSourceId,
      queryKey,
      callback,
      unsubscribe: () => this.unsubscribe(subscriptionId),
    };

    this.subscriptions.set(subscriptionId, subscription);

    // Register with worker if available
    if (this.worker && this.config.useWorker) {
      const request: SubscriptionRequest = {
        id: subscriptionId,
        dataSourceId,
        queryKey,
        callbackId: subscriptionId,
      };

      this.worker.postMessage({
        type: "SUBSCRIBE",
        payload: request,
      });
    } else {
      // Fallback: poll for updates
      this.startPolling(subscription);
    }

    return subscription;
  }

  private unsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      if (this.worker && this.config.useWorker) {
        this.worker.postMessage({
          type: "UNSUBSCRIBE",
          payload: { callbackId: subscriptionId },
        });
      }
      
      this.subscriptions.delete(subscriptionId);
    }
  }

  private startPolling(subscription: Subscription): void {
    // Simple polling fallback for main thread execution
    const poll = async () => {
      if (!this.subscriptions.has(subscription.id)) return;

      try {
        const data = await this.get(subscription.dataSourceId, subscription.queryKey);
        subscription.callback(data);
      } catch (error) {
        subscription.callback(null, error instanceof Error ? error.message : String(error));
      }

      // Poll every 30 seconds
      setTimeout(poll, 30000);
    };

    poll();
  }

  // ------------------------------------------------------------------------
  // TWO-WAY BINDING: REFRESH MECHANISMS
  // ------------------------------------------------------------------------

  refreshSubscription(subscriptionId: string): void {
    if (this.worker && this.config.useWorker) {
      this.worker.postMessage({
        type: "REFRESH_SUBSCRIPTION",
        payload: { callbackId: subscriptionId },
      });
    } else {
      // Fallback: trigger manual refresh
      const subscription = this.subscriptions.get(subscriptionId);
      if (subscription) {
        this.get(subscription.dataSourceId, subscription.queryKey)
          .then((data) => subscription.callback(data))
          .catch((error) =>
            subscription.callback(null, error.message)
          );
      }
    }
  }

  refreshDataSource(dataSourceId: string): void {
    if (this.worker && this.config.useWorker) {
      this.worker.postMessage({
        type: "REFRESH_DATA_SOURCE",
        payload: { dataSourceId },
      });
    } else {
      // Refresh all subscriptions for this data source
      for (const subscription of this.subscriptions.values()) {
        if (subscription.dataSourceId === dataSourceId) {
          this.refreshSubscription(subscription.id);
        }
      }
    }
  }

  refreshAll(): void {
    for (const dataSourceId of this.dataSources.keys()) {
      this.refreshDataSource(dataSourceId);
    }
  }

  // ------------------------------------------------------------------------
  // MESSAGE HANDLERS
  // ------------------------------------------------------------------------

  private handleQueryResult(response: QueryResponse): void {
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
    }
  }

  private handleQueryError(error: { id: string; error: string }): void {
    const pending = this.pendingQueries.get(error.id);
    if (pending) {
      pending.reject(new Error(error.error));
      this.pendingQueries.delete(error.id);
    }
  }

  private handleSubscriptionUpdate(payload: {
    callbackId: string;
    queryKey: string[];
    result: any;
  }): void {
    const subscription = this.subscriptions.get(payload.callbackId);
    if (subscription) {
      if (payload.result.error) {
        subscription.callback(null, payload.result.error);
      } else {
        subscription.callback(payload.result.data);
      }

      // Update local cache
      const cacheKey = this.getCacheKey(
        subscription.dataSourceId,
        payload.queryKey
      );
      this.localCache.set(cacheKey, {
        data: payload.result.data,
        timestamp: Date.now(),
      });
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
    // Unsubscribe all
    for (const subscription of this.subscriptions.values()) {
      subscription.unsubscribe();
    }

    // Close worker
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    // Clear caches
    this.localCache.clear();
    this.pendingQueries.clear();
    this.subscriptions.clear();
    this.dataSources.clear();
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
