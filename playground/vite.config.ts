import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
	root: __dirname,
	base: "/",
	resolve: {
		alias: [
			// Specific aliases MUST come before catch-all prefixes so they match first
			{ find: "@solve-js/workers/DataQueryWorker.worker", replacement: path.resolve(__dirname, "./workers/create-data-query-worker.ts") },
			{ find: "@solve-js", replacement: path.resolve(__dirname, "../src/solve-js/src") },
			{ find: "@app", replacement: path.resolve(__dirname, "../src/app") },
			{ find: "@tools", replacement: path.resolve(__dirname, "../src/solve-js/tools") },
			{ find: "@", replacement: path.resolve(__dirname, "../src") },
			{ find: "convert-units", replacement: path.resolve(__dirname, "./mock/convert-units.ts") },
		],
	},
	define: {
		global: "globalThis",
	},
	build: {
		outDir: "dist",
		emptyOutDir: true,
		sourcemap: true,
	},
	optimizeDeps: {
		exclude: ["style-mod", "@marijn/find-cluster-break"],
	},
	server: {
		port: 5173,
		open: true,
		fs: {
			allow: [".."],
		},
	},
});
