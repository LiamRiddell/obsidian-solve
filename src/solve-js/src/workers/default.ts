import { IWorker, WorkerMessage, WorkerResponse, WorkerFactory } from "./WorkerInterface";

/**
 * Default Web Worker implementation using standard browser APIs
 */
export class DefaultWorker implements IWorker {
  private worker: Worker | null = null;
  private messageHandler: ((response: WorkerResponse) => void) | null = null;
  private errorHandler: ((error: Error) => void) | null = null;

  constructor(workerScript: string) {
    if (typeof Worker === "undefined") {
      throw new Error("Web Workers are not supported in this environment");
    }

    try {
      this.worker = new Worker(workerScript);
      this.setupEventListeners();
    } catch (error) {
      throw new Error(`Failed to create worker: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private setupEventListeners(): void {
    if (!this.worker) return;

    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (this.messageHandler) {
        this.messageHandler(event.data);
      }
    };

    this.worker.onerror = (error: ErrorEvent) => {
      if (this.errorHandler) {
        this.errorHandler(new Error(error.message));
      }
    };
  }

  postMessage(message: WorkerMessage): void {
    if (!this.worker) {
      throw new Error("Worker is not initialized");
    }

    this.worker.postMessage(message);
  }

  onMessage(handler: (response: WorkerResponse) => void): void {
    this.messageHandler = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

/**
 * Factory for creating default workers
 */
export class DefaultWorkerFactory implements WorkerFactory {
  constructor(private workerScript: string) {}

  create(): IWorker {
    return new DefaultWorker(this.workerScript);
  }
}

/**
 * Helper function to create a worker from a module
 * This is useful for bundling worker code with the main application
 */
export function createWorkerFromModule(module: any): IWorker {
  // In a browser environment, this would typically create a worker from a blob
  // For now, we'll create a simple inline worker
  if (typeof Worker === "undefined") {
    throw new Error("Web Workers are not supported in this environment");
  }

  const workerCode = `
    self.onmessage = function(event) {
      const { type, payload } = event.data;
      // Default handler - can be overridden by module
      if (typeof ${module}?.handleMessage === 'function') {
        ${module}.handleMessage(event);
      }
    };
  `;

  const blob = new Blob([workerCode], { type: "application/javascript" });
  const workerUrl = URL.createObjectURL(blob);

  return new DefaultWorker(workerUrl);
}
