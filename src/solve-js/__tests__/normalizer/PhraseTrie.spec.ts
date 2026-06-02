import { describe, expect, test, beforeEach } from "@jest/globals";
import { PhraseTrie } from "@solve-js/normalizer/PhraseTrie";
import { LexerToken } from "@solve-js/lexer/ExpressionLexer";
import { tokenTypeId } from "@solve-js/lexer/Token";
import type { Token } from "@solve-js/lexer/Token";

/** Helper: create a simple token. */
function tk(type: string, value: string, offset = 0): Token {
	return new LexerToken(type, tokenTypeId(type), value, value, offset, 0, 1, offset + 1);
}

/** Helper: tokens from a space-separated string. */
function tokensFrom(words: string, type = "IDENT"): Token[] {
	return words.split(" ").map((w, i) => tk(type, w, i));
}

// ══════════════════════════════════════════════════════════════════════
// §1  Basic addPhrase & matchAt
// ══════════════════════════════════════════════════════════════════════

describe("PhraseTrie — basic matching", () => {
	let trie: PhraseTrie;

	beforeEach(() => {
		trie = new PhraseTrie();
		trie.addPhrase("to the power of", "CARET");
		trie.addPhrase("power of", "CARET");
	});

	test("should match a multi-word phrase", () => {
		const tokens = tokensFrom("to the power of 3");
		const match = trie.matchAt(tokens, 0);
		expect(match).not.toBeNull();
		expect(match!.consumed).toBe(4);
		expect(match!.replacement.length).toBe(1);
		expect(match!.replacement[0].type).toBe("CARET");
		expect(match!.ruleName).toBe("to the power of");
	});

	test("should match a shorter phrase when longer prefix doesn't match", () => {
		const tokens = tokensFrom("power of 3");
		const match = trie.matchAt(tokens, 0);
		expect(match).not.toBeNull();
		expect(match!.consumed).toBe(2);
		expect(match!.replacement[0].type).toBe("CARET");
		expect(match!.ruleName).toBe("power of");
	});

	test("should return null when no phrase matches at position", () => {
		const tokens = tokensFrom("hello world foo bar");
		// Add to trie so startWords is non-empty
		expect(trie.matchAt(tokens, 0)).toBeNull();
	});

	test("should return null when first word matches but rest doesn't", () => {
		const tokens = tokensFrom("to something else");
		expect(trie.matchAt(tokens, 0)).toBeNull();
	});
});

// ══════════════════════════════════════════════════════════════════════
// §2  Longest-match-wins (overlapping phrases)
// ══════════════════════════════════════════════════════════════════════

describe("PhraseTrie — longest-match-wins", () => {
	let trie: PhraseTrie;

	beforeEach(() => {
		trie = new PhraseTrie();
		trie.addPhrase("power of", "CARET");
		trie.addPhrase("to the power of", "CARET");
	});

	test("should prefer 'to the power of' over 'power of' at position 0", () => {
		const tokens = tokensFrom("to the power of 3");
		const match = trie.matchAt(tokens, 0);
		expect(match!.consumed).toBe(4); // 4, not 2
		expect(match!.ruleName).toBe("to the power of");
	});

	test("should match 'power of' when it doesn't start with 'to'", () => {
		const tokens = tokensFrom("power of 10");
		const match = trie.matchAt(tokens, 0);
		expect(match!.consumed).toBe(2);
		expect(match!.ruleName).toBe("power of");
	});

	test("should handle three overlapping phrases", () => {
		trie.addPhrase("to the", "TO_THE");
		const tokens = tokensFrom("to the power of 5");

		// "to the power of" (4 words) beats "to the" (2 words)
		const match = trie.matchAt(tokens, 0);
		expect(match!.consumed).toBe(4);
		expect(match!.ruleName).toBe("to the power of");
	});

	test("should match shorter overlap when longer prefix diverges", () => {
		trie.addPhrase("to the", "TO_THE"); // register for this test
		const tokens = tokensFrom("to the wrong");
		const match = trie.matchAt(tokens, 0);
		// "to the" should match, "to the power of" fails at "wrong"
		expect(match!.consumed).toBe(2);
		expect(match!.ruleName).toBe("to the");
	});
});

// ══════════════════════════════════════════════════════════════════════
// §3  O(1) quick-reject
// ══════════════════════════════════════════════════════════════════════

describe("PhraseTrie — O(1) quick-reject", () => {
	let trie: PhraseTrie;

	beforeEach(() => {
		trie = new PhraseTrie();
		trie.addPhrase("increase by", "INCREASE_BY");
		trie.addPhrase("times by", "TIMES_BY");
	});

	test("should return null immediately for numbers", () => {
		const tokens = [tk("NUMBER", "42"), tk("PLUS", "+"), tk("NUMBER", "7")];
		expect(trie.matchAt(tokens, 0)).toBeNull(); // "42" not in startWords
	});

	test("should return null immediately for operators", () => {
		const tokens = [tk("PLUS", "+"), tk("NUMBER", "1")];
		expect(trie.matchAt(tokens, 0)).toBeNull();
	});

	test("should return null immediately for unmatched identifiers", () => {
		const tokens = tokensFrom("hello world");
		expect(trie.matchAt(tokens, 0)).toBeNull();
	});

	test("canStart should reflect startWords accurately", () => {
		expect(trie.canStart("increase")).toBe(true);
		expect(trie.canStart("times")).toBe(true);
		expect(trie.canStart("INCREASE")).toBe(true); // case-insensitive
		expect(trie.canStart("hello")).toBe(false);
		expect(trie.canStart("42")).toBe(false);
	});
});

// ══════════════════════════════════════════════════════════════════════
// §4  Single-word phrases
// ══════════════════════════════════════════════════════════════════════

describe("PhraseTrie — single-word phrases", () => {
	let trie: PhraseTrie;

	beforeEach(() => {
		trie = new PhraseTrie();
		trie.addPhrase("now", "NOW");
	});

	test("should match a single-word phrase", () => {
		const tokens = [tk("IDENT", "now"), tk("NUMBER", "42")];
		const match = trie.matchAt(tokens, 0);
		expect(match).not.toBeNull();
		expect(match!.consumed).toBe(1);
		expect(match!.replacement[0].type).toBe("NOW");
	});

	test("should match case-insensitively", () => {
		const tokens = [tk("IDENT", "Now"), tk("NUMBER", "42")];
		const match = trie.matchAt(tokens, 0);
		expect(match).not.toBeNull();
		expect(match!.consumed).toBe(1);
	});

	test("single-word phrase should be in startWords", () => {
		expect(trie.canStart("now")).toBe(true);
		expect(trie.canStart("NOW")).toBe(true);
	});

	test("single-word phrase should report ruleName", () => {
		const tokens = [tk("IDENT", "now")];
		const match = trie.matchAt(tokens, 0);
		expect(match!.ruleName).toBe("now");
	});
});

// ══════════════════════════════════════════════════════════════════════
// §5  Empty trie
// ══════════════════════════════════════════════════════════════════════

describe("PhraseTrie — empty trie", () => {
	test("should return null for any tokens when no phrases registered", () => {
		const trie = new PhraseTrie();
		const tokens = tokensFrom("to the power of 3");
		expect(trie.matchAt(tokens, 0)).toBeNull();
	});

	test("size should be 0 for empty trie", () => {
		const trie = new PhraseTrie();
		expect(trie.size).toBe(0);
	});

	test("canStart should return false for any word", () => {
		const trie = new PhraseTrie();
		expect(trie.canStart("anything")).toBe(false);
		expect(trie.canStart("to")).toBe(false);
	});
});

// ══════════════════════════════════════════════════════════════════════
// §6  Size tracking
// ══════════════════════════════════════════════════════════════════════

describe("PhraseTrie — size tracking", () => {
	test("size counts unique first words, not total phrases", () => {
		const trie = new PhraseTrie();
		trie.addPhrase("to the power of", "CARET");
		trie.addPhrase("to the", "TO_THE"); // same first word
		trie.addPhrase("power of", "CARET");
		trie.addPhrase("times by", "TIMES_BY");

		expect(trie.size).toBe(3); // "to", "power", "times"
	});

	test("size increments when unique first word added", () => {
		const trie = new PhraseTrie();
		expect(trie.size).toBe(0);
		trie.addPhrase("hello world", "HELLO");
		expect(trie.size).toBe(1);
		trie.addPhrase("hello again", "HELLO"); // same first word
		expect(trie.size).toBe(1); // unchanged
		trie.addPhrase("goodbye world", "BYE");
		expect(trie.size).toBe(2);
	});
});

// ══════════════════════════════════════════════════════════════════════
// §7  Case insensitivity
// ══════════════════════════════════════════════════════════════════════

describe("PhraseTrie — case insensitivity", () => {
	let trie: PhraseTrie;

	beforeEach(() => {
		trie = new PhraseTrie();
		trie.addPhrase("to the power of", "CARET");
		trie.addPhrase("increase by", "INCREASE_BY");
	});

	test("should match regardless of token case", () => {
		const upper = tokensFrom("TO THE POWER OF 3");
		const mixed = [tk("IDENT", "To"), tk("IDENT", "tHe"), tk("IDENT", "PoWeR"), tk("IDENT", "Of"), tk("NUMBER", "3")];
		const lower = tokensFrom("to the power of 3");

		expect(trie.matchAt(upper, 0)!.consumed).toBe(4);
		expect(trie.matchAt(mixed, 0)!.consumed).toBe(4);
		expect(trie.matchAt(lower, 0)!.consumed).toBe(4);
	});

	test("should match single-word phrase case-insensitively", () => {
		trie.addPhrase("hello", "GREETING");
		expect(trie.matchAt([tk("IDENT", "HELLO")], 0)!.consumed).toBe(1);
		expect(trie.matchAt([tk("IDENT", "Hello")], 0)!.consumed).toBe(1);
		expect(trie.matchAt([tk("IDENT", "hello")], 0)!.consumed).toBe(1);
	});
});

// ══════════════════════════════════════════════════════════════════════
// §8  ruleName in NormalizerMatch
// ══════════════════════════════════════════════════════════════════════

describe("PhraseTrie — ruleName in NormalizerMatch", () => {
	test("should carry the phrase as ruleName", () => {
		const trie = new PhraseTrie();
		trie.addPhrase("times by", "TIMES_BY");
		trie.addPhrase("multiply by", "MULTIPLY_BY");

		const tokens = tokensFrom("times by 5");
		const match = trie.matchAt(tokens, 0);
		expect(match!.ruleName).toBe("times by");
	});

	test("longest match should carry its own ruleName", () => {
		const trie = new PhraseTrie();
		trie.addPhrase("power of", "CARET");
		trie.addPhrase("to the power of", "CARET");

		const tokens = tokensFrom("to the power of 3");
		const match = trie.matchAt(tokens, 0);
		expect(match!.consumed).toBe(4);
		expect(match!.ruleName).toBe("to the power of");
	});

	test("non-match should return null (no ruleName)", () => {
		const trie = new PhraseTrie();
		trie.addPhrase("hello", "GREETING");
		const tokens = tokensFrom("goodbye world");
		expect(trie.matchAt(tokens, 0)).toBeNull();
	});
});

// ══════════════════════════════════════════════════════════════════════
// §9  Branching: multiple phrases with shared prefixes
// ══════════════════════════════════════════════════════════════════════

describe("PhraseTrie — branching with shared prefixes", () => {
	let trie: PhraseTrie;

	beforeEach(() => {
		trie = new PhraseTrie();
		trie.addPhrase("divide by", "DIVIDE_BY");
		trie.addPhrase("divide into", "DIVIDE_INTO");
	});

	test("should match 'divide by' when followed by 'by'", () => {
		const tokens = tokensFrom("divide by 10");
		const match = trie.matchAt(tokens, 0);
		expect(match).not.toBeNull();
		expect(match!.consumed).toBe(2);
		expect(match!.replacement[0].type).toBe("DIVIDE_BY");
	});

	test("should match 'divide into' when followed by 'into'", () => {
		const tokens = tokensFrom("divide into parts");
		const match = trie.matchAt(tokens, 0);
		expect(match).not.toBeNull();
		expect(match!.consumed).toBe(2);
		expect(match!.replacement[0].type).toBe("DIVIDE_INTO");
	});

	test("should not match when second word is unrelated", () => {
		const tokens = tokensFrom("divide apples");
		expect(trie.matchAt(tokens, 0)).toBeNull();
	});

	test("should handle deep branching", () => {
		trie.addPhrase("to", "TO");
		trie.addPhrase("to the", "TO_THE");
		trie.addPhrase("to the power of", "CARET");
		const tokens = tokensFrom("to the power of 3");

		const match = trie.matchAt(tokens, 0);
		expect(match!.consumed).toBe(4);
		expect(match!.ruleName).toBe("to the power of");
	});
});

// ══════════════════════════════════════════════════════════════════════
// §10  End-of-tokens edge cases
// ══════════════════════════════════════════════════════════════════════

describe("PhraseTrie — end-of-tokens edge cases", () => {
	test("should return null when pos is at the last token and no single-word match", () => {
		const trie = new PhraseTrie();
		trie.addPhrase("to the power of", "CARET");
		const tokens = tokensFrom("to");
		expect(trie.matchAt(tokens, 0)).toBeNull(); // only "to", phrase needs 4 tokens
	});

	test("should match partial prefix as single-word if registered", () => {
		const trie = new PhraseTrie();
		trie.addPhrase("to", "TO");
		trie.addPhrase("to the power of", "CARET");
		const tokens = [tk("IDENT", "to")];
		const match = trie.matchAt(tokens, 0);
		expect(match).not.toBeNull();
		expect(match!.consumed).toBe(1);
		expect(match!.ruleName).toBe("to");
	});

	test("should stop at stream end for multi-word phrase", () => {
		const trie = new PhraseTrie();
		trie.addPhrase("power of", "CARET");
		const tokens = tokensFrom("power"); // truncated — missing "of"
		expect(trie.matchAt(tokens, 0)).toBeNull();
	});

	test("should handle position at last token with no matches", () => {
		const trie = new PhraseTrie();
		trie.addPhrase("hello world", "HELLO");
		const tokens = tokensFrom("hello");
		expect(trie.matchAt(tokens, 0)).toBeNull();
	});
});

// ══════════════════════════════════════════════════════════════════════
// §11  Token type preservation in fused output
// ══════════════════════════════════════════════════════════════════════

describe("PhraseTrie — fused token correctness", () => {
	test("should create fused token with correct type", () => {
		const trie = new PhraseTrie();
		trie.addPhrase("to the power of", "CARET");
		trie.addPhrase("times by", "TIMES_BY");

		const tokens = tokensFrom("to the power of 5");
		const match = trie.matchAt(tokens, 0);
		expect(match!.replacement[0].type).toBe("CARET");
	});

	test("should create fused token with combined value", () => {
		const trie = new PhraseTrie();
		trie.addPhrase("times by", "TIMES_BY");
		const tokens = tokensFrom("times by 10");
		const match = trie.matchAt(tokens, 0);
		expect(match!.replacement[0].value).toBe("times by");
	});

	test("should preserve source token positions", () => {
		const trie = new PhraseTrie();
		trie.addPhrase("power of", "CARET");
		const tokens = [
			tk("IDENT", "power", 10),
			tk("IDENT", "of", 16),
		];
		const match = trie.matchAt(tokens, 0);
		expect(match!.replacement[0].offset).toBe(10); // first source token's offset
	});

	test("should consume exactly the right number of source tokens", () => {
		const trie = new PhraseTrie();
		trie.addPhrase("increase by", "INCREASE_BY");
		const tokens = [...tokensFrom("increase by 20 percent")];
		const match = trie.matchAt(tokens, 0);
		expect(match!.consumed).toBe(2); // only "increase" and "by"
		// Tokens after should still be "20", "percent"
		expect(tokens[2].value).toBe("20");
		expect(tokens[3].value).toBe("percent");
	});
});

// ══════════════════════════════════════════════════════════════════════
// §12  matchAt at non-zero positions
// ══════════════════════════════════════════════════════════════════════

describe("PhraseTrie — matchAt at non-zero positions", () => {
	test("should match a phrase at pos > 0 in the middle of the stream", () => {
		const trie = new PhraseTrie();
		trie.addPhrase("power of", "CARET");
		const tokens = tokensFrom("2 + power of 3");
		const match = trie.matchAt(tokens, 2); // phrase starts at index 2
		expect(match).not.toBeNull();
		expect(match!.consumed).toBe(2);
		expect(match!.replacement[0].type).toBe("CARET");
	});

	test("should not match when pos points to non-phrase token", () => {
		const trie = new PhraseTrie();
		trie.addPhrase("power of", "CARET");
		const tokens = tokensFrom("power of 5");
		// "of" at pos=1 is not a start word
		expect(trie.matchAt(tokens, 1)).toBeNull();
	});

	test("should match at last token for single-word phrase", () => {
		const trie = new PhraseTrie();
		trie.addPhrase("hello", "GREETING");
		const tokens = tokensFrom("say hello");
		const match = trie.matchAt(tokens, 1);
		expect(match).not.toBeNull();
		expect(match!.consumed).toBe(1);
		expect(match!.replacement[0].type).toBe("GREETING");
	});

	test("should return null when pos is out of bounds", () => {
		const trie = new PhraseTrie();
		trie.addPhrase("hello", "GREETING");
		const tokens = tokensFrom("hello");
		expect(trie.matchAt(tokens, 99)).toBeNull();
	});
});

// ══════════════════════════════════════════════════════════════════════
// §13  Edge cases: empty/whitespace phrases
// ══════════════════════════════════════════════════════════════════════

describe("PhraseTrie — edge cases", () => {
	test("should not crash on empty string phrase", () => {
		const trie = new PhraseTrie();
		expect(() => trie.addPhrase("", "X")).not.toThrow();
		expect(trie.size).toBe(0);
	});

	test("should handle consecutive spaces in phrase", () => {
		const trie = new PhraseTrie();
		trie.addPhrase("to  the  power", "CARET");
		const tokens = tokensFrom("to the power 5");
		const match = trie.matchAt(tokens, 0);
		expect(match).not.toBeNull();
		expect(match!.consumed).toBe(3);
	});

	test("should handle whitespace-only phrase", () => {
		const trie = new PhraseTrie();
		expect(() => trie.addPhrase("   ", "X")).not.toThrow();
		expect(trie.size).toBe(0);
	});
});

// ══════════════════════════════════════════════════════════════════════
// §14  Package scenario: adding phrases dynamically
// ══════════════════════════════════════════════════════════════════════

describe("PhraseTrie — package-like phrase registration", () => {
	test("should handle phrases added as Record<string, string> (package API)", () => {
		const trie = new PhraseTrie();
		const pkgPhrases: Record<string, string> = {
			"abyssal whip": "ITEM",
			"dragon scimitar": "ITEM",
			"rune platebody": "ITEM",
		};
		for (const [phrase, tokenType] of Object.entries(pkgPhrases)) {
			trie.addPhrase(phrase, tokenType);
		}

		expect(trie.size).toBe(3);

		const tokens = tokensFrom("abyssal whip cost");
		const match = trie.matchAt(tokens, 0);
		expect(match).not.toBeNull();
		expect(match!.consumed).toBe(2);
		expect(match!.replacement[0].type).toBe("ITEM");
	});

	test("multiple package-like registrations accumulate", () => {
		const trie = new PhraseTrie();

		// Package A
		trie.addPhrase("abyssal whip", "ITEM");
		trie.addPhrase("dragon scimitar", "ITEM");

		// Package B
		trie.addPhrase("to the power of", "CARET");

		expect(trie.size).toBe(3); // "abyssal", "dragon", "to"

		// Package A's phrases still work
		expect(trie.matchAt(tokensFrom("abyssal whip"), 0)!.consumed).toBe(2);
		// Package B's phrases still work
		expect(trie.matchAt(tokensFrom("to the power of 3"), 0)!.consumed).toBe(4);
	});

	test("should handle duplicate phrase registrations idempotently", () => {
		const trie = new PhraseTrie();
		trie.addPhrase("hello world", "GREETING");
		trie.addPhrase("hello world", "GREETING"); // duplicate

		expect(trie.size).toBe(1);
		const tokens = tokensFrom("hello world foo");
		const match = trie.matchAt(tokens, 0);
		expect(match!.consumed).toBe(2);
		expect(match!.replacement[0].type).toBe("GREETING");
	});

	test("phrase with leading/trailing spaces should still work", () => {
		const trie = new PhraseTrie();
		trie.addPhrase("  to the power of  ", "CARET");
		const tokens = tokensFrom("to the power of 3");
		const match = trie.matchAt(tokens, 0);
		expect(match).not.toBeNull();
		expect(match!.consumed).toBe(4);
	});
});
