export { CompoundInterestParselet } from "./CompoundInterestParselet";
export { LoanRepaymentParselet } from "./LoanRepaymentParselet";
export { SalesTaxParselet } from "./SalesTaxParselet";

import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { CompoundInterestParselet } from "./CompoundInterestParselet";
import { LoanRepaymentParselet } from "./LoanRepaymentParselet";
import { SalesTaxParselet } from "./SalesTaxParselet";

// CALL_BUILTIN indices — see VMBuiltins.ts for the handler implementations.
const COMPOUND_FV = 51, COMPOUND_INTEREST = 52;
const LOAN_REPAYMENT = 55, LOAN_INTEREST = 56;
const TAX_ADD = 58, TAX_REMOVE = 59;

/**
 * Registers this package's phrase-grammar parselets directly against a bare
 * {@link ParseletRegistry} — used by the isolated tokenize+parse test
 * harness (see MathPhrasesPackage's parselets/index.ts for the established
 * pattern). NOTE: every parselet registered here still depends on phrase
 * fusion (TokenNormalizer/PhraseTrie) having already turned "compound
 * interest on"/"tax on"/etc. into their fused token types — that fusion
 * only happens inside a real, fully-constructed ExpressionEngine, so this
 * function alone is NOT sufficient to exercise any of this package's
 * phrase forms end-to-end (see FinanceParselets.spec.ts's `evalReal()`
 * helper for that). This function is registered mainly so the
 * function-call forms (compoundInterest(...), monthlyPayment(...), ...),
 * which route through FUNCTION_PACKAGE's shared FUNC token instead of a
 * fused phrase token, have a place to be exercised without a full engine.
 */
export function registerFinanceParselets(registry: ParseletRegistry): void {
  registry.registerPrefix("COMPOUND_INTEREST_ON", new CompoundInterestParselet(COMPOUND_FV));
  registry.registerPrefix("INTEREST_ON", new CompoundInterestParselet(COMPOUND_INTEREST));

  registry.registerPrefix("DAILY_REPAYMENT_ON", new LoanRepaymentParselet(LOAN_REPAYMENT, 365));
  registry.registerPrefix("MONTHLY_REPAYMENT_ON", new LoanRepaymentParselet(LOAN_REPAYMENT, 12));
  registry.registerPrefix("ANNUAL_REPAYMENT_ON", new LoanRepaymentParselet(LOAN_REPAYMENT, 1));
  registry.registerPrefix("TOTAL_REPAYMENT_ON", new LoanRepaymentParselet(LOAN_REPAYMENT, 0));

  registry.registerPrefix("DAILY_LOAN_INTEREST_ON", new LoanRepaymentParselet(LOAN_INTEREST, 365));
  registry.registerPrefix("MONTHLY_LOAN_INTEREST_ON", new LoanRepaymentParselet(LOAN_INTEREST, 12));
  registry.registerPrefix("ANNUAL_LOAN_INTEREST_ON", new LoanRepaymentParselet(LOAN_INTEREST, 1));
  registry.registerPrefix("TOTAL_LOAN_INTEREST_ON", new LoanRepaymentParselet(LOAN_INTEREST, 0));

  registry.registerPrefix("TAX_ON", new SalesTaxParselet(TAX_ADD));
  registry.registerPrefix("TAX_OFF", new SalesTaxParselet(TAX_REMOVE));
}
