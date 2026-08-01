import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";

/**
 * `tax on <amount> at <rate>%` / `tax off <amount> at <rate>%`, and the
 * `vat on`/`vat off` alias spellings — sales tax / VAT add-and-remove.
 * Triggered on the fused `TAX_ON`/`TAX_OFF` tokens (see FinancePackage.ts's
 * `phrases` field: both "tax on"/"vat on" fuse to `TAX_ON`, both
 * "tax off"/"vat off" fuse to `TAX_OFF`) rather than a bare "tax"/"vat"
 * keyword — "tax" in particular is a real, shipped playground variable
 * name (see MathPhrasesPackage.ts's doc comment: `:total = :subtotal +
 * :tax`), so it's phrase-fused instead of claimed as a bare keyword.
 *
 * No default tax rate is baked in anywhere in this package — `<rate>` is
 * always required and always explicit, since sales tax/VAT rates vary by
 * region and product and change over time; guessing a specific country's
 * rate here would go stale and mislead. `tax on 300` with no rate is a
 * parse error, not a silently-assumed percentage.
 *
 * Not `definePhrasePattern`-based for the same structural reason as
 * `CompoundInterestParselet` (the value comes right after the fused
 * trigger, not a keyword). No `SWAP` is needed here (unlike
 * CompoundInterestParselet/LoanRepaymentParselet) — the grammar's natural
 * parse order, `[amount, rate]`, already matches the shared
 * `taxAdd`/`taxRemove` builtins' `(amount, rate)` signature.
 *
 * SCOPE DECISION: no bare-arithmetic `$300 + VAT` form (mentioned as a
 * possible style in the task brief) — "VAT" alone carries no rate, and
 * this package deliberately never assumes one (see above), so there is no
 * well-defined meaning for a bare "+ VAT" addend without either a
 * hardcoded rate (rejected) or a prior variable definition, which is just
 * ordinary arithmetic + variables already supported by the engine, not a
 * new grammar feature.
 */
export class SalesTaxParselet implements PrefixParselet {
  readonly category = "Finance";

  constructor(private readonly builtinIndex: number) {}

  parse(parser: Parser, _token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(BindingPower.Lowest, builder); // amount
    parser.consume("RATE_AT");
    parser.parseExpression(BindingPower.Lowest, builder); // rate

    builder.emitOpcode(OpCode.CALL_BUILTIN);
    builder.emitIndex(this.builtinIndex);
    builder.emitIndex(2);
  }
}
