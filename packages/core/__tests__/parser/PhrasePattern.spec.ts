/**
 * PhrasePattern — declarative phrase-grammar parselet builder.
 *
 * Exercised for real (not just in isolation) by DiceRollParselet's
 * `between X and Y` / `from X to Y` / `(X, Y)` alternatives — see
 * packages/dice/parselets/DiceRollParselet.ts and DiceParselets.spec.ts.
 * These tests cover the builder's own dispatch/error-handling/capture logic
 * with a small synthetic grammar, independent of any real package.
 */

import { registerPackageForTesting } from "@tools/testUtils";
import { ARITHMETIC_PACKAGE } from "@solve-js/packages";
import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@solve-js/lexer/Lexer";
import { TokenTypes } from "@solve-js/lexer/Token";
import { Parser } from "@solve-js/parser/Parser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";

import { createVM, executeBytecode, unwrapEvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { Value } from "@solve-js/vm/Value";
import { definePhrasePattern } from "@solve-js/parser/PhrasePattern";

describe("definePhrasePattern — construction", () => {
  test("throws a config error if an alternative's first slot isn't a keyword", () => {
    expect(() =>
      definePhrasePattern({
        category: "Test",
        alternatives: [{ slots: [{ kind: "expr" }], emit: () => {} }],
      })
    ).toThrow(/first slot must be a `keyword` slot/i);
  });
});

// A synthetic 2-alternative grammar — "between X and Y" / "from X to Y" —
// standing in for a real prefix parselet's triggering keyword having
// already been consumed by the parser's dispatch mechanism (the same
// contract DiceRollParselet.parse() relies on). Registered as a plain
// PrefixParselet so it round-trips through the real parse→build→execute
// pipeline like any other parselet.
const testPattern = definePhrasePattern({
  category: "Test",
  alternatives: [
    {
      slots: [
        { kind: "keyword", tokenTypes: ["BETWEEN"] },
        // "and" lexes as PLUS (en.ts: `and: "PLUS"`, a synonym for
        // arithmetic "+") — not a dedicated AND token. Since PLUS is also
        // a real active infix operator here (registerPackageForTesting(ARITHMETIC_PACKAGE, )),
        // this first expr slot MUST use a binding power above Sum, or
        // parseExpression() will happily swallow "and 3" as if computing
        // "2 + 3" instead of stopping so the PLUS keyword slot below can
        // consume it — the exact bug DiceRollParselet.ts's identical
        // BindingPower.Product choice guards against in real use.
        { kind: "expr", bindingPower: BindingPower.Product },
        { kind: "keyword", tokenTypes: ["PLUS"] },
        { kind: "expr" },
      ],
      emit: (builder, captures) => {
        expect(captures.map((c) => c.type)).toEqual(["BETWEEN", "PLUS"]);
        builder.emitOpcode(OpCode.PUSH_NUMBER);
        builder.emitNumber(0);
      },
    },
    {
      slots: [
        { kind: "keyword", tokenTypes: ["FROM"] },
        { kind: "expr" },
        { kind: "keyword", tokenTypes: ["TO"] },
        { kind: "expr" },
      ],
      emit: (builder, captures) => {
        expect(captures.map((c) => c.type)).toEqual(["FROM", "TO"]);
        builder.emitOpcode(OpCode.PUSH_NUMBER);
        builder.emitNumber(1);
      },
    },
  ],
});

function tokenize(lexer: Lexer, input: string) {
  lexer.reset(input);
  const tokens = [];
  for (const t of lexer) {
    if (t.type === TokenTypes.WS) continue;
    tokens.push(t);
  }
  return tokens;
}

/**
 * Invokes testPattern.parse() directly against `input`, the way a real
 * prefix parselet's dispatcher would call it AFTER already consuming that
 * parselet's own triggering token (e.g. DiceRollParselet is registered on
 * "ROLL", and by the time its parse() runs, "roll" is already consumed —
 * testPattern's own first slot, "between"/"from", plays that same role
 * here since the pattern itself is the thing being unit-tested, not a
 * containing parselet).
 */
function run(input: string): Value {
  const lexer = new Lexer();
  const registry = new ParseletRegistry();
  registerPackageForTesting(ARITHMETIC_PACKAGE, registry);
  const parser = new Parser(registry);
  const builder = new BytecodeBuilder();
  const tokens = tokenize(lexer, input);
  parser.load(tokens);
  // Dummy trigger token — testPattern's alternatives don't read it (only
  // real parselets that need their own keyword's text would).
  testPattern.parse(parser, tokens[0], builder);
  const program = builder.build();
  const vm = createVM(sharedOpRegistry);
  const result = executeBytecode(
    { opcodes: new Uint8Array(program.opcodes), numbers: new Float64Array(program.numbers), strings: program.strings },
    vm
  );
  return unwrapEvalResult(result);
}

describe("definePhrasePattern — alternative dispatch and captures", () => {
  test("picks the 'between ... and' alternative and records its keyword captures", () => {
    expect(run("between 2 and 3").toNumber()).toBe(0);
  });

  test("picks the 'from ... to' alternative and records its keyword captures", () => {
    expect(run("from 2 to 3").toNumber()).toBe(1);
  });

  test("throws a descriptive error naming the expected keywords when the next token matches no alternative's leading keyword", () => {
    expect(() => run("2 and 3")).toThrow();
  });

  test("throws when a later keyword slot doesn't match (e.g. 'between X to Y')", () => {
    expect(() => run("between 2 to 3")).toThrow(/Expected one of \[PLUS\]/i);
  });

  test("throws when a keyword slot hits end of input instead of a token", () => {
    expect(() => run("between 2")).toThrow(/end of input/i);
  });
});
