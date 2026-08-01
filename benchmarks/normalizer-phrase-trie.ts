/**
 * Normalizer Benchmark — PhraseTrie vs old phraseFusionRule
 *
 * Compares the PhraseTrie optimization against the previous approach
 * of 7 independent phraseFusionRule instances each scanning forward
 * from the current token position.
 *
 * Run: npx tsx benchmarks/normalizer-bench.ts
 */

import { Token, LexerToken, tokenTypeId } from "@solve/core/lexer";

// ── Shared imports ─────────────────────────────────────────────────────

import { TokenNormalizer, PhraseTrie } from "@solve/core/normalizer";
import type { NormalizerRule, NormalizerMatch } from "@solve/core/normalizer";

// ── Helper: create a simple token ──────────────────────────────────────

function tk(type: string, value: string, offset = 0): Token {
	return new LexerToken(type, tokenTypeId(type), value, value, offset, 0, 1, offset + 1);
}

// ────────────────────────────────────────────────────────────────────────
// OLD APPROACH: 7 separate phraseFusionRule instances
// (Recreated here because the original is deprecated)
// ────────────────────────────────────────────────────────────────────────

function oldPhraseFusionRule(phrase: string, tokenType: string): NormalizerRule {
	const words = phrase.toLowerCase().split(" ");
	const wordCount = words.length;

	return {
		name: `phrase:${phrase}`,
		priority: 100,
		match(tokens: Token[], pos: number): NormalizerMatch | null {
			if (pos + wordCount > tokens.length) return null;
			for (let i = 0; i < wordCount; i++) {
				if (tokens[pos + i].value.toLowerCase() !== words[i]) return null;
			}
			const matched = tokens.slice(pos, pos + wordCount);
			const fused = new LexerToken(
				tokenType, tokenTypeId(tokenType), phrase, phrase,
				matched[0].offset, 0, matched[0].line, matched[0].col,
			);
			return { consumed: wordCount, replacement: [fused] };
		},
	};
}

const OLD_RULES: NormalizerRule[] = [
	oldPhraseFusionRule("to the power of", "CARET"),
	oldPhraseFusionRule("power of", "CARET"),
	oldPhraseFusionRule("increase by", "INCREASE_BY"),
	oldPhraseFusionRule("decrease by", "DECREASE_BY"),
	oldPhraseFusionRule("times by", "TIMES_BY"),
	oldPhraseFusionRule("multiply by", "MULTIPLY_BY"),
	oldPhraseFusionRule("divide by", "DIVIDE_BY"),
];

/** Old normalizer with 7 separate phrase rules. */
function createOldNormalizer(): { normalize: (tokens: Token[]) => Token[] } {
	const sorted = [...OLD_RULES].sort((a, b) => b.priority - a.priority);

	return {
		normalize(tokens: Token[]): Token[] {
			if (tokens.length === 0) return tokens;

			let current = tokens;
			let changed = true;
			let passes = 0;

			while (changed && passes < 100) {
				changed = false;
				passes++;
				const result: Token[] = [];
				let pos = 0;

				while (pos < current.length) {
					let matched = false;
					for (const rule of sorted) {
						const match = rule.match(current, pos);
						if (match) {
							for (const rt of match.replacement) result.push(rt);
							pos += match.consumed;
							changed = true;
							matched = true;
							break;
						}
					}
					if (!matched) {
						result.push(current[pos]);
						pos++;
					}
				}
				current = result;
			}
			return current;
		},
	};
}

// ────────────────────────────────────────────────────────────────────────
// NEW APPROACH: PhraseTrie
// ────────────────────────────────────────────────────────────────────────

const NEW_PHRASES: Record<string, string> = {
	"to the power of": "CARET",
	"power of": "CARET",
	"increase by": "INCREASE_BY",
	"decrease by": "DECREASE_BY",
	"times by": "TIMES_BY",
	"multiply by": "MULTIPLY_BY",
	"divide by": "DIVIDE_BY",
};

function createNewNormalizer(): { normalize: (tokens: Token[]) => Token[] } {
	const normalizer = new TokenNormalizer();
	for (const [phrase, tokenType] of Object.entries(NEW_PHRASES)) {
		normalizer.addPhrase(phrase, tokenType);
	}
	// No other rules needed — just the trie
	return {
		normalize(tokens: Token[]): Token[] {
			return normalizer.normalize(tokens);
		},
	};
}

// ────────────────────────────────────────────────────────────────────────
// Token stream generators
// ────────────────────────────────────────────────────────────────────────

/** Generate a stream with NO phrase matches — numbers and operators only.
 *  This hits the O(1) quick-reject path on every position. */
function generateNoMatchStream(size: number): Token[] {
	const tokens: Token[] = [];
	for (let i = 0; i < size; i++) {
		switch (i % 5) {
			case 0: tokens.push(tk("NUMBER", String((i * 7) % 100))); break;
			case 1: tokens.push(tk("PLUS", "+")); break;
			case 2: tokens.push(tk("NUMBER", String((i * 3) % 50))); break;
			case 3: tokens.push(tk("STAR", "*")); break;
			case 4: tokens.push(tk("NUMBER", String(i % 10))); break;
		}
	}
	return tokens;
}

/** Generate a stream with phrase matches scattered throughout.
 *  Every 10th position starts a "to the power of" phrase. */
function generatePhraseMatchStream(size: number): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	while (tokens.length < size) {
		if (i % 10 === 0 && tokens.length + 5 <= size) {
			tokens.push(tk("IDENT", "to"));
			tokens.push(tk("IDENT", "the"));
			tokens.push(tk("IDENT", "power"));
			tokens.push(tk("IDENT", "of"));
			tokens.push(tk("NUMBER", "3"));
			i += 5;
		} else {
			tokens.push(tk("NUMBER", String(i % 50)));
			tokens.push(tk("PLUS", "+"));
			i += 2;
		}
	}
	return tokens.slice(0, size);
}

/** Generate a stream with the LONGEST phrase "to the power of" at the start,
 *  followed by normal tokens. Tests longest-match-wins in trie. */
function generateLongestMatchStream(size: number): Token[] {
	const tokens: Token[] = [
		tk("NUMBER", "2"),
		tk("IDENT", "to"),
		tk("IDENT", "the"),
		tk("IDENT", "power"),
		tk("IDENT", "of"),
		tk("NUMBER", "5"),
	];
	// Fill rest with no-match tokens
	for (let i = tokens.length; i < size; i++) {
		tokens.push(tk("NUMBER", String(i % 100)));
	}
	return tokens.slice(0, size);
}

// ────────────────────────────────────────────────────────────────────────
// Benchmark runner
// ────────────────────────────────────────────────────────────────────────

interface BenchResult {
	name: string;
	mean: number;
	median: number;
	p95: number;
	opsPerSecond: number;
}

function runBench(name: string, fn: () => void, iterations: number, warmup: number): BenchResult {
	// Warmup
	for (let i = 0; i < warmup; i++) fn();

	// Measurement
	const times: number[] = [];
	for (let i = 0; i < iterations; i++) {
		const start = performance.now();
		fn();
		const end = performance.now();
		times.push(end - start);
	}

	const sorted = [...times].sort((a, b) => a - b);
	const sum = times.reduce((a, b) => a + b, 0);
	const mean = sum / iterations;
	const median = sorted[Math.floor(iterations / 2)];

	const p95Idx = Math.floor(0.95 * sorted.length);
	const p95 = sorted[p95Idx];

	return { name, mean: mean * 1000, median: median * 1000, p95: p95 * 1000, opsPerSecond: 1000 / mean };
}

function formatHeader(label: string): string {
	return `\n${"═".repeat(80)}\n  ${label}\n${"═".repeat(80)}`;
}

function formatRow(name: string, before: BenchResult, after: BenchResult): string {
	const speedup = before.mean / after.mean;
	const changePct = ((after.mean - before.mean) / before.mean * 100);
	const dir = changePct < 0 ? "↓" : "↑";
	return (
		`  ${name.padEnd(22)} ` +
		`${before.mean.toFixed(3).padStart(8)}μs → ${after.mean.toFixed(3).padStart(8)}μs   ` +
		`${speedup.toFixed(2)}x faster (${dir}${Math.abs(changePct).toFixed(0)}%)`
	);
}

// ────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────

const ITER = 5000;
const WARM = 200;

const SCENARIOS: Array<{ label: string; gen: (size: number) => Token[] }> = [
	{ label: "No-match stream", gen: generateNoMatchStream },
	{ label: "Phrase-match stream", gen: generatePhraseMatchStream },
	{ label: "Longest-match-first", gen: generateLongestMatchStream },
];

const SIZES = [20, 50, 100, 200];

console.log(formatHeader("Normalizer Benchmark: PhraseTrie vs old phraseFusionRule"));
console.log(`  Iterations per test: ${ITER}  |  Warmup: ${WARM}`);
console.log(`  Each scenario generates fresh token streams per iteration\n`);

for (const scenario of SCENARIOS) {
	console.log(formatHeader(scenario.label));

	for (const size of SIZES) {
		const tokens = scenario.gen(size);

		const oldNorm = createOldNormalizer();
		const newNorm = createNewNormalizer();

		const oldResult = runBench(
			`Old (${size}t)`,
			() => oldNorm.normalize(tokens),
			ITER,
			WARM,
		);

		const newResult = runBench(
			`New (${size}t)`,
			() => newNorm.normalize(tokens),
			ITER,
			WARM,
		);

		console.log(formatRow(`${scenario.label}`, oldResult, newResult));
	}
}

// ── Summary ────────────────────────────────────────────────────────────

console.log(formatHeader("Summary: PhraseTrie Speedup Factors"));
for (const scenario of SCENARIOS) {
	for (const size of SIZES) {
		const tokens = scenario.gen(size);
		const oldNorm = createOldNormalizer();
		const newNorm = createNewNormalizer();
		const oldResult = runBench(`old`, () => oldNorm.normalize(tokens), ITER, WARM);
		const newResult = runBench(`new`, () => newNorm.normalize(tokens), ITER, WARM);
		const speedup = oldResult.mean / newResult.mean;
		console.log(`  ${scenario.label.padEnd(22)} ${String(size).padStart(4)}t → ${speedup.toFixed(2)}x faster`);
	}
}

console.log("\n✅ Benchmark complete.\n");
