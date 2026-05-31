const isDevelopment = process.env.NODE_ENV === "development";

/**
 * Environment-gated logger singleton.
 *
 * All methods are no-ops in production (`NODE_ENV !== "development"`),
 * preventing console spam in published builds while preserving full
 * visibility during local development.
 *
 * ### Methods
 *   - `log` / `error` / `warn` / `info` / `debug` — standard console wrappers.
 *   - `assert` — gated `console.assert` for development-only invariant checks.
 */
export const logger = {
	log: (...args: unknown[]) => {
		if (isDevelopment) {
			console.log(...args);
		}
	},
	error: (...args: unknown[]) => {
		if (isDevelopment) {
			console.error(...args);
		}
	},
	warn: (...args: unknown[]) => {
		if (isDevelopment) {
			console.warn(...args);
		}
	},
	info: (...args: unknown[]) => {
		if (isDevelopment) {
			console.info(...args);
		}
	},
	debug: (...args: unknown[]) => {
		if (isDevelopment) {
			console.debug(...args);
		}
	},
	assert: (condition: boolean, ...args: unknown[]) => {
		if (isDevelopment) {
			console.assert(condition, ...args);
		}
	},
};
