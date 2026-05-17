/**
 * Worker Strategy Pattern Implementation
 * 
 * This module provides pluggable data source strategies for workers.
 * 
 * @module Workers
 */

import { WorkerMessage, WorkerResponse, IWorker } from '@solve-js/workers/WorkerInterface';

/**
 * Data source types
 */
export type DataSourceType = "currency" | "asset" | "config" | "custom" | "http";

/**
 * Data source configuration
 */
export interface DataSourceConfig {
  id: string;
  type: DataSourceType;
  endpoint?: string;
  refreshInterval?: number;
  timeout?: number;
  retryPolicy?: RetryPolicy;
}

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
  backoffMultiplier: number;
}

/**
 * Fetch request for data sources
 */
export interface FetchRequest {
  id: string;
  dataSourceId: string;
  queryKey: string[];
  params?: Record<string, unknown>;
  timestamp: number;
}

/**
 * Fetch response from data sources
 */
export interface FetchResponse {
  id: string;
  dataSourceId: string;
  queryKey: string[];
  data?: unknown;
  error?: string;
  timestamp: number;
}

/**
 * Data source strategy interface
 */
export interface DataSourceStrategy {
  execute(request: FetchRequest): Promise<FetchResponse>;
}

/**
 * Currency data source strategy
 */
export class CurrencyDataSource implements DataSourceStrategy {
  constructor(private endpoint: string) {}

  async execute(request: FetchRequest): Promise<FetchResponse> {
    try {
      const [, from, to] = request.queryKey;
      
      if (!from || !to) {
        return {
          id: request.id,
          dataSourceId: request.dataSourceId,
          queryKey: request.queryKey,
          error: 'Invalid currency query key',
          timestamp: Date.now()
        };
      }

      if (from.toUpperCase() === to.toUpperCase()) {
        return {
          id: request.id,
          dataSourceId: request.dataSourceId,
          queryKey: request.queryKey,
          data: 1,
          timestamp: Date.now()
        };
      }

      const response = await fetch(`${this.endpoint}?base=${from}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const rates: Record<string, number> = { USD: 1.0 };
      
      if (data.rates) {
        Object.entries(data.rates).forEach(([currency, rate]) => {
          rates[currency] = rate as number;
        });
      }

      const fromUpper = from.toUpperCase();
      const toUpper = to.toUpperCase();

      if (!rates[fromUpper] || !rates[toUpper]) {
        return {
          id: request.id,
          dataSourceId: request.dataSourceId,
          queryKey: request.queryKey,
          data: 1,
          timestamp: Date.now()
        };
      }

      return {
        id: request.id,
        dataSourceId: request.dataSourceId,
        queryKey: request.queryKey,
        data: rates[toUpper] / rates[fromUpper],
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        id: request.id,
        dataSourceId: request.dataSourceId,
        queryKey: request.queryKey,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
    }
  }
}

/**
 * Generic HTTP data source strategy
 */
export class HttpDataSource implements DataSourceStrategy {
  constructor(private config: DataSourceConfig) {}

  async execute(request: FetchRequest): Promise<FetchResponse> {
    if (!this.config.endpoint) {
      return {
        id: request.id,
        dataSourceId: request.dataSourceId,
        queryKey: request.queryKey,
        error: 'No endpoint configured',
        timestamp: Date.now()
      };
    }

    try {
      const url = new URL(this.config.endpoint);
      
      request.queryKey.forEach((key, index) => {
        if (index > 0) {
          url.searchParams.append(`param${index}`, String(key));
        }
      });

      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(this.config.timeout || 5000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        id: request.id,
        dataSourceId: request.dataSourceId,
        queryKey: request.queryKey,
        data,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        id: request.id,
        dataSourceId: request.dataSourceId,
        queryKey: request.queryKey,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
    }
  }
}

/**
 * Configurable worker with strategy pattern
 */
export class ConfigurableWorker implements IWorker {
  private strategies = new Map<string, DataSourceStrategy>();
  private messageHandler?: (response: WorkerResponse) => void;
  private errorHandler?: (error: Error) => void;

  /**
   * Register a data source strategy
   */
  registerStrategy(type: string, strategy: DataSourceStrategy): void {
    this.strategies.set(type, strategy);
  }

  /**
   * Post a message to the worker
   */
  postMessage(message: WorkerMessage): void {
    const { type, payload } = message;
    
    switch (type) {
      case 'FETCH_REQUEST':
        this.handleFetchRequest(payload as FetchRequest);
        break;
      case 'REGISTER_DATA_SOURCE':
        this.handleRegisterDataSource(payload as DataSourceConfig);
        break;
      default:
        console.warn(`Unknown message type: ${type}`);
    }
  }

  /**
   * Handle incoming messages from the worker
   */
  onMessage(handler: (response: WorkerResponse) => void): void {
    this.messageHandler = handler;
  }

  /**
   * Handle worker errors
   */
  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  /**
   * Terminate the worker
   */
  terminate(): void {
    this.strategies.clear();
    this.messageHandler = undefined;
    this.errorHandler = undefined;
  }

  private async handleFetchRequest(request: FetchRequest): Promise<void> {
    const strategy = this.strategies.get(request.dataSourceId);
    if (!strategy) {
      this.postResponse({
        type: 'FETCH_ERROR',
        payload: {
          id: request.id,
          error: `No strategy for data source: ${request.dataSourceId}`
        }
      });
      return;
    }

    try {
      const response = await strategy.execute(request);
      this.postResponse({
        type: 'FETCH_RESPONSE',
        payload: response
      });
    } catch (error) {
      this.postResponse({
        type: 'FETCH_ERROR',
        payload: {
          id: request.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  }

  private handleRegisterDataSource(config: DataSourceConfig): void {
    let strategy: DataSourceStrategy;
    
    switch (config.type) {
      case 'currency':
        strategy = new CurrencyDataSource(config.endpoint || '');
        break;
      case 'http':
        strategy = new HttpDataSource(config);
        break;
      default:
        console.warn(`Unknown data source type: ${config.type}`);
        return;
    }

    this.strategies.set(config.id, strategy);
    this.postResponse({
      type: 'DATA_SOURCE_REGISTERED',
      payload: { config }
    });
  }

  private postResponse(response: WorkerResponse): void {
    if (this.messageHandler) {
      this.messageHandler(response);
    }
  }
}

/**
 * Worker pool for managing multiple workers
 */
export class WorkerPool {
  private workers: IWorker[] = [];
  private currentIndex = 0;

  /**
   * Create a worker pool
   */
  constructor(private size: number = 4) {
    for (let i = 0; i < size; i++) {
      this.workers.push(new ConfigurableWorker());
    }
  }

  /**
   * Get next worker in round-robin fashion
   */
  getNext(): IWorker {
    const worker = this.workers[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.workers.length;
    return worker;
  }

  /**
   * Terminate all workers
   */
  terminate(): void {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
  }
}
