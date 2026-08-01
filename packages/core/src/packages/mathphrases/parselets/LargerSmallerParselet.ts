import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";

/**
 * `larger of X and Y` / `smaller of X and Y`. Reuses the existing
 * `min`/`max` CALL_BUILTIN indices (9/10, see VMBuiltins.ts) rather than
 * duplicating their logic — this is purely a phrase-grammar front end for
 * functionality that already exists.
 *
 * Triggered on a fused `LARGER_OF`/`SMALLER_OF` token (see
 * MathPhrasesPackage.ts's `phrases` field). NOT built on
 * {@link definePhrasePattern}: once "of" is fused into the trigger, the
 * next thing is X (an `expr`), not a keyword — the same structural
 * mismatch as `ClampParselet`/`IfThenElseParselet` (see their doc
 * comments), so this is hand-written too.
 *
 * "and" lexes as `PLUS` (a pre-existing arithmetic word-synonym), not a
 * literal "AND" token — see ConditionalsPackage.ts's doc comment. Parsing
 * X at `BindingPower.Product` guards against X's own parse greedily
 * consuming "and Y" as PLUS addition before this parselet's own "and"
 * check runs.
 */
export function largerSmallerParselet(builtinIndex: number): PrefixParselet {
  return {
    category: "MathPhrases",
    parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
      parser.parseExpression(BindingPower.Product, builder); // X
      parser.consume("PLUS"); // "and"
      parser.parseExpression(BindingPower.Lowest, builder); // Y
      builder.emitOpcode(OpCode.CALL_BUILTIN);
      builder.emitIndex(builtinIndex);
      builder.emitIndex(2);
    },
  };
}
