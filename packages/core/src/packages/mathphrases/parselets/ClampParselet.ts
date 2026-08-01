import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";

const CLAMP_BUILTIN_INDEX = 47;

/**
 * `clamp X between Y and Z` / `clamp X from Y to Z`.
 *
 * NOT built on {@link definePhrasePattern}: that builder requires every
 * alternative's first slot to be a `keyword`, but here the value X comes
 * immediately after the "clamp" trigger — there's no keyword to peek at
 * until AFTER X is already parsed. Same structural mismatch as
 * `IfThenElseParselet` (see its doc comment); hand-written for the same
 * reason.
 */
export class ClampParselet implements PrefixParselet {
  readonly category = "MathPhrases";

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(BindingPower.Lowest, builder); // value

    const mid = parser.peek();
    if (mid?.type === "BETWEEN") {
      parser.consume();
      parser.parseExpression(BindingPower.Product, builder); // lo — Product bp guards against "and" (PLUS) swallowing hi
      parser.consume("PLUS"); // "and" — see ConditionalsPackage.ts's doc comment
      parser.parseExpression(BindingPower.Lowest, builder); // hi
    } else if (mid?.type === "FROM") {
      parser.consume();
      parser.parseExpression(BindingPower.Lowest, builder); // lo
      parser.consume("TO");
      parser.parseExpression(BindingPower.Lowest, builder); // hi
    } else {
      throw ErrorFactory.parsing(
        "CLAMP_EXPECTED_BETWEEN_OR_FROM",
        `Expected "between" or "from" after "clamp <value>" but got ${mid ? `"${mid.value}"` : "end of input"}`,
      );
    }

    builder.emitOpcode(OpCode.CALL_BUILTIN);
    builder.emitIndex(CLAMP_BUILTIN_INDEX);
    builder.emitIndex(3);
  }
}
