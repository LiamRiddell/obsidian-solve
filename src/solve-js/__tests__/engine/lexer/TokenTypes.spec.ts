import { describe, expect, test } from "@jest/globals";
import { TokenTypes } from "@solve-js/lexer/Token";

describe("TokenTypes", () => {
	test("has all expected token types", () => {
		expect(TokenTypes.NUMBER).toBe("NUMBER");
		expect(TokenTypes.PLUS).toBe("PLUS");
		expect(TokenTypes.MINUS).toBe("MINUS");
		expect(TokenTypes.LPAREN).toBe("LPAREN");
		expect(TokenTypes.RPAREN).toBe("RPAREN");
		expect(TokenTypes.EOF).toBe("EOF");
		expect(TokenTypes.KEYWORD).toBe("KEYWORD");
	});
});
