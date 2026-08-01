import { Value, ValueType, numberValue, uomValue, errorValue } from "@solve-js/vm/Value";
import { allocatePluginFunctionIndex } from "@solve-js/vm/VMBuiltins";
import { adjustForInflation, CPI_MIN_YEAR, CPI_MAX_YEAR } from "../data/CpiTable";

/**
 * Inflation plugin functions -- registered via IEnginePackage.pluginFunctions
 * (collision-safe allocator), not VMBuiltins.ts's shared builtinFunctions
 * registry, since none of these three need function-call (`name(args)`)
 * reachability through FunctionCallParselet -- only the general 3-arg
 * `inflationAdjust(amount, fromYear, toYear)` needs that (see VMBuiltins.ts
 * CALL_BUILTIN index 60). Matches TimezonePluginFunctions.ts's pattern.
 *
 * "Present year" is computed at VM EXECUTION time (new Date().getFullYear()
 * inside the handler), not baked in at parse time -- same reasoning as this
 * engine's DATE_NOW opcode: a parse-time constant would go stale if the
 * compiled bytecode for a line is ever re-executed on a later date.
 */

export const INFLATION_FROM_YEAR_TO_PRESENT_IDX = allocatePluginFunctionIndex();
export const INFLATION_TO_YEAR_FROM_PRESENT_IDX = allocatePluginFunctionIndex();
export const INFLATION_FUTURE_VALUE_IDX = allocatePluginFunctionIndex();

function yearRangeError(code: string, badYear: number): Value {
  return errorValue(
    code,
    `Year ${badYear} is outside the bundled CPI table's range (${CPI_MIN_YEAR}-${CPI_MAX_YEAR})`,
  );
}

/** "what is $X from YEAR" -> X (given as YEAR's dollars) expressed in present-day dollars. */
export function inflationFromYearToPresentHandler(args: Value[]): Value {
  const amountValue = args[0];
  const fromYear = args[1].toNumber();
  const toYear = new Date().getFullYear();
  const result = adjustForInflation(amountValue.toNumber(), fromYear, toYear);
  if (result === undefined) return yearRangeError("INFLATION_YEAR_OUT_OF_RANGE", fromYear);
  return amountValue.type === ValueType.Uom ? uomValue(result, amountValue.unit!) : numberValue(result);
}

/**
 * "what was $X worth in YEAR" / "$X in YEAR dollars" -> X (given as
 * present-day dollars) expressed in YEAR's dollars.
 */
export function inflationToYearFromPresentHandler(args: Value[]): Value {
  const amountValue = args[0];
  const fromYear = new Date().getFullYear();
  const toYear = args[1].toNumber();
  const result = adjustForInflation(amountValue.toNumber(), fromYear, toYear);
  if (result === undefined) return yearRangeError("INFLATION_YEAR_OUT_OF_RANGE", toYear);
  return amountValue.type === ValueType.Uom ? uomValue(result, amountValue.unit!) : numberValue(result);
}

/**
 * "value of $X in FUTURE_YEAR assuming N% inflation" -> a simple flat-rate
 * compound-growth projection, NOT CPI-table-based (future years aren't in
 * the historical table) -- years = FUTURE_YEAR - present year, then the
 * same compound-growth formula as the Finance package's compoundFutureValue
 * builtin (VMBuiltins.ts index 51): FV = amount * (1 + rate) ^ years.
 * `rate` is a decimal fraction (e.g. 0.03 for 3%), matching that
 * convention everywhere else in this codebase.
 */
export function inflationFutureValueHandler(args: Value[]): Value {
  const amountValue = args[0];
  const futureYear = args[1].toNumber();
  const rate = args[2].toNumber();
  const years = futureYear - new Date().getFullYear();
  if (1 + rate <= 0) {
    return errorValue("INVALID_RATE", `inflationFutureValue: rate ${rate} makes (1 + rate) non-positive`);
  }
  const amount = amountValue.toNumber();
  const fv = amount * Math.pow(1 + rate, years);
  return amountValue.type === ValueType.Uom ? uomValue(fv, amountValue.unit!) : numberValue(fv);
}
