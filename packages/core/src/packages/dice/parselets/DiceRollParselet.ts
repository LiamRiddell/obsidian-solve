import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";
import { definePhrasePattern } from "@solve-js/parser/PhrasePattern";

/** CALL_BUILTIN index for diceRoll(from, to). Matches VMBuiltins.ts index 37. */
const DICE_ROLL_BUILTIN = 37;

function emitDiceRollCall(builder: BytecodeBuilder): void {
  builder.emitOpcode(OpCode.CALL_BUILTIN);
  builder.emitIndex(DICE_ROLL_BUILTIN);
  builder.emitIndex(2); // argc = 2
}

/**
 * `roll between X and Y` / `roll from X to Y` / `roll(X, Y)` — the three
 * forms whose first token unambiguously picks the alternative, so this is
 * the {@link definePhrasePattern} proof-of-concept: same behavior as the
 * original hand-written branches (including the `BindingPower.Product`
 * first-operand binding power, preserved so "AND"/"TO" never gets
 * misparsed as part of the first expression), now declarative.
 */
const keywordLedRollPattern = definePhrasePattern({
  category: "Dice",
  alternatives: [
    {
      slots: [
        { kind: "keyword", tokenTypes: ["BETWEEN"] },
        { kind: "expr", bindingPower: BindingPower.Product },
        // The word "and" lexes as PLUS, not a dedicated AND token — en.ts's
        // keywordMap maps `and: "PLUS"` (a synonym for arithmetic "+").
        // The original hand-written parselet never actually checked the
        // separator's token type (a bare `parser.consume()`), so it never
        // surfaced this; matching that real lexer behavior explicitly here
        // rather than the aspirational "AND" the old code's comment implied.
        { kind: "keyword", tokenTypes: ["PLUS"] },
        { kind: "expr" },
      ],
      emit: emitDiceRollCall,
    },
    {
      slots: [
        { kind: "keyword", tokenTypes: ["FROM"] },
        { kind: "expr", bindingPower: BindingPower.Product },
        { kind: "keyword", tokenTypes: ["TO"] },
        { kind: "expr" },
      ],
      emit: emitDiceRollCall,
    },
    {
      slots: [
        { kind: "keyword", tokenTypes: ["LPAREN"] },
        { kind: "expr" },
        { kind: "keyword", tokenTypes: ["COMMA"] },
        { kind: "expr" },
        { kind: "keyword", tokenTypes: ["RPAREN"] },
      ],
      emit: emitDiceRollCall,
    },
  ],
});

export class DiceRollParselet implements PrefixParselet {
	readonly category = "Dice";
	parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    const next = parser.peek();
    if (next && next.type === "NUMBER") {
      // Bare hyphen range: "roll 4-8" (wiki: Dice — no keyword, no
      // parens). Both bounds must be consumed as plain NUMBER literals,
      // NOT via parseExpression() — that would let the infix MINUS
      // continue an arithmetic expression ("4 - 8" = -4) instead of
      // terminating the range's first operand. This means negative
      // bounds aren't supported through this shorthand (`roll -5-5` is
      // genuinely ambiguous to tokenize); use `roll between -5 and 5` /
      // `roll from -5 to 5` for negative ranges — those go through
      // parseExpression() and handle unary minus correctly. Not
      // expressible via definePhrasePattern (its alternatives must be
      // disambiguated by a single leading keyword; this form starts with
      // an expression, not a keyword), so it stays hand-written.
      const minToken = parser.consume(); // NUMBER
      builder.emitOpcode(OpCode.PUSH_NUMBER);
      builder.emitNumber(parseFloat(minToken.value));
      parser.consume("MINUS");
      const maxToken = parser.consume(); // NUMBER
      builder.emitOpcode(OpCode.PUSH_NUMBER);
      builder.emitNumber(parseFloat(maxToken.value));
      emitDiceRollCall(builder);
      return;
    }
    keywordLedRollPattern.parse(parser, token, builder);
  }
}
