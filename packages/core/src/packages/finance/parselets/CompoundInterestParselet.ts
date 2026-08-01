import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";

/**
 * `compound interest on <principal> over <years> at <rate>%` -> future
 * value, and `interest on <principal> over <years> at <rate>%` -> interest
 * earned only. Triggered on the fused `COMPOUND_INTEREST_ON`/`INTEREST_ON`
 * tokens (see FinancePackage.ts's `phrases` field) rather than a bare
 * "interest"/"compound" keyword — "interest" is a very plausible variable
 * name (see FinancePackage.ts's doc comment), so it's phrase-fused instead
 * of claimed as a bare keyword, matching MathPhrasesPackage.ts's
 * established pattern.
 *
 * NOT built on {@link definePhrasePattern}: that builder requires every
 * alternative's first slot to be a `keyword`, but here the value
 * (`principal`) comes immediately after the fused trigger token — there's
 * no keyword to peek at until AFTER `principal` is already parsed. Same
 * structural reason `ClampParselet` is hand-written (see its doc comment).
 *
 * `over`/`at` are ordinary bare keywords here (not phrase-fused) — see
 * Token.ts's OVER/RATE_AT doc comment for why that's safe. No "and"
 * (PLUS-collision) guard is needed anywhere in this grammar since neither
 * connector word is "and".
 *
 * The grammar parses in `principal, years, rate` order (forced by the
 * word order "on P over Y at R%"), but this package's shared
 * `compoundFutureValue`/`compoundInterestEarned` builtins (VMBuiltins.ts
 * indices 48/49) take `(principal, rate, years)` — matching the
 * function-call form `compoundInterest(principal, rate, years)` the task
 * asked for. The `SWAP` below reorders the top two stack values
 * (`[principal, years, rate]` -> `[principal, rate, years]`) right before
 * the builtin call so both call styles share one implementation.
 *
 * DEVIATION FROM SOULVERCORE: the real SoulverCore syntax is
 * `$1,000 after 3 years at 7%` (no "compound interest on"/"interest on"
 * trigger phrase at all — "after" itself is the leading pivot word) and
 * `interest on $1,000 after 3 years @ 7%`. This package uses "over"
 * instead of "after" (avoids any future collision with datetime's
 * "X days after Y"-style phrasing, and matches the "over" wording
 * SoulverCore itself uses for the mortgage grammar, see
 * LoanRepaymentParselet.ts) and always requires the explicit
 * "compound interest on"/"interest on" trigger rather than a bare
 * `$X after Y years at Z%` with no leading verb — deliberately consistent
 * with this package's other two grammars rather than a third distinct
 * shape. SoulverCore's optional "compounding monthly/quarterly" interval
 * (`$1,000 for 3 years at 7% compounding monthly`) is also NOT implemented
 * — annual compounding only; out of scope for this pass.
 */
export class CompoundInterestParselet implements PrefixParselet {
  readonly category = "Finance";

  constructor(private readonly builtinIndex: number) {}

  parse(parser: Parser, _token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(BindingPower.Lowest, builder); // principal
    parser.consume("OVER");
    parser.parseExpression(BindingPower.Lowest, builder); // years
    parser.consume("RATE_AT");
    parser.parseExpression(BindingPower.Lowest, builder); // rate

    // Stack: [principal, years, rate] -> SWAP -> [principal, rate, years]
    builder.emitOpcode(OpCode.SWAP);

    builder.emitOpcode(OpCode.CALL_BUILTIN);
    builder.emitIndex(this.builtinIndex);
    builder.emitIndex(3);
  }
}
