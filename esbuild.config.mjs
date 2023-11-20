import { Buffer } from "buffer";
import builtins from "builtin-modules";
import esbuild from "esbuild";
import fs from "fs/promises";
import process from "process";

const prod = process.argv[2] === "production";

const cssCommentPlugin = {
	name: "css-comment",
	setup(build) {
		build.onEnd(async (result) => {
			for (const file of result.outputFiles) {
				if (file.path.endsWith(".css")) {
					const styleSettingsFile = await fs.readFile(
						"./src/styles/style-settings-config.css"
					);

					const newContents = Buffer.concat([
						styleSettingsFile,
						Buffer.from(file.contents),
					]);

					await fs.writeFile(file.path, newContents);
				} else {
					await fs.writeFile(file.path, file.contents);
				}
			}
		});
	},
};

const context = await esbuild.context({
	entryPoints: ["src/main.ts", "src/styles.css"],
	bundle: true,
	define: {
		global: "globalThis",
	},
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
	outdir: ".",
	drop: prod ? ["console", "debugger"] : [],
	minifySyntax: prod ? true : false,
	minify: prod ? true : false,
	splitting: false,
	plugins: [cssCommentPlugin],
	write: false,
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
