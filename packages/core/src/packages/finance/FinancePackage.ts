import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { CompoundInterestParselet } from "./parselets/CompoundInterestParselet";
import { LoanRepaymentParselet } from "./parselets/LoanRepaymentParselet";
import { SalesTaxParselet } from "./parselets/SalesTaxParselet";
import { InflationQueryParselet } from "./parselets/InflationQueryParselet";
import { InflationFutureValueParselet } from "./parselets/InflationFutureValueParselet";
import { InYearDollarsParselet } from "./parselets/InYearDollarsParselet";
import {
  INFLATION_FROM_YEAR_TO_PRESENT_IDX, INFLATION_TO_YEAR_FROM_PRESENT_IDX, INFLATION_FUTURE_VALUE_IDX,
  inflationFromYearToPresentHandler, inflationToYearFromPresentHandler, inflationFutureValueHandler,
} from "./parselets/InflationPluginFunctions";
import { inYearDollarsNormalizerRule } from "./normalizer/InYearDollarsNormalizerRule";

// CALL_BUILTIN indices — see VMBuiltins.ts for the handler implementations.
const COMPOUND_FV = 51, COMPOUND_INTEREST = 52;
const LOAN_REPAYMENT = 55, LOAN_INTEREST = 56;
const TAX_ADD = 58, TAX_REMOVE = 59;
// 60 = inflationAdjust(amount, fromYear, toYear) — see InflationQueryParselet.ts
// and VMBuiltins.ts. The other three inflation calculations (present-year
// forms + the flat-rate future-value projection) are collision-safe
// pluginFunctions instead — see InflationPluginFunctions.ts.

/**
 * Money & finance phrase grammar: compound interest / investment growth,
 * mortgage/loan repayment (standard amortization formula), sales tax/VAT
 * add-and-remove, and CPI-based inflation-adjusted value. SoulverCore-
 * inspired syntax where it could be confirmed (see each parselet's doc
 * comment for exact worked examples and any deliberate deviations);
 * function-call forms (`compoundInterest(...)`, `monthlyPayment(...)`,
 * `taxAdd(...)`, `inflationAdjust(...)`, ...) are registered separately,
 * in FUNCTION_PACKAGE's shared FUNC dispatch (see
 * `packages/function/parselets/FunctionCallParselet.ts`'s
 * `builtinNameToIndex` map) rather than here.
 *
 * TRIGGER-WORD COLLISION DESIGN NOTE (same regression class documented in
 * MathPhrasesPackage.ts, and explicitly called out for this package
 * up-front): "interest", "tax", "principal", "payment", "rate", "balance",
 * "what", "worth", "value" are all common, plausible variable names — a
 * shipped playground example already uses `:tax` (`:total = :subtotal +
 * :tax`, see MathPhrasesPackage.ts's doc comment). None of those words are
 * bare keywords anywhere in this package. Every trigger is either:
 *  - a full phrase fused via `phrases` below ("interest on", "tax on",
 *    "monthly repayment on", "what is", "what was", "value of", "worth
 *    in", ...), so the leading word alone never becomes its own token
 *    type and stays usable as `:interest`/`:tax`/`:what`/`:value`/etc., or
 *  - a genuine preposition ("over", "at") with near-zero plausibility as a
 *    variable name — the same accepted-risk category as this codebase's
 *    existing bare "between"/"from"/"next"/"last"/"best" keywords (see
 *    Token.ts's OVER/RATE_AT doc comment).
 *
 * Inflation-adjusted value (extends this package, see
 * `parselets/InflationQueryParselet.ts`/`InflationFutureValueParselet.ts`/
 * `InYearDollarsParselet.ts` and `data/CpiTable.ts` for the bundled,
 * clearly-labeled-approximate CPI-U table and its doc comment on
 * vintage/accuracy) was the one topic explicitly deferred from this
 * package's original scope — now implemented.
 */
export const FINANCE_PACKAGE: IEnginePackage = {
  name: "solve-finance",
  phrases: {
    "compound interest on": "COMPOUND_INTEREST_ON",
    "interest on": "INTEREST_ON",
    "daily repayment on": "DAILY_REPAYMENT_ON",
    "monthly repayment on": "MONTHLY_REPAYMENT_ON",
    "annual repayment on": "ANNUAL_REPAYMENT_ON",
    "total repayment on": "TOTAL_REPAYMENT_ON",
    "daily interest on": "DAILY_LOAN_INTEREST_ON",
    "monthly interest on": "MONTHLY_LOAN_INTEREST_ON",
    "annual interest on": "ANNUAL_LOAN_INTEREST_ON",
    "total interest on": "TOTAL_LOAN_INTEREST_ON",
    "tax on": "TAX_ON",
    "tax off": "TAX_OFF",
    "vat on": "TAX_ON",
    "vat off": "TAX_OFF",
    "what is": "WHAT_IS",
    "what was": "WHAT_WAS",
    "value of": "VALUE_OF",
    "worth in": "WORTH_IN",
    "assuming": "ASSUMING",
  },
  prefixParselets: [
    { tokenType: "COMPOUND_INTEREST_ON", parselet: new CompoundInterestParselet(COMPOUND_FV) },
    { tokenType: "INTEREST_ON", parselet: new CompoundInterestParselet(COMPOUND_INTEREST) },

    { tokenType: "DAILY_REPAYMENT_ON", parselet: new LoanRepaymentParselet(LOAN_REPAYMENT, 365) },
    { tokenType: "MONTHLY_REPAYMENT_ON", parselet: new LoanRepaymentParselet(LOAN_REPAYMENT, 12) },
    { tokenType: "ANNUAL_REPAYMENT_ON", parselet: new LoanRepaymentParselet(LOAN_REPAYMENT, 1) },
    { tokenType: "TOTAL_REPAYMENT_ON", parselet: new LoanRepaymentParselet(LOAN_REPAYMENT, 0) },

    { tokenType: "DAILY_LOAN_INTEREST_ON", parselet: new LoanRepaymentParselet(LOAN_INTEREST, 365) },
    { tokenType: "MONTHLY_LOAN_INTEREST_ON", parselet: new LoanRepaymentParselet(LOAN_INTEREST, 12) },
    { tokenType: "ANNUAL_LOAN_INTEREST_ON", parselet: new LoanRepaymentParselet(LOAN_INTEREST, 1) },
    { tokenType: "TOTAL_LOAN_INTEREST_ON", parselet: new LoanRepaymentParselet(LOAN_INTEREST, 0) },

    { tokenType: "TAX_ON", parselet: new SalesTaxParselet(TAX_ADD) },
    { tokenType: "TAX_OFF", parselet: new SalesTaxParselet(TAX_REMOVE) },

    { tokenType: "WHAT_IS", parselet: new InflationQueryParselet("what-is") },
    { tokenType: "WHAT_WAS", parselet: new InflationQueryParselet("what-was") },
    { tokenType: "VALUE_OF", parselet: new InflationFutureValueParselet() },
  ],
  infixParselets: [
    { tokenType: "IN_YEAR_DOLLARS", parselet: new InYearDollarsParselet() },
  ],
  normalizerRules: [
    inYearDollarsNormalizerRule(),
  ],
  pluginFunctions: [
    { index: INFLATION_FROM_YEAR_TO_PRESENT_IDX, handler: inflationFromYearToPresentHandler },
    { index: INFLATION_TO_YEAR_FROM_PRESENT_IDX, handler: inflationToYearFromPresentHandler },
    { index: INFLATION_FUTURE_VALUE_IDX, handler: inflationFutureValueHandler },
  ],
};
