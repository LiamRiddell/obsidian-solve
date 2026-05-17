import { describe, expect, test } from "@jest/globals";
import { LexerState } from "@solve-js/lexer/LexerState";

describe("LexerState", () => {
	test("has expected states", () => {
		expect(LexerState.Main).toBe("main");
		expect(LexerState.Inline).toBe("inline");
	});
});
