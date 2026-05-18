/**
 * Worker Interface for solve-js engine
 * Defines the contract for platform-specific worker implementations
 */

export interface WorkerMessage {
   /** Optional correlation ID for matching requests to responses */
   id?: number;
   type: string;
   payload?: any;
}

export interface WorkerResponse {
   /** Correlation ID matching the request */
   id?: number;
   type: string;
   payload?: any;
   error?: string;
}

export interface IWorker {
  /**
   * Post a message to the worker
   */
  postMessage(message: WorkerMessage): void;

  /**
   * Handle incoming messages from the worker
   */
  onMessage(handler: (response: WorkerResponse) => void): void;

  /**
   * Handle worker errors
   */
  onError(handler: (error: Error) => void): void;

  /**
   * Terminate the worker
   */
  terminate(): void;
}

export interface WorkerFactory {
  /**
   * Create a new worker instance
   */
  create(): IWorker;
}
