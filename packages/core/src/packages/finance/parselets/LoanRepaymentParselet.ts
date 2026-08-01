import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";

/**
 * `[daily|monthly|annual|total] repayment on <principal> over <years> at
 * <rate>%` and the `interest` variants — the standard mortgage/loan
 * amortization formula (see VMBuiltins.ts indices 52/53's `amortizeLoan()`
 * for the math, verified against real worked numbers).
 *
 * Triggered on 8 distinct fused tokens (`DAILY_REPAYMENT_ON`,
 * `MONTHLY_REPAYMENT_ON`, `ANNUAL_REPAYMENT_ON`, `TOTAL_REPAYMENT_ON`,
 * `DAILY_LOAN_INTEREST_ON`, `MONTHLY_LOAN_INTEREST_ON`,
 * `ANNUAL_LOAN_INTEREST_ON`, `TOTAL_LOAN_INTEREST_ON` — see
 * FinancePackage.ts's `phrases` field), one instance of this class per
 * token, each parameterized by which builtin to call and which
 * `periodsPerYear` divisor to push (365/12/1/0) — same
 * one-class-many-registrations shape as MathPhrases'
 * `VariadicAggregateParselet`/`ClampParselet`.
 *
 * Not `definePhrasePattern`-based for the same structural reason as
 * `CompoundInterestParselet` (the value comes right after the fused
 * trigger, not a keyword).
 *
 * Emits `[principal, years, rate]` in parse order, `SWAP`s to
 * `[principal, rate, years]` (matching the shared builtins'
 * `(principal, rate, years, periodsPerYear)` signature — see
 * CompoundInterestParselet.ts's doc comment for why), then pushes the
 * literal `periodsPerYear` constant before the CALL_BUILTIN.
 */
export class LoanRepaymentParselet implements PrefixParselet {
  readonly category = "Finance";

  constructor(
    private readonly builtinIndex: number,
    private readonly periodsPerYear: number,
  ) {}

  parse(parser: Parser, _token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(BindingPower.Lowest, builder); // principal
    parser.consume("OVER");
    parser.parseExpression(BindingPower.Lowest, builder); // years
    parser.consume("RATE_AT");
    parser.parseExpression(BindingPower.Lowest, builder); // rate

    // Stack: [principal, years, rate] -> SWAP -> [principal, rate, years]
    builder.emitOpcode(OpCode.SWAP);

    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(this.periodsPerYear);

    builder.emitOpcode(OpCode.CALL_BUILTIN);
    builder.emitIndex(this.builtinIndex);
    builder.emitIndex(4);
  }
}
