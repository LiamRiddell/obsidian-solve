/**
 * Mock DataQueryWorker factory for the playground.
 *
 * The real DataQueryWorker.worker.ts relies on esbuild-plugin-inline-worker
 * which isn't available in Vite.
 *
 * Throwing directly lets the existing try/catch in
 * DataQueryService.initializeWorker() catch a clean error message and
 * set useWorker = false, causing all DQ queries to fall back to
 * main-thread execution via executeInMainThread().
 *
 * A WorkerStub object would silently no-op postMessage(), creating
 * dangling promises in the pendingQueries map — much worse.
 */
export default (() => {
	throw new Error("[Mock] DataQueryWorker not available in playground — running on main thread");
}) as unknown as () => Worker;
