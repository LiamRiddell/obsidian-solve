import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import { INFLATION_FUTURE_VALUE_IDX } from "./InflationPluginFunctions";

/**
 * `value of $X in <futureYear> assuming N% inflation` -> a simple flat-rate
 * future-value projection (NOT CPI-table-based — future years aren't in
 * the bundled historical table, see `data/CpiTable.ts`). Fused on
 * VALUE_OF (see FinancePackage.ts's `phrases` field) — "value"/"of" are
 * ordinary words elsewhere in the grammar (fusing the whole two-word
 * phrase keeps a bare `:value = 5` variable name unaffected).
 *
 * "assuming" IS registered as a bare single-word keyword (ASSUMING, see
 * Token.ts's doc comment on it) — unlike "value"/"worth", it has near-zero
 * plausibility as a variable name (the same accepted-risk category as
 * this codebase's existing bare "over"/"at" keywords). This is required,
 * not just a style choice: without "assuming" being a recognized
 * phrase-starter, the normalizer's implicit-multiply rule silently
 * rewrote "<year> assuming" into "<year> * assuming" before parsing ever
 * ran, corrupting the whole grammar. "inflation" has no such collision
 * (it never directly follows a NUMBER — it follows the rate's "%" token,
 * which implicit-multiply doesn't trigger on) and stays a plain-text
 * `IDENT` check, the same technique `FpsRateNormalizerRule`/
 * `ClockTimeNormalizerRule` use for "fps"/"am"/"pm".
 *
 * Same `BindingPower.Product` guard on the amount as
 * `InflationQueryParselet` (see its doc comment) — the bare `IN` right
 * after the amount would otherwise be swallowed by the currency
 * package's `InParselet`.
 */
export class InflationFutureValueParselet implements PrefixParselet {
  readonly category = "Finance";

  parse(parser: Parser, _token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(BindingPower.Product, builder); // amount
    parser.consume("IN");
    parser.parseExpression(BindingPower.Lowest, builder); // futureYear
    parser.consume("ASSUMING");
    parser.parseExpression(BindingPower.Lowest, builder); // rate (e.g. "3%" auto-divides to 0.03)

    const inflationToken = parser.peek();
    const inflationWord = inflationToken && inflationToken.type === "IDENT"
      ? inflationToken.value.toLowerCase()
      : undefined;
    if (inflationWord !== "inflation") {
      const got = inflationToken ? inflationToken.value : "end of input";
      throw ErrorFactory.parsing(
        "INFLATION_EXPECTED_INFLATION_WORD",
        `Expected the word "inflation" after "assuming <rate>%", got "${got}"`,
      );
    }
    parser.consume();

    builder.emitOpcode(OpCode.CALL_PLUGIN);
    builder.emitIndex(INFLATION_FUTURE_VALUE_IDX);
    builder.emitIndex(3);
  }
}
