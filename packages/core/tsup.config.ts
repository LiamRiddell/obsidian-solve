import { defineConfig } from "tsup";

export default defineConfig({
	entry: {
		index: "src/api/index.ts",
		engine: "src/engine/index.ts",
		vm: "src/vm/index.ts",
		format: "src/format/index.ts",
		language: "src/language/index.ts",
		packages: "src/packages/index.ts",
		constants: "src/constants/index.ts",
		lexer: "src/lexer/index.ts",
		parser: "src/parser/index.ts",
		normalizer: "src/normalizer/index.ts",
		variables: "src/variables/index.ts",
		resolvers: "src/resolvers/index.ts",
		errors: "src/errors/index.ts",
		utilities: "src/utilities/index.ts",
		uom: "src/uom/index.ts",
		services: "src/services/index.ts",
	},
	format: ["esm", "cjs"],
	dts: true,
	sourcemap: true,
	clean: true,
	splitting: true,
	treeshake: true,
	tsconfig: "./tsconfig.json",
});
