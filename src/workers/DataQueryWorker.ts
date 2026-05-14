/**
 * Production-grade scalable data query worker
 * Refactored to act as a pure fetch executor for the main thread Virtual Query Client
 */

import { QueryFunctionContext } from "@tanstack/query-core";

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

export interface FetchRequest {
  id: string;
  dataSourceId: string;
  queryKey: string[];
  params?: Record<string, any>;
  timestamp: number;
}

export interface FetchResponse {
  id: string;
  dataSourceId: string;
  queryKey: string[];
  data: any;
  error?: string;
  timestamp: number;
}

// ============================================================================
// SINGLE WORKER IMPLEMENTATION
// ============================================================================

export class DataQueryWorker {
  private dataSources: Map<string, DataSourceConfig> = new Map();

  constructor() {
    // No QueryClient needed - main thread handles caching
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
    this.postMessage({
      type: "DATA_SOURCE_UNREGISTERED",
      payload: { dataSourceId },
    });
  }

  // ------------------------------------------------------------------------
  // FETCH EXECUTION (Replaces executeQuery)
  // ------------------------------------------------------------------------

  async executeFetch(request: FetchRequest): Promise<FetchResponse> {
    const dataSource = this.dataSources.get(request.dataSourceId);
    if (!dataSource) {
      return {
        id: request.id,
        dataSourceId: request.dataSourceId,
        queryKey: request.queryKey,
        data: null,
        error: `Data source not found: ${request.dataSourceId}`,
        timestamp: Date.now(),
      };
    }

    // Execute query based on data source type
    try {
      let data: any;
      
      // Handle currency data source natively
      if (request.dataSourceId === "currency" || dataSource.type === "currency") {
        data = await this.handleCurrencyQuery(request.queryKey);
      } else {
        // Default fetch implementation for other data sources
        const context: QueryFunctionContext = {
          queryKey: request.queryKey,
          meta: undefined,
          signal: undefined,
          pageParam: undefined,
        };
        data = await this.defaultQueryFunction(context, dataSource);
      }

      return {
        id: request.id,
        dataSourceId: request.dataSourceId,
        queryKey: request.queryKey,
        data,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        id: request.id,
        dataSourceId: request.dataSourceId,
        queryKey: request.queryKey,
        data: null,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      };
    }
  }

  // ------------------------------------------------------------------------
  // CURRENCY DATA SOURCE HANDLER
  // ------------------------------------------------------------------------

  private async handleCurrencyQuery(queryKey: string[]): Promise<number> {
    // queryKey format: ["currency", "from", "to"]
    const [, from, to] = queryKey;
    
    if (!from || !to) {
      throw new Error("Invalid currency query key");
    }

    // For same currency, return 1
    if (from.toUpperCase() === to.toUpperCase()) {
      return 1;
    }

    // Fetch from Frankfurter API
    const response = await fetch("https://api.frankfurter.dev/v2/rates?base=USD");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Parse the rates and calculate the specific rate requested
    const rates: Record<string, number> = { USD: 1.0 };
    
    if (data.rates) {
      Object.entries(data.rates).forEach(([currency, rate]) => {
        rates[currency] = rate as number;
      });
    }

    const fromUpper = from?.toUpperCase();
    const toUpper = to?.toUpperCase();

    if (!rates[fromUpper] || !rates[toUpper]) {
      return 1; // Fallback rate
    }

    // Calculate cross rate
    return rates[toUpper] / rates[fromUpper];
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

      case "FETCH_REQUEST":
        this.executeFetch(payload)
          .then((response) => {
            this.postMessage({
              type: "FETCH_RESPONSE",
              payload: response,
            });
          })
          .catch((error) => {
            this.postMessage({
              type: "FETCH_ERROR",
              payload: {
                id: payload.id,
                error: error.message,
              },
            });
          });
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
