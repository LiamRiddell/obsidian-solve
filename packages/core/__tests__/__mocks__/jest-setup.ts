/**
 * Jest Setup — Node.js test environment polyfills.
 *
 * Worker source files (`.worker.ts`) use `self.onmessage` at module level,
 * which crashes in Node.js where `self` is not defined. While the
 * moduleNameMapper in jest.config.js redirects worker imports to a mock,
 * some environments (watch mode, esbuild-based runners) can bypass the
 * mapper. This setup file ensures `self` is always available as a
 * reference to the global object, matching the behaviour of jsdom and
 * web workers.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).self = globalThis;
