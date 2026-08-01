/**
 * Tests for `LexerVocabulary.rawLinePatterns` — the new generic extension
 * point added this session for `packages/knowledge`'s `<query> = ?`
 * grammar (see KnowledgePackage.ts's module doc for the full rationale).
 * Exercised directly against `ExpressionLexer` here (not just through the
 * Knowledge package) since it's reusable core-engine infrastructure any
 * future package could rely on.
 */
import { describe, expect, test } from "@jest/globals";
import { ExpressionLexer } from "@solve-js/lexer/ExpressionLexer";

const QUERY_PATTERN = { pattern: /^(.+?)=\s*\?\s*$/, tokenType: "TEST_RAW_QUERY" };

describe("ExpressionLexer — rawLinePatterns", () => {
	test("a matching line becomes exactly ONE synthetic token, value = trimmed capture group", () => {
		const lexer = new ExpressionLexer("en");
		lexer.registerVocabulary({ rawLinePatterns: [QUERY_PATTERN] });

		lexer.reset("distance to the moon = ?");
		const tokens = lexer.tokenizeAll();

		expect(tokens).toHaveLength(1);
		expect(tokens[0].type).toBe("TEST_RAW_QUERY");
		expect(tokens[0].value).toBe("distance to the moon");
	});

	test("works with no space before '?' (=?)", () => {
		const lexer = new ExpressionLexer("en");
		lexer.registerVocabulary({ rawLinePatterns: [QUERY_PATTERN] });

		lexer.reset("population of Tokyo=?");
		const tokens = lexer.tokenizeAll();

		expect(tokens).toHaveLength(1);
		expect(tokens[0].value).toBe("population of Tokyo");
	});

	test("a non-matching line falls through to normal tokenization untouched", () => {
		const lexer = new ExpressionLexer("en");
		lexer.registerVocabulary({ rawLinePatterns: [QUERY_PATTERN] });

		lexer.reset("2 + 2");
		const tokens = lexer.tokenizeAll();

		expect(tokens.length).toBeGreaterThan(1);
		expect(tokens.every((t) => t.type !== "TEST_RAW_QUERY")).toBe(true);
	});

	test("an empty capture group (bare '= ?' with nothing before it) does NOT match — falls through instead", () => {
		const lexer = new ExpressionLexer("en");
		lexer.registerVocabulary({ rawLinePatterns: [QUERY_PATTERN] });

		lexer.reset("= ?");
		const tokens = lexer.tokenizeAll();
		expect(tokens.every((t) => t.type !== "TEST_RAW_QUERY")).toBe(true);
	});

	test("unregisterVocabulary removes the rule — the line reverts to normal tokenization", () => {
		const lexer = new ExpressionLexer("en");
		const vocab = { rawLinePatterns: [QUERY_PATTERN] };
		lexer.registerVocabulary(vocab);
		lexer.unregisterVocabulary(vocab);

		lexer.reset("distance to the moon = ?");
		const tokens = lexer.tokenizeAll();
		expect(tokens.every((t) => t.type !== "TEST_RAW_QUERY")).toBe(true);
	});

	test("first registered pattern wins when multiple are registered", () => {
		const lexer = new ExpressionLexer("en");
		lexer.registerVocabulary({
			rawLinePatterns: [
				{ pattern: /^(.+?)=\s*\?\s*$/, tokenType: "FIRST_RULE" },
				{ pattern: /^(.+?)=\s*\?\s*$/, tokenType: "SECOND_RULE" },
			],
		});
		lexer.reset("anything = ?");
		const tokens = lexer.tokenizeAll();
		expect(tokens[0].type).toBe("FIRST_RULE");
	});

	test("scanDocument() applies the same raw-line check per-line across a multi-line document", () => {
		const lexer = new ExpressionLexer("en");
		lexer.registerVocabulary({ rawLinePatterns: [QUERY_PATTERN] });

		const doc = "2 + 2\ndistance to the moon = ?\n5 * 3";
		const results = lexer.scanDocument(doc);

		expect(results).toHaveLength(3);
		expect(results[0].tokens.every((t) => t.type !== "TEST_RAW_QUERY")).toBe(true);
		expect(results[1].tokens).toHaveLength(1);
		expect(results[1].tokens[0].type).toBe("TEST_RAW_QUERY");
		expect(results[1].tokens[0].value).toBe("distance to the moon");
		expect(results[2].tokens.every((t) => t.type !== "TEST_RAW_QUERY")).toBe(true);
	});

	test("a lexer with NO rawLinePatterns registered is completely unaffected (zero-cost when unused)", () => {
		const lexer = new ExpressionLexer("en");
		lexer.reset("distance to the moon = ?");
		const tokens = lexer.tokenizeAll();
		// Without the package registered, this tokenizes normally — multiple
		// tokens, no synthetic fusion.
		expect(tokens.length).toBeGreaterThan(1);
	});
});
