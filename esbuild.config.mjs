import { Buffer } from "buffer";
import builtins from "builtin-modules";
import esbuild from "esbuild";
import fs from "fs/promises";
import fsSync from "fs";
import process from "process";

const prod = process.argv[2] === "production";

const cssCommentPlugin = {
	name: "css-comment",
	setup(build) {
		build.onEnd(async (result) => {
			if (!result.outputFiles) return;
			for (const file of result.outputFiles) {
				if (file.path.endsWith(".css")) {
					const styleSettingsFile = await fs.readFile(
						"./src/app/styles/style-settings-config.css"
					);
					const newContents = Buffer.concat([
						styleSettingsFile,
						Buffer.from(file.contents),
					]);
					await fs.writeFile(file.path, newContents);
				} else {
					// Write JS output files (e.g. main.js)
					await fs.writeFile(file.path, file.contents);
				}
			}
		});
	},
};

const ensureDirPlugin = (name) => ({
	name,
	setup(build) {
		build.onStart(() => {
			if (!fsSync.existsSync("workers")) {
				fsSync.mkdirSync("workers", { recursive: true });
			}
		});
		build.onEnd(async (result) => {
			if (!result.outputFiles) return;
			for (const file of result.outputFiles) {
				await fs.writeFile(file.path, file.contents);
			}
		});
	},
});

const baseConfig = {
	bundle: true,
	define: { global: "globalThis" },
	external: [
		"obsidian",
		"electron",
		"@codemirror/autocomplete",
		"@codemirror/collab",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/lint",
		"@codemirror/search",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
		...builtins,
	],
	format: "cjs",
	target: "es2018",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	write: false,
	drop: prod ? ["console", "debugger"] : [],
	minifySyntax: prod,
	minify: prod,
};

const mainBuild = await esbuild.context({
	...baseConfig,
	entryPoints: ["src/app/main.ts", "src/app/styles.css"],
	plugins: [cssCommentPlugin],
	outdir: ".",
});

const workerEntryBuild = await esbuild.context({
	...baseConfig,
	entryPoints: ["src/solve-js/src/workers/eval-worker.ts"],
	plugins: [ensureDirPlugin("ensure-workers-dir")],
	outdir: "workers",
});

const compilationWorkerBuild = await esbuild.context({
	...baseConfig,
	entryPoints: ["src/solve-js/src/workers/compilation-worker.ts"],
	plugins: [ensureDirPlugin("ensure-workers-dir-3")],
	outdir: "workers",
});

const dataQueryBuild = await esbuild.context({
	...baseConfig,
	entryPoints: ["src/solve-js/src/workers/DataQueryWorker.ts"],
	plugins: [ensureDirPlugin("ensure-workers-dir-4")],
	outdir: "workers",
});

if (prod) {
	await mainBuild.rebuild();
	await workerEntryBuild.rebuild();
	await compilationWorkerBuild.rebuild();
	await dataQueryBuild.rebuild();
	process.exit(0);
} else {
	await Promise.all([
		mainBuild.watch(),
		workerEntryBuild.watch(),
		compilationWorkerBuild.watch(),
		dataQueryBuild.watch(),
	]);
}