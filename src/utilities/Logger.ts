const isDevelopment = process.env.NODE_ENV === "development";

export const logger = {
	log: (...args: any[]) => {
		if (isDevelopment) {
			console.log(...args);
		}
	},
	error: (...args: any[]) => {
		if (isDevelopment) {
			console.error(...args);
		}
	},
	warn: (...args: any[]) => {
		if (isDevelopment) {
			console.warn(...args);
		}
	},
	info: (...args: any[]) => {
		if (isDevelopment) {
			console.info(...args);
		}
	},
	debug: (...args: any[]) => {
		if (isDevelopment) {
			console.debug(...args);
		}
	},
	assert: (condition: boolean, ...args: any[]) => {
		if (isDevelopment) {
			console.assert(condition, ...args);
		}
	},
};
