/**
 * Lexer — Core Unit Tests
 *
 * Verifies tokenization of:
 * - Numbers (decimal, hex) and operators
 * - Keywords and identifiers
 * - Inline solve markers
 * - Peek/next iterator semantics and end-of-input handling
 */

import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@solve-js/lexer";

describe("Lexer", () => {
	test("tokenizes a number", () => {
		const lexer = new Lexer();
		lexer.reset("42");
		const token = lexer.next();
		expect(token).toBeDefined();
		expect(token!.type).toBe("NUMBER");
		expect(token!.value).toBe("42");
	});

	test("tokenizes a decimal number", () => {
		const lexer = new Lexer();
		lexer.reset("3.14");
		const token = lexer.next();
		expect(token).toBeDefined();
		expect(token!.type).toBe("NUMBER");
		expect(token!.value).toBe("3.14");
	});

	test("tokenizes a hex number", () => {
		const lexer = new Lexer();
		lexer.reset("0xFF");
		const token = lexer.next();
		expect(token).toBeDefined();
		expect(token!.type).toBe("NUMBER");
	});

	test("tokenizes basic operators", () => {
		const lexer = new Lexer();
		lexer.reset("1 + 2");
		const tokens: string[] = [];
		for (const t of lexer) {
			if (t.type !== "WS") tokens.push(t.type);
		}
		expect(tokens).toEqual(["NUMBER", "PLUS", "NUMBER"]);
	});

  test("tokenizes colon-prefixed variable", () => {
    const lexer = new Lexer();
    lexer.reset(":myVar");
    const tokens: string[] = [];
    for (const t of lexer) {
      if (t.type !== "WS") tokens.push(t.type);
    }
    expect(tokens).toEqual(["COLON", "IDENT"]);
  });

  test("tokenizes colon-prefixed variable assignment", () => {
    const lexer = new Lexer();
    lexer.reset(":myVar = 42");
    const tokens: string[] = [];
    for (const t of lexer) {
      if (t.type !== "WS") tokens.push(t.type);
    }
    expect(tokens).toEqual(["COLON", "IDENT", "EQUALS", "NUMBER"]);
  });

	test("tokenizes all arithmetic operators", () => {
		const lexer = new Lexer();
		lexer.reset("+ - * / ^ % << >>");
		const tokens: string[] = [];
		for (const t of lexer) {
			if (t.type !== "WS") tokens.push(t.type);
		}
		expect(tokens).toEqual([
			"PLUS",
			"MINUS",
			"STAR",
			"SLASH",
			"CARET",
			"PERCENT",
			"LSHIFT",
			"RSHIFT",
		]);
	});

	test("tokenizes keywords", () => {
		const lexer = new Lexer();
		lexer.reset("pi plus minus times");
		const tokens: string[] = [];
		for (const t of lexer) {
			if (t.type !== "WS") tokens.push(t.value);
		}
		expect(tokens).toEqual(["pi", "plus", "minus", "times"]);
	});

  test("tokenizes inline solve markers", () => {
    const lexer = new Lexer();
    lexer.reset("s`1 + 2`");
    const tokens: string[] = [];
    for (const t of lexer) {
      if (t.type !== "WS") tokens.push(t.type);
    }
    expect(tokens).toContain("INLINE_SOLVE_START");
  });

	test("peek returns next token without consuming", () => {
		const lexer = new Lexer();
		lexer.reset("1 + 2");
		const peeked = lexer.peek();
		const consumed = lexer.next();
		expect(peeked).toBeDefined();
		expect(consumed).toBeDefined();
		expect(peeked!.type).toBe(consumed!.type);
		expect(peeked!.value).toBe(consumed!.value);
	});

	test("peek returns same value twice", () => {
		const lexer = new Lexer();
		lexer.reset("123");
		const first = lexer.peek();
		const second = lexer.peek();
		expect(first!.value).toBe(second!.value);
	});

	test("returns undefined at end of input", () => {
		const lexer = new Lexer();
		lexer.reset("");
		expect(lexer.next()).toBeUndefined();
	});
});
