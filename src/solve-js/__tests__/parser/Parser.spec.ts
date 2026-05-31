/**
 * Parser & ParseletRegistry — Unit Tests
 *
 * Covers:
 * - ParseletRegistry: register/get/clear for prefix and infix parselets
 * - Parser: parseExpression with precedence, consume/match with type checking
 * - Error handling for unregistered token types
 */

import { describe, expect, test } from "@jest/globals";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { Parser } from "@solve-js/parser/Parser";
import { Token, tokenTypeId } from "@solve-js/lexer/Token";
import { PrefixParselet, InfixParselet } from "@solve-js/parser/Parselet";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

class NumberParselet implements PrefixParselet {
	readonly category = "Test";
	parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
		builder.emitOpcode(OpCode.PUSH_NUMBER);
		builder.emitNumber(parseFloat(token.value));
	}
}

class PlusParselet implements InfixParselet {
	readonly category = "Test";
	readonly bindingPower: number = 30;
	parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
		const rightToken = parser.consume();
		builder.emitOpcode(OpCode.PUSH_NUMBER);
		builder.emitNumber(parseFloat(rightToken.value));
		builder.emitOpcode(OpCode.ADD);
	}
}

describe("ParseletRegistry", () => {
  test("register and get prefix parselet", () => {
    const registry = new ParseletRegistry();
    const parselet = new NumberParselet();
    registry.registerPrefix("NUMBER", parselet);
    expect(registry.getPrefix("NUMBER")).toBe(parselet);
  });

  test("register and get infix parselet", () => {
    const registry = new ParseletRegistry();
    const parselet = new PlusParselet();
    registry.registerInfix("PLUS", parselet);
    expect(registry.getInfix("PLUS")).toBe(parselet);
  });

  test("returns undefined for unregistered types", () => {
    const registry = new ParseletRegistry();
    expect(registry.getPrefix("UNKNOWN")).toBeUndefined();
    expect(registry.getInfix("UNKNOWN")).toBeUndefined();
  });

  test("clear removes all parselets", () => {
    const registry = new ParseletRegistry();
    registry.registerPrefix("NUMBER", new NumberParselet());
    registry.registerInfix("PLUS", new PlusParselet());
    registry.clear();
    expect(registry.getPrefix("NUMBER")).toBeUndefined();
    expect(registry.getInfix("PLUS")).toBeUndefined();
  });

  test("sharedParseletRegistry is defined", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { sharedParseletRegistry } = require("@solve-js/parser/registry/ParseletRegistry");
    expect(sharedParseletRegistry).toBeDefined();
  });
});

describe("Parser", () => {
  test("parses a single number via prefix parselet", () => {
    const registry = new ParseletRegistry();
    registry.registerPrefix("NUMBER", new NumberParselet());
    const parser = new Parser(registry);
    const builder = new BytecodeBuilder();
    const tokens: Token[] = [
      { type: "NUMBER", typeId: tokenTypeId("NUMBER"), value: "42", text: "42", offset: 0, lineBreaks: 0, line: 1, col: 1 },
    ];
    parser.load(tokens);
    parser.parseExpression(0, builder);
    const program = builder.build();
    expect(program.opcodes.length).toBeGreaterThan(0);
    expect(program.numbers[0]).toBe(42);
  });

  test("parses simple addition via infix parselet", () => {
    const registry = new ParseletRegistry();
    registry.registerPrefix("NUMBER", new NumberParselet());
    registry.registerInfix("PLUS", new PlusParselet());
    const parser = new Parser(registry);
    const builder = new BytecodeBuilder();
    const tokens: Token[] = [
      { type: "NUMBER", typeId: tokenTypeId("NUMBER"), value: "1", text: "1", offset: 0, lineBreaks: 0, line: 1, col: 1 },
      { type: "PLUS", typeId: tokenTypeId("PLUS"), value: "+", text: "+", offset: 2, lineBreaks: 0, line: 1, col: 3 },
      { type: "NUMBER", typeId: tokenTypeId("NUMBER"), value: "2", text: "2", offset: 4, lineBreaks: 0, line: 1, col: 5 },
    ];
    parser.load(tokens);
    parser.parseExpression(0, builder);
    const program = builder.build();
    expect(program.opcodes).toContain(OpCode.PUSH_NUMBER);
    expect(program.opcodes).toContain(OpCode.ADD);
  });

  test("throws on unregistered token type", () => {
    const registry = new ParseletRegistry();
    const parser = new Parser(registry);
    const builder = new BytecodeBuilder();
    const tokens: Token[] = [
      { type: "UNKNOWN", typeId: 0, value: "?", text: "?", offset: 0, lineBreaks: 0, line: 1, col: 1 },
    ];
    parser.load(tokens);
    expect(() => parser.parseExpression(0, builder)).toThrow();
  });

  test("consume with expected type succeeds", () => {
    const registry = new ParseletRegistry();
    const parser = new Parser(registry);
    const tokens: Token[] = [
      { type: "NUMBER", typeId: tokenTypeId("NUMBER"), value: "1", text: "1", offset: 0, lineBreaks: 0, line: 1, col: 1 },
    ];
    parser.load(tokens);
    const token = parser.consume("NUMBER");
    expect(token.value).toBe("1");
  });

  test("consume with wrong type throws", () => {
    const registry = new ParseletRegistry();
    const parser = new Parser(registry);
    const tokens: Token[] = [
      { type: "NUMBER", typeId: tokenTypeId("NUMBER"), value: "1", text: "1", offset: 0, lineBreaks: 0, line: 1, col: 1 },
    ];
    parser.load(tokens);
    expect(() => parser.consume("PLUS")).toThrow();
  });

  test("match returns true and advances on match", () => {
    const registry = new ParseletRegistry();
    const parser = new Parser(registry);
    const tokens: Token[] = [
      { type: "PLUS", typeId: tokenTypeId("PLUS"), value: "+", text: "+", offset: 0, lineBreaks: 0, line: 1, col: 1 },
    ];
    parser.load(tokens);
    expect(parser.match("PLUS")).toBe(true);
    expect(parser.peek()).toBeUndefined();
  });

  test("match returns false on no match", () => {
    const registry = new ParseletRegistry();
    const parser = new Parser(registry);
    const tokens: Token[] = [
      { type: "NUMBER", typeId: tokenTypeId("NUMBER"), value: "1", text: "1", offset: 0, lineBreaks: 0, line: 1, col: 1 },
    ];
    parser.load(tokens);
    expect(parser.match("PLUS")).toBe(false);
    expect(parser.peek()).toBeDefined();
  });

  test("previous returns last consumed token", () => {
    const registry = new ParseletRegistry();
    const parser = new Parser(registry);
    const tokens: Token[] = [
      { type: "NUMBER", typeId: tokenTypeId("NUMBER"), value: "1", text: "1", offset: 0, lineBreaks: 0, line: 1, col: 1 },
      { type: "PLUS", typeId: tokenTypeId("PLUS"), value: "+", text: "+", offset: 2, lineBreaks: 0, line: 1, col: 3 },
    ];
    parser.load(tokens);
    parser.consume("NUMBER");
    expect(parser.previous()!.type).toBe("NUMBER");
  });
});
