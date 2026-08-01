import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";

/**
 * `midpoint between X and Y` -> (X + Y) / 2. Triggered on the fused
 * `MIDPOINT_BETWEEN` token (see MathPhrasesPackage.ts's `phrases` field).
 * Hand-written for the same reason as `LargerSmallerParselet` — once
 * "between" is fused into the trigger, X (an `expr`) comes next, not a
 * keyword, which `definePhrasePattern` can't start an alternative with.
 *
 * X is parsed at `BindingPower.Product` to guard against the "and"-lexes-
 * as-PLUS collision (see ConditionalsPackage.ts's doc comment) —
 * otherwise X's own parse would greedily swallow "and Y" as addition
 * before this parselet's own "and" check ever runs.
 */
export const midpointParselet: PrefixParselet = {
  category: "MathPhrases",
  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(BindingPower.Product, builder); // X
    parser.consume("PLUS"); // "and"
    parser.parseExpression(BindingPower.Lowest, builder); // Y
    builder.emitOpcode(OpCode.ADD);
    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(2);
    builder.emitOpcode(OpCode.DIV);
  },
};
