import { Buffer } from "buffer";
import builtins from "builtin-modules";
import esbuild from "esbuild";
import inlineWorker from "esbuild-plugin-inline-worker";
import fs from "fs/promises";
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
	plugins: [cssCommentPlugin, inlineWorker({ minify: prod })],
	outdir: ".",
	metafile: prod,
});

if (prod) {
	const result = await mainBuild.rebuild();
	if (result.metafile) {
		await printBundleSizeReport(result.metafile);
	}
	process.exit(0);
} else {
	await mainBuild.watch();
}

/**
 * Print a short bundle-size summary after a production build: total output
 * size plus the top contributors to main.js by bundled input size. This is
 * a lightweight regression signal for `npm run build` — not a CI gate
 * (see plans/ARCHITECTURE_IMPROVEMENTS.md Part II, L3/L4).
 */
async function printBundleSizeReport(metafile) {
	const outputs = Object.entries(metafile.outputs);
	const mainOutput = outputs.find(([path]) => path.endsWith("main.js"));
	if (!mainOutput) return;

	const [, meta] = mainOutput;
	const inputs = Object.entries(meta.inputs)
		.sort((a, b) => b[1].bytesInOutput - a[1].bytesInOutput)
		.slice(0, 10);

	const kb = (bytes) => (bytes / 1024).toFixed(1) + " KB";

	console.log(`\nBundle size: main.js = ${kb(meta.bytes)}`);
	console.log("Top contributors:");
	for (const [path, input] of inputs) {
		console.log(`  ${kb(input.bytesInOutput).padStart(10)}  ${path}`);
	}
	console.log("");
}