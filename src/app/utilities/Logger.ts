const isDevelopment = process.env.NODE_ENV === "development";

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
