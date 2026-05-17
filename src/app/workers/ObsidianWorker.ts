/**
 * Obsidian-specific worker implementation
 * Optimized for the Obsidian plugin environment
 */

import { IWorker, WorkerMessage, WorkerResponse } from "@solve-js/workers/WorkerInterface";

export class ObsidianWorker implements IWorker {
  private messageHandler: ((response: WorkerResponse) => void) | null = null;
  private errorHandler: ((error: Error) => void) | null = null;

  constructor() {
    // In Obsidian, workers might be handled differently
    // This is a placeholder for Obsidian-specific worker implementation
    console.log("[ObsidianWorker] Initialized - using default implementation");
  }

  postMessage(message: WorkerMessage): void {
    // Obsidian-specific message posting
    // For now, we'll simulate worker behavior
    console.log("[ObsidianWorker] Posting message:", message);
    
    // Simulate async response for demo
    setTimeout(() => {
      if (this.messageHandler) {
        this.messageHandler({
          type: `${message.type}_RESPONSE`,
          payload: { success: true },
        });
      }
    }, 0);
  }

  onMessage(handler: (response: WorkerResponse) => void): void {
    this.messageHandler = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  terminate(): void {
    console.log("[ObsidianWorker] Terminated");
    this.messageHandler = null;
    this.errorHandler = null;
  }
}

/**
 * Factory for creating Obsidian workers
 */
export class ObsidianWorkerFactory {
  create(): IWorker {
    return new ObsidianWorker();
  }
}
