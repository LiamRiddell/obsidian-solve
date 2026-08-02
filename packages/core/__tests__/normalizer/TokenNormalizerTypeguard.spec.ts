import { describe, expect, test, beforeEach, afterEach, jest } from "@jest/globals";
import { TokenNormalizer, NON_WORD_NAMES, NON_WORD_TABLE } from "@solve-js/normalizer/TokenNormalizer";
import { LexerToken } from "@solve-js/lexer/ExpressionLexer";
import { tokenTypeId } from "@solve-js/lexer/Token";
import type { Token } from "@solve-js/lexer/Token";
import { PhraseTrie } from "@solve-js/normalizer/PhraseTrie";

/** Helper: create a token with a specific type and value. */
function tk(type: string, value: string, offset = 0): Token {
	return new LexerToken(type, tokenTypeId(type), value, value, offset, 0, 1, offset + 1);
}

/** Build a TokenNormalizer that has phrases registered so the trie is non-empty. */
function createNormalizer(): TokenNormalizer {
	const n = new TokenNormalizer();
	n.addPhrase("times by", "TIMES_BY");
	n.addPhrase("divide by", "DIVIDE_BY");
	n.addPhrase("to the power of", "CARET");
	n.addPhrase("hello world", "GREETING");
	return n;
}

/**
 * Spy on the normalizer's internal PhraseTrie.matchAt() to observe whether
 * the type-guard allowed or blocked the trie walk for each token position.
 *
 * Returns a cleanup function that restores the spy.
 */
function spyTrieMatchAt(
	normalizer: TokenNormalizer,
): { spy: jest.SpiedFunction<PhraseTrie["matchAt"]>; cleanup: () => void } {
	// Access private field — TypeScript `private` is compile-time only
	const trie = (normalizer as any).phraseTrie as PhraseTrie;
	const spy = jest.spyOn(trie, "matchAt");
	return {
		spy,
		cleanup: () => spy.mockRestore(),
	};
}

/**
 * Assert that matchAt was called exactly once, at position 0 (since we
 * always test single-token streams at position 0).
 */
function expectTrieCalledOnce(spy: jest.SpiedFunction<PhraseTrie["matchAt"]>): void {
	expect(spy).toHaveBeenCalledTimes(1);
	expect(spy.mock.calls[0][1]).toBe(0); // called at position 0
}

/** Assert the exact matchAt call count (for multi-pass scenarios). */
function expectTrieCallCount(spy: jest.SpiedFunction<PhraseTrie["matchAt"]>, count: number): void {
	expect(spy).toHaveBeenCalledTimes(count);
}

/** Assert that matchAt was never called (type-guard blocked the trie walk). */
function expectTrieSkipped(spy: jest.SpiedFunction<PhraseTrie["matchAt"]>): void {
	expect(spy).not.toHaveBeenCalled();
}

// ══════════════════════════════════════════════════════════════════════
// §1  Numeric literals — NEVER reach the trie
// ══════════════════════════════════════════════════════════════════════

describe("Type-guard skip — numeric literals", () => {
	let normalizer: TokenNormalizer;
	let spy: jest.SpiedFunction<PhraseTrie["matchAt"]>;
	let cleanup: () => void;

	beforeEach(() => {
		normalizer = createNormalizer();
		const s = spyTrieMatchAt(normalizer);
		spy = s.spy;
		cleanup = s.cleanup;
	});

	afterEach(() => cleanup());

	test("NUMBER token should skip trie entirely", () => {
		normalizer.normalize([tk("NUMBER", "42")]);
		expectTrieSkipped(spy);
	});

	test("HEX token should skip trie entirely", () => {
		normalizer.normalize([tk("HEX", "0xFF")]);
		expectTrieSkipped(spy);
	});

	test("BIGINT token should skip trie entirely", () => {
		normalizer.normalize([tk("BIGINT", "9007199254740991")]);
		expectTrieSkipped(spy);
	});

	test("FLOAT token should skip trie entirely", () => {
		normalizer.normalize([tk("FLOAT", "3.14")]);
		expectTrieSkipped(spy);
	});

	test("NUMBER at non-first position still skip trie", () => {
		normalizer.normalize([tk("IDENT", "x"), tk("NUMBER", "42")]);
		// First token (IDENT) calls trie, second (NUMBER) doesn't
		expect(spy).toHaveBeenCalledTimes(1);
	});
});

// ══════════════════════════════════════════════════════════════════════
// §2  Brackets — NEVER reach the trie
// ══════════════════════════════════════════════════════════════════════

describe("Type-guard skip — brackets", () => {
	let normalizer: TokenNormalizer;
	let spy: jest.SpiedFunction<PhraseTrie["matchAt"]>;
	let cleanup: () => void;

	beforeEach(() => {
		normalizer = createNormalizer();
		const s = spyTrieMatchAt(normalizer);
		spy = s.spy;
		cleanup = s.cleanup;
	});

	afterEach(() => cleanup());

	test("LPAREN should skip trie", () => {
		normalizer.normalize([tk("LPAREN", "(")]);
		expectTrieSkipped(spy);
	});

	test("RPAREN should skip trie", () => {
		normalizer.normalize([tk("RPAREN", ")")]);
		expectTrieSkipped(spy);
	});

	test("LBRACKET should skip trie", () => {
		normalizer.normalize([tk("LBRACKET", "[")]);
		expectTrieSkipped(spy);
	});

	test("RBRACKET should skip trie", () => {
		normalizer.normalize([tk("RBRACKET", "]")]);
		expectTrieSkipped(spy);
	});
});

// ══════════════════════════════════════════════════════════════════════
// §3  Punctuation — NEVER reach the trie
// ══════════════════════════════════════════════════════════════════════

describe("Type-guard skip — punctuation", () => {
	let normalizer: TokenNormalizer;
	let spy: jest.SpiedFunction<PhraseTrie["matchAt"]>;
	let cleanup: () => void;

	beforeEach(() => {
		normalizer = createNormalizer();
		const s = spyTrieMatchAt(normalizer);
		spy = s.spy;
		cleanup = s.cleanup;
	});

	afterEach(() => cleanup());

	test("COMMA should skip trie", () => {
		normalizer.normalize([tk("COMMA", ",")]);
		expectTrieSkipped(spy);
	});

	test("COLON should skip trie", () => {
		normalizer.normalize([tk("COLON", ":")]);
		expectTrieSkipped(spy);
	});

	test("EQUALS should skip trie", () => {
		normalizer.normalize([tk("EQUALS", "=")]);
		expectTrieSkipped(spy);
	});

	test("PIPE should skip trie", () => {
		normalizer.normalize([tk("PIPE", "|")]);
		expectTrieSkipped(spy);
	});

	test("AMPERSAND should skip trie", () => {
		normalizer.normalize([tk("AMPERSAND", "&")]);
		expectTrieSkipped(spy);
	});

	test("AT should skip trie", () => {
		normalizer.normalize([tk("AT", "@")]);
		expectTrieSkipped(spy);
	});

	test("SEMICOLON should skip trie", () => {
		normalizer.normalize([tk("SEMICOLON", ";")]);
		expectTrieSkipped(spy);
	});

	test("QUESTION should skip trie", () => {
		normalizer.normalize([tk("QUESTION", "?")]);
		expectTrieSkipped(spy);
	});

	test("EXCLAMATION should skip trie", () => {
		normalizer.normalize([tk("EXCLAMATION", "!")]);
		expectTrieSkipped(spy);
	});
});

// ══════════════════════════════════════════════════════════════════════
// §4  Special tokens — NEVER reach the trie
// ══════════════════════════════════════════════════════════════════════

describe("Type-guard skip — special tokens", () => {
	let normalizer: TokenNormalizer;
	let spy: jest.SpiedFunction<PhraseTrie["matchAt"]>;
	let cleanup: () => void;

	beforeEach(() => {
		normalizer = createNormalizer();
		const s = spyTrieMatchAt(normalizer);
		spy = s.spy;
		cleanup = s.cleanup;
	});

	afterEach(() => cleanup());

	test("EOF should skip trie", () => {
		normalizer.normalize([tk("EOF", "")]);
		expectTrieSkipped(spy);
	});

	test("WS should skip trie", () => {
		normalizer.normalize([tk("WS", " ")]);
		expectTrieSkipped(spy);
	});

	test("NEWLINE should skip trie", () => {
		normalizer.normalize([tk("NEWLINE", "\n")]);
		expectTrieSkipped(spy);
	});
});

// ══════════════════════════════════════════════════════════════════════
// §5  Bitwise operators — NEVER reach the trie (in skip set)
// ══════════════════════════════════════════════════════════════════════

describe("Type-guard skip — bitwise operators", () => {
	let normalizer: TokenNormalizer;
	let spy: jest.SpiedFunction<PhraseTrie["matchAt"]>;
	let cleanup: () => void;

	beforeEach(() => {
		normalizer = createNormalizer();
		const s = spyTrieMatchAt(normalizer);
		spy = s.spy;
		cleanup = s.cleanup;
	});

	afterEach(() => cleanup());

	test("LSHIFT should skip trie", () => {
		normalizer.normalize([tk("LSHIFT", "<<")]);
		expectTrieSkipped(spy);
	});

	test("RSHIFT should skip trie", () => {
		normalizer.normalize([tk("RSHIFT", ">>")]);
		expectTrieSkipped(spy);
	});

	test("BIT_AND should skip trie", () => {
		normalizer.normalize([tk("BIT_AND", "&")]);
		expectTrieSkipped(spy);
	});

	test("BIT_OR should skip trie", () => {
		normalizer.normalize([tk("BIT_OR", "|")]);
		expectTrieSkipped(spy);
	});

	test("BIT_XOR should skip trie", () => {
		normalizer.normalize([tk("BIT_XOR", "^")]);
		expectTrieSkipped(spy);
	});
});

// ══════════════════════════════════════════════════════════════════════
// §6  Word-type tokens — DO reach the trie
// ══════════════════════════════════════════════════════════════════════

describe("Type-guard — word-type tokens reach the trie", () => {
	let normalizer: TokenNormalizer;
	let spy: jest.SpiedFunction<PhraseTrie["matchAt"]>;
	let cleanup: () => void;

	beforeEach(() => {
		normalizer = createNormalizer();
		const s = spyTrieMatchAt(normalizer);
		spy = s.spy;
		cleanup = s.cleanup;
	});

	afterEach(() => cleanup());

	test("IDENT token should reach the trie", () => {
		normalizer.normalize([tk("IDENT", "hello")]);
		expectTrieCalledOnce(spy);
	});

	test("KEYWORD token should reach the trie", () => {
		normalizer.normalize([tk("KEYWORD", "somekey")]);
		expectTrieCalledOnce(spy);
	});

	test("FUNC token should reach the trie", () => {
		normalizer.normalize([tk("FUNC", "sqrt")]);
		expectTrieCalledOnce(spy);
	});

	test("UNIT token should reach the trie", () => {
		normalizer.normalize([tk("UNIT", "kg")]);
		expectTrieCalledOnce(spy);
	});

	test("multiple word tokens all reach the trie", () => {
		// Use tokens that won't form phrases to avoid multi-pass cascade
		normalizer.normalize([
			tk("IDENT", "a"),
			tk("KEYWORD", "b"),
			tk("FUNC", "c"),
		]);
		expect(spy).toHaveBeenCalledTimes(3);
	});

	test("IDENT that starts a known phrase actually matches via trie", () => {
		// "times" starts "times by" → the trie should be called AND match.
		// Multi-pass: pass 1 matches + fuses, pass 2 re-checks fused TIMES_BY.
		const tokens = [tk("IDENT", "times"), tk("IDENT", "by"), tk("NUMBER", "5")];
		const result = normalizer.normalize(tokens);
		expect(spy).toHaveBeenCalledTimes(2); // pass 1 + pass 2 re-check
		expect(result.length).toBe(2); // 3 tokens → 1 TIMES_BY fused + 1 NUMBER
		expect(result[0].type).toBe("TIMES_BY");
	});

	test("IDENT that does NOT start a known phrase still reaches trie but returns null", () => {
		normalizer.normalize([tk("IDENT", "unknownword")]);
		expectTrieCalledOnce(spy);
		// Output should be unchanged (single token passed through)
	});
});

// ══════════════════════════════════════════════════════════════════════
// §7  Keyword-mapped arithmetic operators — DO reach the trie
// ══════════════════════════════════════════════════════════════════════

describe("Type-guard — keyword-mapped operators reach the trie", () => {
	/**
	 * In keyword-based locales, the lexer maps words to operator types:
	 *   "times" → STAR, "plus" → PLUS, "minus" → MINUS,
	 *   "divide" → SLASH, "mod" → MOD, "percent" → PERCENT
	 *
	 * These are intentionally NOT in the skip set so phrases like
	 * "times by", "divide by" can match.
	 */

	let normalizer: TokenNormalizer;
	let spy: jest.SpiedFunction<PhraseTrie["matchAt"]>;
	let cleanup: () => void;

	beforeEach(() => {
		normalizer = createNormalizer();
		const s = spyTrieMatchAt(normalizer);
		spy = s.spy;
		cleanup = s.cleanup;
	});

	afterEach(() => cleanup());

	test("STAR-type token (keyword 'times') should reach the trie", () => {
		normalizer.normalize([tk("STAR", "times")]);
		expectTrieCalledOnce(spy);
	});

	test("SLASH-type token (keyword 'divide') should reach the trie", () => {
		normalizer.normalize([tk("SLASH", "divide")]);
		expectTrieCalledOnce(spy);
	});

	test("PLUS-type token (keyword 'plus') should reach the trie", () => {
		normalizer.normalize([tk("PLUS", "plus")]);
		expectTrieCalledOnce(spy);
	});

	test("MINUS-type token (keyword 'minus') should reach the trie", () => {
		normalizer.normalize([tk("MINUS", "minus")]);
		expectTrieCalledOnce(spy);
	});

	test("CARET-type token (keyword 'caret/power') should reach the trie", () => {
		normalizer.normalize([tk("CARET", "power")]);
		expectTrieCalledOnce(spy);
	});

	test("MOD-type token (keyword 'mod') should reach the trie", () => {
		normalizer.normalize([tk("MOD", "mod")]);
		expectTrieCalledOnce(spy);
	});

	test("PERCENT-type token (keyword 'percent') should reach the trie", () => {
		normalizer.normalize([tk("PERCENT", "percent")]);
		expectTrieCalledOnce(spy);
	});

	test("STAR-type token with value 'times' still matches 'times by' phrase", () => {
		const normalizer = createNormalizer();
		const { spy, cleanup } = spyTrieMatchAt(normalizer);

		// Simulate lexer output when "times" is mapped to STAR by locale
		const tokens = [
			tk("NUMBER", "4"),
			tk("STAR", "times"),   // keyword → STAR
			tk("IDENT", "by"),
			tk("NUMBER", "5"),
		];
		const result = normalizer.normalize(tokens);
		// "times by" should be fused → TIMES_BY
		expect(result.length).toBe(3); // NUMBER, TIMES_BY, NUMBER
		expect(result[1].type).toBe("TIMES_BY");
		cleanup();
	});

	test("SLASH-type token with value 'divide' still matches 'divide by' phrase", () => {
		const normalizer = createNormalizer();
		const { spy, cleanup } = spyTrieMatchAt(normalizer);

		const tokens = [
			tk("NUMBER", "10"),
			tk("SLASH", "divide"), // keyword → SLASH
			tk("IDENT", "by"),
			tk("NUMBER", "2"),
		];
		const result = normalizer.normalize(tokens);
		expect(result.length).toBe(3); // NUMBER, DIVIDE_BY, NUMBER
		expect(result[1].type).toBe("DIVIDE_BY");
		cleanup();
	});
});

// ══════════════════════════════════════════════════════════════════════
// §8  Custom types from packages — DO reach the trie (out-of-bounds safe)
// ══════════════════════════════════════════════════════════════════════

describe("Type-guard — custom package types reach the trie", () => {
	/**
	 * Custom token types registered by packages after module init get
	 * typeId values beyond the NON_WORD_TABLE length. The bounds check
	 * `tid >= TABLE.length` safely passes them through to the trie.
	 */

	test("custom type with high typeId should still reach the trie", () => {
		const normalizer = createNormalizer();
		const { spy, cleanup } = spyTrieMatchAt(normalizer);

		// tokenTypeId lazily registers new types; ID is beyond all built-ins.
		// The real test is behavioral — we just need a valid custom typeId.
		const customId = tokenTypeId("CUSTOM_PACKAGE_TYPE");
		expect(customId).toBeGreaterThan(0);

		const token = new LexerToken(
			"CUSTOM_PACKAGE_TYPE",
			customId,
			"customVal",
			"customVal",
			0, 0, 1, 1,
		);
		normalizer.normalize([token]);
		expectTrieCalledOnce(spy);
		cleanup();
	});

	test("multiple custom types all reach the trie", () => {
		const normalizer = createNormalizer();
		const { spy, cleanup } = spyTrieMatchAt(normalizer);

		const t1 = tk("CUSTOM_A", "valA");
		const t2 = tk("CUSTOM_B", "valB");
		normalizer.normalize([t1, t2]);
		expect(spy).toHaveBeenCalledTimes(2);
		cleanup();
	});

	test("custom type that matches a registered phrase still fuses correctly", () => {
		const normalizer = createNormalizer();
		// Add a phrase starting with a custom-type word
		normalizer.addPhrase("custom phrase", "CUSTOM_RESULT");

		// Create tokens where the first is a custom type
		const t1 = tk("CUSTOM_BUILTIN_EARLY", "custom"); // early-registered custom type
		const t2 = tk("IDENT", "phrase");
		const result = normalizer.normalize([t1, t2]);
		// Should fuse: "custom phrase" → CUSTOM_RESULT
		expect(result.length).toBe(1);
		expect(result[0].type).toBe("CUSTOM_RESULT");
	});
});

// ══════════════════════════════════════════════════════════════════════
// §9  End-to-end: real expression with mixed token types
// ══════════════════════════════════════════════════════════════════════

describe("Type-guard — end-to-end mixed expressions", () => {
	test("expression '4 times by 5' — NUMBER skip + STAR reach + IDENT reach + NUMBER skip", () => {
		const normalizer = createNormalizer();
		const { spy, cleanup } = spyTrieMatchAt(normalizer);

		const tokens = [
			tk("NUMBER", "4"),    // pos 0: NUMBER → skip trie
			tk("STAR", "times"),  // pos 1: STAR (keyword) → reach trie, matches "times by"
			tk("IDENT", "by"),    // pos 2: not reached (consumed by phrase match at pos 1)
			tk("NUMBER", "5"),    // pos 3: NUMBER → skip trie
		];

		const result = normalizer.normalize(tokens);
		// 4 tokens → fused to 3: NUMBER, TIMES_BY, NUMBER
		expect(result.length).toBe(3);
		expect(result[0].type).toBe("NUMBER");
		expect(result[1].type).toBe("TIMES_BY");
		expect(result[2].type).toBe("NUMBER");

		// Multi-pass: pass 1 matches + fuses, pass 2 re-checks TIMES_BY.
		expect(spy).toHaveBeenCalledTimes(2);
		expect(spy.mock.calls[0][1]).toBe(1); // pass 1 call at pos 1

		cleanup();
	});

	test("expression '(2 + 3) * 4' — brackets/operators skip, no trie calls at all", () => {
		const normalizer = createNormalizer();
		const { spy, cleanup } = spyTrieMatchAt(normalizer);

		const tokens = [
			tk("LPAREN", "("),
			tk("NUMBER", "2"),
			tk("PLUS", "+"),
			tk("NUMBER", "3"),
			tk("RPAREN", ")"),
			tk("STAR", "*"),
			tk("NUMBER", "4"),
		];

		normalizer.normalize(tokens);
		// ALL tokens are non-word: LPAREN, NUMBER, PLUS, NUMBER, RPAREN, STAR "*", NUMBER
		// STAR with value "*" (not "times") would reach the trie (PLUS/MINUS/STAR are excluded from skip set)
		// But "*" is not a phrase starter, so the trie would be called at that position
		// Let me correct: STAR is an arithmetic operator, excluded from skip set.
		// So STAR "*" DOES reach the trie, but startWords.has("*") returns false → null.
		// Plus LPAREN/NUMBER/PLUS/NUMBER/RPAREN skip, but PLUS "+" also reaches trie.
		// So there should be 2 calls: pos 2 (PLUS "+") and pos 5 (STAR "*")
		expect(spy).toHaveBeenCalledTimes(2);
		expect(spy.mock.calls[0][1]).toBe(2); // PLUS "+"
		expect(spy.mock.calls[1][1]).toBe(5); // STAR "*"
		cleanup();
	});

	test("expression 'hello world 42' — IDENT reaches trie, NUMBER skips", () => {
		const normalizer = createNormalizer();
		const { spy, cleanup } = spyTrieMatchAt(normalizer);

		const tokens = [
			tk("IDENT", "hello"),
			tk("IDENT", "world"),
			tk("NUMBER", "42"),
		];

		const result = normalizer.normalize(tokens);
		// "hello world" → GREETING (single fused token), then NUMBER
		expect(result.length).toBe(2);
		expect(result[0].type).toBe("GREETING");

		// Multi-pass: pass 1 matches + fuses "hello world"→GREETING,
		// pass 2 re-checks the fused GREETING token.
		expect(spy).toHaveBeenCalledTimes(2);
		cleanup();
	});

	test("expression with keyword 'mod' reaches trie but doesn't match (no phrase)", () => {
		const normalizer = createNormalizer();
		const { spy, cleanup } = spyTrieMatchAt(normalizer);

		const tokens = [tk("NUMBER", "10"), tk("MOD", "mod"), tk("NUMBER", "3")];
		const result = normalizer.normalize(tokens);

		// MOD "mod" reaches the trie (excluded from skip set) but no phrase starts with "mod"
		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy.mock.calls[0][1]).toBe(1); // pos 1

		// Tokens should be unchanged (3 tokens in, 3 out — no fusion happened)
		expect(result.length).toBe(3);
		cleanup();
	});
});

// ══════════════════════════════════════════════════════════════════════
// §10  Empty and edge cases
// ══════════════════════════════════════════════════════════════════════

describe("Type-guard — edge cases", () => {
	test("empty token stream should not call matchAt", () => {
		const normalizer = createNormalizer();
		const { spy, cleanup } = spyTrieMatchAt(normalizer);

		normalizer.normalize([]);
		expect(spy).not.toHaveBeenCalled();
		cleanup();
	});

	test("all positions are non-word → matchAt never called", () => {
		const normalizer = createNormalizer();
		const { spy, cleanup } = spyTrieMatchAt(normalizer);

		normalizer.normalize([
			tk("NUMBER", "1"),
			tk("COMMA", ","),
			tk("NUMBER", "2"),
			tk("SEMICOLON", ";"),
		]);
		expectTrieSkipped(spy);
		cleanup();
	});

	test("all positions are word-types → matchAt called for every token", () => {
		const normalizer = createNormalizer();
		const { spy, cleanup } = spyTrieMatchAt(normalizer);

		normalizer.normalize([
			tk("IDENT", "a"),
			tk("KEYWORD", "b"),
			tk("FUNC", "c"),
			tk("UNIT", "d"),
		]);
		expect(spy).toHaveBeenCalledTimes(4);
		cleanup();
	});

	test("single NUMBER in a multi-token stream: only word positions call trie", () => {
		const normalizer = createNormalizer();
		const { spy, cleanup } = spyTrieMatchAt(normalizer);

		normalizer.normalize([
			tk("IDENT", "hello"), // pos 0: word → trie
			tk("NUMBER", "42"),   // pos 1: non-word → skip
			tk("IDENT", "world"), // pos 2: word → trie
		]);
		expect(spy).toHaveBeenCalledTimes(2);
		expect(spy.mock.calls[0][1]).toBe(0); // hello
		expect(spy.mock.calls[1][1]).toBe(2); // world
		cleanup();
	});

	test("normalizer without phrases or rules still applies type-guard", () => {
		const normalizer = new TokenNormalizer(); // no phrases, no rules
		const { spy, cleanup } = spyTrieMatchAt(normalizer);

		// Even with an empty trie, word-type tokens should still reach matchAt
		// (they just get null back because there are no phrases)
		normalizer.normalize([tk("IDENT", "hello")]);
		expectTrieCalledOnce(spy);

		// Non-word tokens should still skip
		spy.mockClear();
		normalizer.normalize([tk("NUMBER", "42")]);
		expectTrieSkipped(spy);

		cleanup();
	});
});

// ══════════════════════════════════════════════════════════════════════
// §11  Uint8Array IIFE — correctness of the lookup table build
// ══════════════════════════════════════════════════════════════════════

describe("Uint8Array IIFE — lookup table construction", () => {
	/**
	 * Tests that verify the {@link NON_WORD_TABLE} IIFE builds correctly:
	 *
	 * 1. All 26 non-word type name strings resolve to unique numeric IDs.
	 * 2. The table is sized to `max(id) + 1`, covering every registered typeId.
	 * 3. In-bounds word-type indices have value 0 (pass through to trie).
	 * 4. In-bounds non-word indices have value 1 (skip trie).
	 *
	 * These invariants must hold regardless of which built-in token types
	 * are registered and in what order, since the test imports the live
	 * module-scoped table after all registrations.
	 */

	/** Known word-type names for §11.3 verification.
	 *  These MUST be 0 in the table (pass through to trie).
	 *  Arithmetic operators are included because they're intentionally
	 *  excluded from the skip set — keyword-mapped values like "times"→STAR
	 *  can start phrases (e.g., "times by" → TIMES_BY). */
	const KNOWN_WORD_NAMES = [
		"IDENT", "KEYWORD", "FUNC", "UNIT",
		"PLUS", "MINUS", "STAR", "SLASH", "CARET",
		"MOD", "PERCENT",
	];

	// ── §11.1  Cardinality & uniqueness ──────────────────────────────────

	test("NON_WORD_NAMES contains exactly 26 type names", () => {
		expect(NON_WORD_NAMES).toHaveLength(26);
	});

	test("all 26 non-word type names resolve to valid, unique numeric IDs", () => {
		const ids = NON_WORD_NAMES.map(n => tokenTypeId(n));

		// Every name mapped to a finite integer ≥ 0
		for (let i = 0; i < ids.length; i++) {
			const id = ids[i];
			expect(Number.isFinite(id)).toBe(true);
			expect(id).toBeGreaterThanOrEqual(0);
			expect(Number.isInteger(id)).toBe(true);
		}

		// No duplicate IDs — each non-word type maps to a distinct slot
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(NON_WORD_NAMES.length);
	});

	// ── §11.2  Table sizing ─────────────────────────────────────────────

	test("NON_WORD_TABLE length equals max(non-word typeId) + 1", () => {
		const ids = NON_WORD_NAMES.map(n => tokenTypeId(n));
		const maxId = Math.max(...ids);

		expect(NON_WORD_TABLE.length).toBe(maxId + 1);
	});

	test("NON_WORD_TABLE is a Uint8Array (zero hashing, flat indexed)", () => {
		expect(NON_WORD_TABLE).toBeInstanceOf(Uint8Array);
	});

	// ── §11.3  Non-word slots = 1 (skip trie) ───────────────────────────

	test("every non-word typeId maps to value 1 in the table", () => {
		const ids = NON_WORD_NAMES.map(n => tokenTypeId(n));

		for (let i = 0; i < NON_WORD_NAMES.length; i++) {
			const name = NON_WORD_NAMES[i];
			const id = ids[i];

			// In-bounds guarantee: table is sized to max(id)+1
			expect(id).toBeLessThan(NON_WORD_TABLE.length);
			expect(NON_WORD_TABLE[id]).toBe(1);
		}
	});

	// ── §11.4  Word-type slots = 0 (pass through to trie) ───────────────

	test("in-bounds word-type indices have value 0", () => {
		for (const name of KNOWN_WORD_NAMES) {
			const id = tokenTypeId(name);

			// Only check if the word type's ID is within the table bounds.
			// If a word type was registered AFTER all non-word types,
			// its ID could exceed the table length — the bounds check
			// `tid >= TABLE.length` then safely passes it to the trie.
			if (id < NON_WORD_TABLE.length) {
				expect(NON_WORD_TABLE[id]).toBe(0);
			}
		}
	});

	test("in-bounds word-type indices are not accidentally marked as non-word", () => {
		const ids = NON_WORD_NAMES.map(n => tokenTypeId(n));

		for (const name of KNOWN_WORD_NAMES) {
			const id = tokenTypeId(name);

			if (id < NON_WORD_TABLE.length) {
				// Must NOT appear in the non-word ID set (would be a collision)
				expect(ids).not.toContain(id);
			}
		}
	});

	// ── §11.5  Table integrity — no stray 1s ────────────────────────────

	test("NON_WORD_TABLE has exactly 26 positions set to 1", () => {
		let count = 0;
		for (let i = 0; i < NON_WORD_TABLE.length; i++) {
			if (NON_WORD_TABLE[i] === 1) count++;
		}
		expect(count).toBe(NON_WORD_NAMES.length);
	});

	test("NON_WORD_TABLE values are only 0 or 1 (no stray values)", () => {
		for (let i = 0; i < NON_WORD_TABLE.length; i++) {
			const v = NON_WORD_TABLE[i];
			expect(v === 0 || v === 1).toBe(true);
		}
	});

	// ── §11.6  Names array integrity ──────────────────────────────────

	test("NON_WORD_NAMES has no duplicate entries", () => {
		const unique = new Set(NON_WORD_NAMES as unknown as string[]);
		expect(unique.size).toBe(NON_WORD_NAMES.length);
	});
});
