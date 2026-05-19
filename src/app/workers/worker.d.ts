/**
 * Type declaration for esbuild-plugin-inline-worker modules.
 * When a .worker.ts file is imported, the plugin replaces it with a class
 * whose constructor creates a Blob-URL Web Worker at runtime.
 */
declare module '*.worker' {
  class WebWorker {
    postMessage(message: any): void;
    onmessage: ((event: MessageEvent) => void) | null;
    onerror: ((event: ErrorEvent) => void) | null;
    terminate(): void;
  }
  export default WebWorker;
}