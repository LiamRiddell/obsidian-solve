/**
 * Mock for esbuild-plugin-inline-worker imports in Jest (Node.js environment).
 *
 * Real `.worker.ts` files use `self.onmessage` at module level, which crashes
 * in Node.js because `self` is not defined. This mock provides a stub factory
 * that throws — tests should never actually call it; they test worker-manager
 * logic (lifecycle, storeResults) without spawning real Workers.
 */
export default function createWorker(): never {
	throw new Error(
		"Worker not available in Jest test environment. " +
		"Use lifecycle/API tests that don't call ensureWorker()."
	);
}
