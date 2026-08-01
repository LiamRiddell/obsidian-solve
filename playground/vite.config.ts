import path from "path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
	plugins: [vue()],
	root: __dirname,
	base: "/",
	resolve: {
		alias: [
			// Specific aliases MUST come before catch-all prefixes so they match first
			{ find: "@solve-js-examples", replacement: path.resolve(__dirname, "../packages/core/examples") },
			{ find: "@solve-js", replacement: path.resolve(__dirname, "../packages/core/src") },
			{ find: "@bridge", replacement: path.resolve(__dirname, "../packages/playground-bridge/src") },
			{ find: "@app", replacement: path.resolve(__dirname, "../src/app") },
			{ find: "@tools", replacement: path.resolve(__dirname, "../packages/core/tools") },
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
	worker: {
		format: "es",
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
