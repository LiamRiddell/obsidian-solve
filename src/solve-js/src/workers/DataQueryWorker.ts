/**
 * Production-grade scalable data query worker
 * Refactored to act as a pure fetch executor for the main thread Virtual Query Client
 * 
 * @module Workers
 */

import { ConfigurableWorker, DataSourceConfig, FetchRequest, FetchResponse } from './DataSourceStrategy';
import { IWorker, WorkerMessage, WorkerResponse } from './WorkerInterface';

/**
 * Data query worker implementation
 * 
 * @remarks
 * This worker is responsible for executing data fetch operations in a background thread.
 * It uses a strategy pattern to support multiple data source types.
 * 
 * @example
 * ```typescript
 * const worker = new DataQueryWorker();
 * worker.registerDataSource({
 *   id: 'currency',
 *   type: 'currency',
 *   endpoint: 'https://api.frankfurter.dev/v2/rates'
 * });
 * ```
 */
/** Payload shape for data query worker fetch responses */
interface FetcherPayload {
  id: string;
  error?: string;
  data?: unknown;
  dataSourceId?: string;
  queryKey?: string[];
  timestamp?: number;
}

export class DataQueryWorker {
  private worker: IWorker;
  private messageHandlers: Map<string, (response: WorkerResponse) => void> = new Map();

  constructor() {
    this.worker = new ConfigurableWorker();
    this.setupMessageHandlers();
  }

  /**
   * Register a data source configuration
   */
  registerDataSource(config: DataSourceConfig): void {
    this.worker.postMessage({
      type: 'REGISTER_DATA_SOURCE',
      payload: config
    } as WorkerMessage);
  }

  /**
   * Execute a fetch request
   */
  async executeFetch(request: FetchRequest): Promise<FetchResponse> {
    return new Promise((resolve) => {
      const handler = (response: WorkerResponse) => {
        const payload = response.payload as FetcherPayload | undefined;
        if (response.type === 'FETCH_RESPONSE' && payload?.id === request.id) {
          this.worker.onMessage(() => {}); // Clear handler
          resolve(response.payload as FetchResponse);
        } else if (response.type === 'FETCH_ERROR' && payload?.id === request.id) {
          this.worker.onMessage(() => {});
          resolve({
            id: request.id,
            dataSourceId: request.dataSourceId,
            queryKey: request.queryKey,
            error: payload?.error,
            timestamp: Date.now()
          });
        }
      };

      this.worker.onMessage(handler);
    this.worker.postMessage({
      type: 'FETCH_REQUEST',
      payload: request
    } as WorkerMessage);
    });
  }

  /**
   * Terminate the worker
   */
  terminate(): void {
    this.worker.terminate();
    this.messageHandlers.clear();
  }

  private setupMessageHandlers(): void {
    // Setup any necessary message handlers
  }
}

// Re-export types used by DataQueryService
export type { DataSourceType } from './DataSourceStrategy';
export type { DataSourceConfig, FetchRequest, FetchResponse } from './DataSourceStrategy';
