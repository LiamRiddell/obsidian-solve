/**
 * Standalone Jest config for @solve/core — lets this package run its own
 * test suite (`npm test` from packages/core) independent of the monorepo
 * root config, which is what the eventual standalone repo (Phase 3/4 of
 * the extraction plan) will need.
 */

/** @type {import('jest').Config} */
const config = {
	coverageProvider: "v8",
	maxWorkers: 2,
	workerIdleMemoryLimit: "512MB",
	moduleDirectories: ["node_modules"],
	moduleNameMapper: {
		"^(\\.{1,2}/.*)\\.js$": "$1",
		"@solve-js/workers/(.*)\\.worker$": "<rootDir>/__tests__/__mocks__/worker-mock.ts",
		"@solve-js-examples/(.*)": "<rootDir>/examples/$1",
		"@solve-js/(.*)": "<rootDir>/src/$1",
		"@tools/(.*)": "<rootDir>/tools/$1",
		"test/(.*)": "<rootDir>/__tests__/$1",
	},
	preset: "ts-jest",
	rootDir: ".",
	roots: ["<rootDir>"],
	setupFiles: ["<rootDir>/__tests__/__mocks__/jest-setup.ts"],
	testEnvironment: "jest-environment-node",
	testPathIgnorePatterns: [
		"\\\\node_modules\\\\",
		"/node_modules/",
		"__mocks__",
		"\\.claude[\\\\/]",
		// Heavy / stress tests — not part of the normal dev cycle
		"heavy/",
		"benchmarks/",
		"LexerFuzz\\.spec\\.",
		"LexerVocabularyFuzz\\.spec\\.",
		"LongDocumentRobustness\\.spec\\.",
	],
	transform: {
		"^.+\\.tsx?$": [
			"ts-jest",
			{
				tsconfig: "<rootDir>/tsconfig.test.json",
				skipLibCheck: true,
				isolatedModules: true,
			},
		],
	},
};

module.exports = config;
