import { describe, expect, test } from "@jest/globals";
import { NumberParselet } from "@solve-js/packages/arithmetic/parselets/NumberParselet";
import { Parser } from "@solve-js/parser/Parser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { EngineError } from "@solve-js/errors/UnifiedErrorFramework";
import type { Token } from "@solve-js/lexer/Token";

/**
 * Direct unit tests for NumberParselet — its own doc comment notes `parse()`
 * is dead code for real evaluation (PrecedenceParser's NUMBER_ID fast path
 * always handles it first), but it stays registered for the "matched
 * parselets" diagnostic view and its own tests. This class's raw
 * `throw new Error(...)` calls used to bypass the EngineError taxonomy —
 * fixed to match PrecedenceParser.ts's already-correct NUMBER_ID handling,
 * which uses the exact same ErrorFactory.parsing(...) pattern for the
 * identical hex/binary-literal validation.
 */
function makeToken(value: string): Token {
  return { type: "NUMBER", typeId: 0, value, text: value, offset: 0, lineBreaks: 0, line: 1, col: 1 };
}

describe("NumberParselet — invalid literal errors use the EngineError taxonomy", () => {
  test("invalid hex literal throws an EngineError, not a raw Error", () => {
    const parselet = new NumberParselet();
    const parser = new Parser(new ParseletRegistry());
    const builder = new BytecodeBuilder();

    expect(() => parselet.parse(parser, makeToken("0xZZ"), builder)).toThrow(EngineError);
    try {
      parselet.parse(parser, makeToken("0xZZ"), builder);
      fail("expected parse() to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(EngineError);
      expect((err as Error).message).toContain("Invalid hex literal");
    }
  });

  test("invalid binary literal throws an EngineError, not a raw Error", () => {
    const parselet = new NumberParselet();
    const parser = new Parser(new ParseletRegistry());
    const builder = new BytecodeBuilder();

    expect(() => parselet.parse(parser, makeToken("0b222"), builder)).toThrow(EngineError);
  });

  test("a valid hex literal parses without throwing", () => {
    const parselet = new NumberParselet();
    const parser = new Parser(new ParseletRegistry());
    const builder = new BytecodeBuilder();

    expect(() => parselet.parse(parser, makeToken("0xFF"), builder)).not.toThrow();
  });
});
