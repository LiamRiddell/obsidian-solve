/**
 * Production-grade scalable data query worker
 * Supports multiple data sources, plugin integration, and two-way binding
 */

import { QueryClient, QueryObserver, QueryFunctionContext } from "@tanstack/query-core";

// ============================================================================
// CORE TYPES & INTERFACES
// ============================================================================

export type DataSourceType = "currency" | "asset" | "config" | "custom";

export interface DataSourceConfig {
  id: string;
  type: DataSourceType;
  endpoint?: string;
  refreshInterval?: number;
  staleTime?: number;
  gcTime?: number;
  retry?: number;
}

export interface QueryRequest {
  id: string;
  dataSourceId: string;
  queryKey: string[];
  params?: Record<string, any>;
  timestamp: number;
}

export interface QueryResponse {
  id: string;
  dataSourceId: string;
  queryKey: string[];
  data: any;
  error?: string;
  timestamp: number;
  cached: boolean;
}

export interface SubscriptionRequest {
  id: string;
  dataSourceId: string;
  queryKey: string[];
  callbackId: string;
}

export interface PluginRegistration {
  id: string;
  dataSourceId: string;
  queryFunction: (context: QueryFunctionContext) => Promise<any>;
  priority?: number;
}

// ============================================================================
// SINGLE WORKER IMPLEMENTATION
// ============================================================================

export class DataQueryWorker {
  private queryClient: QueryClient;
  private dataSources: Map<string, DataSourceConfig> = new Map();
  private observers: Map<string, QueryObserver<any, any, any, any>> = new Map();
  private subscriptions: Map<string, Set<string>> = new Map(); // queryKey -> callbackIds
  private plugins: Map<string, PluginRegistration> = new Map();
  private pendingRequests: Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void }> =
    new Map();

  constructor() {
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

    // Start periodic cleanup
    setInterval(() => this.cleanup(), 60000); // Every minute
  }

  // ------------------------------------------------------------------------
  // DATA SOURCE MANAGEMENT
  // ------------------------------------------------------------------------

  registerDataSource(config: DataSourceConfig): void {
    this.dataSources.set(config.id, config);
    this.postMessage({
      type: "DATA_SOURCE_REGISTERED",
      payload: { config },
    });
  }

  unregisterDataSource(dataSourceId: string): void {
    this.dataSources.delete(dataSourceId);
    this.cleanupObserversForDataSource(dataSourceId);
    this.postMessage({
      type: "DATA_SOURCE_UNREGISTERED",
      payload: { dataSourceId },
    });
  }

  // ------------------------------------------------------------------------
  // PLUGIN MANAGEMENT
  // ------------------------------------------------------------------------

  registerPlugin(plugin: PluginRegistration): void {
    this.plugins.set(plugin.id, plugin);
    this.postMessage({
      type: "PLUGIN_REGISTERED",
      payload: { pluginId: plugin.id, dataSourceId: plugin.dataSourceId },
    });
  }

  unregisterPlugin(pluginId: string): void {
    this.plugins.delete(pluginId);
  }

  private getPluginForDataSource(
    dataSourceId: string
  ): PluginRegistration | undefined {
    const plugins = Array.from(this.plugins.values()).filter(
      (p) => p.dataSourceId === dataSourceId
    );
    // Return highest priority plugin
    return plugins.sort((a, b) => (b.priority || 0) - (a.priority || 0))[0];
  }

  // ------------------------------------------------------------------------
  // QUERY EXECUTION
  // ------------------------------------------------------------------------

  async executeQuery(request: QueryRequest): Promise<QueryResponse> {
    const dataSource = this.dataSources.get(request.dataSourceId);
    if (!dataSource) {
      return {
        id: request.id,
        dataSourceId: request.dataSourceId,
        data: null,
        error: `Data source not found: ${request.dataSourceId}`,
        timestamp: Date.now(),
        cached: false,
      };
    }

    // Check cache first (synchronous)
    const cached = this.queryClient
      .getQueryCache()
      .find({ queryKey: request.queryKey });
    if (cached?.state.data !== undefined) {
      return {
        id: request.id,
        dataSourceId: request.dataSourceId,
        queryKey: request.queryKey,
        data: cached.state.data,
        timestamp: Date.now(),
        cached: true,
      };
    }

    // Execute query with plugin support
    try {
      const plugin = this.getPluginForDataSource(request.dataSourceId);
      const data = await this.queryClient.fetchQuery({
        queryKey: request.queryKey,
        queryFn: async (context) => {
          if (plugin) {
            return plugin.queryFunction(context);
          }
          // Default fetch implementation
          return this.defaultQueryFunction(context, dataSource);
        },
        staleTime: dataSource.staleTime,
        gcTime: dataSource.gcTime,
        retry: dataSource.retry,
      });

      return {
        id: request.id,
        dataSourceId: request.dataSourceId,
        queryKey: request.queryKey,
        data,
        timestamp: Date.now(),
        cached: false,
      };
    } catch (error) {
      return {
        id: request.id,
        dataSourceId: request.dataSourceId,
        queryKey: request.queryKey,
        data: null,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        cached: false,
      };
    }
  }

  private async defaultQueryFunction(
    context: QueryFunctionContext,
    dataSource: DataSourceConfig
  ): Promise<any> {
    if (!dataSource.endpoint) {
      throw new Error(`No endpoint configured for data source: ${dataSource.id}`);
    }

    const url = new URL(dataSource.endpoint);
    // Add query parameters from context
    context.queryKey.forEach((key, index) => {
      if (index > 0) { // Skip data source type
        url.searchParams.append(`param${index}`, String(key));
      }
    });

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // ------------------------------------------------------------------------
  // SUBSCRIPTION MANAGEMENT (Two-Way Binding)
  // ------------------------------------------------------------------------

  subscribe(request: SubscriptionRequest): void {
    const dataSource = this.dataSources.get(request.dataSourceId);
    if (!dataSource) {
      this.postMessage({
        type: "SUBSCRIPTION_ERROR",
        payload: {
          error: `Data source not found: ${request.dataSourceId}`,
          callbackId: request.callbackId,
        },
      });
      return;
    }

    const observer = new QueryObserver(this.queryClient, {
      queryKey: request.queryKey,
      queryFn: async (context) => {
        const plugin = this.getPluginForDataSource(request.dataSourceId);
        if (plugin) {
          return plugin.queryFunction(context);
        }
        return this.defaultQueryFunction(context, dataSource);
      },
      staleTime: dataSource.staleTime,
      gcTime: dataSource.gcTime,
      retry: dataSource.retry,
    });

    observer.subscribe((result) => {
      this.postMessage({
        type: "SUBSCRIPTION_UPDATE",
        payload: {
          callbackId: request.callbackId,
          queryKey: request.queryKey,
          result: {
            data: result.data,
            error: result.error?.message,
            isLoading: result.isLoading,
            isSuccess: result.isSuccess,
            isError: result.isError,
            timestamp: Date.now(),
          },
        },
      });
    });

    this.observers.set(request.callbackId, observer);
    
    // Track subscriptions by query key
    const queryKeyStr = JSON.stringify(request.queryKey);
    if (!this.subscriptions.has(queryKeyStr)) {
      this.subscriptions.set(queryKeyStr, new Set());
    }
    this.subscriptions.get(queryKeyStr)!.add(request.callbackId);

    this.postMessage({
      type: "SUBSCRIPTION_REGISTERED",
      payload: { callbackId: request.callbackId, queryKey: request.queryKey },
    });
  }

  unsubscribe(callbackId: string): void {
    const observer = this.observers.get(callbackId);
    if (observer) {
      observer.destroy();
      this.observers.delete(callbackId);
    }

    // Remove from subscriptions tracking
    for (const [queryKeyStr, callbacks] of this.subscriptions) {
      if (callbacks.has(callbackId)) {
        callbacks.delete(callbackId);
        if (callbacks.size === 0) {
          this.subscriptions.delete(queryKeyStr);
        }
        break;
      }
    }

    this.postMessage({
      type: "SUBSCRIPTION_UNREGISTERED",
      payload: { callbackId },
    });
  }

  // ------------------------------------------------------------------------
  // TWO-WAY BINDING: REFRESH FROM MAIN THREAD
  // ------------------------------------------------------------------------

  refreshSubscription(callbackId: string): void {
    const observer = this.observers.get(callbackId);
    if (observer) {
      observer.refetch();
    }
  }

  refreshDataSource(dataSourceId: string): void {
    for (const observer of this.observers.values()) {
      const queryKey = observer.getCurrentResult().data?.queryKey;
      if (queryKey && this.isQueryKeyForDataSource(queryKey, dataSourceId)) {
        observer.refetch();
      }
    }
  }

  private isQueryKeyForDataSource(
    queryKey: string[],
    dataSourceId: string
  ): boolean {
    // Assuming first element of queryKey is dataSourceId
    return queryKey[0] === dataSourceId;
  }

  // ------------------------------------------------------------------------
  // MEMORY MANAGEMENT & CLEANUP
  // ------------------------------------------------------------------------

  private cleanup(): void {
    // Clean up old queries
    this.queryClient.clean();
    
    // Enforce cache limits
    const cache = this.queryClient.getQueryCache();
    const queries = cache.findAll();
    if (queries.length > 1000) {
      const toRemove = queries.slice(0, queries.length - 1000);
      toRemove.forEach((q) => q.remove());
    }
  }

  private cleanupObserversForDataSource(dataSourceId: string): void {
    for (const [callbackId, observer] of this.observers) {
      const queryKey = observer.options.queryKey;
      if (queryKey && queryKey[0] === dataSourceId) {
        this.unsubscribe(callbackId);
      }
    }
  }

  // ------------------------------------------------------------------------
  // MESSAGE PASSING
  // ------------------------------------------------------------------------

  private postMessage(message: any): void {
    // Worker context
    if (typeof self !== "undefined") {
      (self as any).postMessage(message);
    }
    // Test context
    else if (typeof (global as any).postMessage === "function") {
      (global as any).postMessage(message);
    }
  }

  // ------------------------------------------------------------------------
  // MESSAGE HANDLER
  // ------------------------------------------------------------------------

  handleMessage(event: MessageEvent): void {
    const { type, payload } = event.data;

    switch (type) {
      case "REGISTER_DATA_SOURCE":
        this.registerDataSource(payload);
        break;

      case "UNREGISTER_DATA_SOURCE":
        this.unregisterDataSource(payload.dataSourceId);
        break;

      case "REGISTER_PLUGIN":
        this.registerPlugin(payload);
        break;

      case "UNREGISTER_PLUGIN":
        this.unregisterPlugin(payload.pluginId);
        break;

      case "EXECUTE_QUERY":
        this.executeQuery(payload)
          .then((response) => {
            this.postMessage({
              type: "QUERY_RESULT",
              payload: response,
            });
          })
          .catch((error) => {
            this.postMessage({
              type: "QUERY_ERROR",
              payload: {
                id: payload.id,
                error: error.message,
              },
            });
          });
        break;

      case "SUBSCRIBE":
        this.subscribe(payload);
        break;

      case "UNSUBSCRIBE":
        this.unsubscribe(payload.callbackId);
        break;

      case "REFRESH_SUBSCRIPTION":
        this.refreshSubscription(payload.callbackId);
        break;

      case "REFRESH_DATA_SOURCE":
        this.refreshDataSource(payload.dataSourceId);
        break;
    }
  }
}

// ============================================================================
// WORKER INITIALIZATION
// ============================================================================

// Singleton instance
const worker = new DataQueryWorker();

// Message handler
(self as any).onmessage = (event: MessageEvent) => {
  worker.handleMessage(event);
};

// Export for testing
export { worker as dataQueryWorker };
