/**
 * Vite-compatible DataQueryWorker factory.
 *
 * Uses Vite's native module worker support instead of
 * esbuild-plugin-inline-worker (which is not available in Vite).
 *
 * The worker file is loaded as an ES module and contains the
 * same DataQueryWorkerInternal logic as the original.
 */
export default (() => {
	return new Worker(new URL("./data-query.worker.ts", import.meta.url), { type: "module" });
}) as unknown as () => Worker;
