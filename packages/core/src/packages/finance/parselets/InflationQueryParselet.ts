import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import { INFLATION_FROM_YEAR_TO_PRESENT_IDX, INFLATION_TO_YEAR_FROM_PRESENT_IDX } from "./InflationPluginFunctions";

// CALL_BUILTIN index — see VMBuiltins.ts for the inflationAdjust(amount,
// fromYear, toYear) handler. Also reachable via the function-call form
// inflationAdjust(...) (FunctionCallParselet's builtinNameToIndex map).
const INFLATION_ADJUST_BUILTIN_IDX = 60;

/** Which leading phrase triggered this parselet — see FinancePackage.ts's `phrases` field. */
type InflationQueryVariant = "what-is" | "what-was";

/**
 * `what is $X from <year>` -> X (given as that year's dollars) expressed
 * in present-day dollars; `what is $X in <year1> worth in <year2>` -> X
 * adjusted between two arbitrary (non-present) years; `what was $X worth
 * in <year>` -> X (given as present-day dollars) expressed in that year's
 * dollars.
 *
 * Fused on WHAT_IS/WHAT_WAS (see FinancePackage.ts's `phrases` field) —
 * "is"/"was"/"what" are ordinary English words, not fused as bare
 * keywords, so a `:what = 5` style variable name is unaffected; only the
 * exact two-word phrases are claimed.
 *
 * NOT `definePhrasePattern`-based: the amount comes right after the fused
 * trigger, before any keyword to peek at — same structural reason
 * `ClampParselet`/`CompoundInterestParselet` are hand-written.
 *
 * BINDING-POWER GUARD (why the amount parses at `BindingPower.Product`,
 * not `Lowest`): the "what is ... in <year1> worth in <year2>" branch has
 * a bare `IN` token directly after the amount. The currency package's
 * `InParselet` is a generic infix parselet registered on `IN`
 * (bindingPower 35) that fires unconditionally as soon as it's the next
 * lookahead token inside ANY sub-expression parse — including one this
 * parselet kicks off for the amount — even when the token after `IN`
 * isn't a valid conversion target, it still consumes `IN` and silently
 * no-ops, stranding the rest of the grammar. Parsing the amount at
 * `BindingPower.Product` (40) makes the Pratt loop's `bp <= minBp` check
 * block `IN` (35 <= 40) from ever being consumed there, leaving it for
 * this parselet to consume explicitly. Trade-off: the amount can't
 * contain a top-level Sum-tier `+`/`-` in this form — parenthesize if
 * needed, e.g. "what is ($300 + $50) from 2003". The "what was ... worth
 * in" branch has no such collision (the next token is the fused
 * WORTH_IN, which has no infix parselet registered at all), but uses the
 * same guarded parse for consistency between both variants of this class.
 */
export class InflationQueryParselet implements PrefixParselet {
  readonly category = "Finance";

  constructor(private readonly variant: InflationQueryVariant) {}

  parse(parser: Parser, _token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(BindingPower.Product, builder); // amount

    if (this.variant === "what-was") {
      parser.consume("WORTH_IN");
      parser.parseExpression(BindingPower.Lowest, builder); // toYear
      builder.emitOpcode(OpCode.CALL_PLUGIN);
      builder.emitIndex(INFLATION_TO_YEAR_FROM_PRESENT_IDX);
      builder.emitIndex(2);
      return;
    }

    const next = parser.peek();
    if (next?.type === "FROM") {
      parser.consume();
      parser.parseExpression(BindingPower.Lowest, builder); // fromYear
      builder.emitOpcode(OpCode.CALL_PLUGIN);
      builder.emitIndex(INFLATION_FROM_YEAR_TO_PRESENT_IDX);
      builder.emitIndex(2);
      return;
    }
    if (next?.type === "IN") {
      parser.consume();
      parser.parseExpression(BindingPower.Lowest, builder); // fromYear (year1)
      parser.consume("WORTH_IN");
      parser.parseExpression(BindingPower.Lowest, builder); // toYear (year2)
      builder.emitOpcode(OpCode.CALL_BUILTIN);
      builder.emitIndex(INFLATION_ADJUST_BUILTIN_IDX);
      builder.emitIndex(3);
      return;
    }

    const gotType = next ? next.type : "end of input";
    throw ErrorFactory.parsing(
      "INFLATION_EXPECTED_FROM_OR_IN",
      `Expected "from <year>" or "in <year> worth in <year>" after "what is <amount>", got ${gotType}`,
    );
  }
}
