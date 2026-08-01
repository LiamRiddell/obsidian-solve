import { Value, ValueType, numberValue, uomValue, errorValue } from "@solve-js/vm/Value";
import { allocatePluginFunctionIndex } from "@solve-js/vm/VMBuiltins";
import type { LineExecutionContext } from "@solve-js/vm/VM";

/**
 * Cross-line data access — `prev`, `line<N>`, `sum(line X : line Y)`,
 * `total(line X : line Y)`, `average(line X : line Y)`, and `total above`/
 * `sum above`/`average above`.
 *
 * Every handler here follows the SAME short-circuit discipline, which is
 * the actual load-bearing correctness requirement of this whole package
 * (not the line-number arithmetic, which is trivial): `Value.toNumber()`
 * returns `0` for BOTH `Pending` and `Error` types (confirmed in
 * `vm/Value.ts`), so any handler that skipped this check would silently
 * compute a wrong number instead of surfacing a clear error the moment it
 * touched an unresolved-async or already-errored line — exactly the
 * failure class `ARCHITECTURE.md` §12 P0 item 1 (still open) describes,
 * and exactly the class of bug this codebase treats as its worst. See
 * `checkLineValue()` below — every handler routes through it.
 */

function checkLineValue(v: Value | undefined, lineNumber: number): Value | null {
  if (v === undefined) {
    return errorValue("LINE_NOT_YET_EVALUATED", `Line ${lineNumber} has not been evaluated yet (forward reference, or out of range)`);
  }
  if (v.type === ValueType.Pending) {
    return errorValue("LINE_RESULT_PENDING", `Line ${lineNumber}'s result is still resolving`);
  }
  if (v.type === ValueType.Error) {
    return errorValue("LINE_RESULT_ERROR", `Line ${lineNumber} has an error`);
  }
  return null; // no problem — safe to use v
}

function requireContext(context: LineExecutionContext | undefined): Value | null {
  if (!context?.getLineResult) {
    return errorValue("LINE_REF_NO_DOCUMENT", "Cross-line references require a real document — not available outside one (e.g. evaluateExpression()'s single-expression path)");
  }
  return null;
}

/** `prev` — the immediately-preceding line's cached result. */
export const PREV_FN_IDX = allocatePluginFunctionIndex();
export function prevHandler(_args: Value[], context?: LineExecutionContext): Value {
  const ctxError = requireContext(context);
  if (ctxError) return ctxError;
  const targetLine = context!.lineIndex - 1;
  const v = context!.getLineResult!(targetLine);
  const err = checkLineValue(v, targetLine);
  return err ?? v!;
}

/** `line<N>` / `line N` — an arbitrary line's cached result by 1-based number. */
export const LINE_REF_FN_IDX = allocatePluginFunctionIndex();
export function lineRefHandler(args: Value[], context?: LineExecutionContext): Value {
  const ctxError = requireContext(context);
  if (ctxError) return ctxError;
  const targetLine = args[0].toNumber();
  const v = context!.getLineResult!(targetLine);
  const err = checkLineValue(v, targetLine);
  return err ?? v!;
}

/**
 * Shared range-walk for `sum(line X : line Y)` / `total(...)` /
 * `average(...)`. Restricted to plain `Number`/`Uom` values of the SAME
 * measure — errors on `String`/`Boolean`/`Datetime` rather than silently
 * coercing via `.toNumber()` (which would, e.g., turn a Datetime into an
 * epoch-ms number and silently "sum" timestamps together).
 */
function aggregateRange(from: number, to: number, context: LineExecutionContext, isAverage: boolean): Value {
  let total = 0;
  let count = 0;
  let commonUnit: string | undefined;
  let sawUom = false;
  const step = from <= to ? 1 : -1;
  for (let n = from; step > 0 ? n <= to : n >= to; n += step) {
    const v = context.getLineResult!(n);
    const err = checkLineValue(v, n);
    if (err) return err;
    if (v!.type !== ValueType.Number && v!.type !== ValueType.Uom) {
      return errorValue("LINE_RANGE_NON_NUMERIC", `Line ${n} is not a plain number or unit value — cannot include it in a sum/total/average range`);
    }
    if (v!.type === ValueType.Uom) {
      sawUom = true;
      if (commonUnit === undefined) commonUnit = v!.unit;
      else if (v!.unit !== commonUnit) {
        return errorValue("LINE_RANGE_MIXED_UNITS", `Line ${n}'s unit (${v!.unit}) doesn't match the range's first unit (${commonUnit}) — aggregating mixed units would silently misrepresent the result`);
      }
    }
    total += v!.toNumber();
    count++;
  }
  const result = isAverage ? total / count : total;
  return sawUom ? uomValue(result, commonUnit!) : numberValue(result);
}

/** `sum(line X : line Y)` / `total(line X : line Y)`. */
export const SUM_RANGE_FN_IDX = allocatePluginFunctionIndex();
export function sumRangeHandler(args: Value[], context?: LineExecutionContext): Value {
  const ctxError = requireContext(context);
  if (ctxError) return ctxError;
  return aggregateRange(args[0].toNumber(), args[1].toNumber(), context!, false);
}

/** `average(line X : line Y)`. */
export const AVERAGE_RANGE_FN_IDX = allocatePluginFunctionIndex();
export function averageRangeHandler(args: Value[], context?: LineExecutionContext): Value {
  const ctxError = requireContext(context);
  if (ctxError) return ctxError;
  return aggregateRange(args[0].toNumber(), args[1].toNumber(), context!, true);
}

/**
 * `total above` / `sum above` / `average above` — aggregate every line's
 * result from the current line's immediate predecessor backward, stopping
 * at (not including) the nearest blank line or `#` heading.
 */
function aggregateAbove(context: LineExecutionContext, isAverage: boolean): Value {
  const boundaryCheck = context.isLineBoundary;
  if (!boundaryCheck) {
    return errorValue("LINE_REF_NO_DOCUMENT", "\"above\" aggregation requires a real document");
  }
  let total = 0;
  let count = 0;
  let commonUnit: string | undefined;
  let sawUom = false;
  for (let n = context.lineIndex - 1; n >= 1; n--) {
    if (boundaryCheck(n)) break;
    const v = context.getLineResult!(n);
    const err = checkLineValue(v, n);
    if (err) return err;
    if (v!.type !== ValueType.Number && v!.type !== ValueType.Uom) {
      return errorValue("LINE_RANGE_NON_NUMERIC", `Line ${n} is not a plain number or unit value — cannot include it in "above" aggregation`);
    }
    if (v!.type === ValueType.Uom) {
      sawUom = true;
      if (commonUnit === undefined) commonUnit = v!.unit;
      else if (v!.unit !== commonUnit) {
        return errorValue("LINE_RANGE_MIXED_UNITS", `Line ${n}'s unit (${v!.unit}) doesn't match the range's unit (${commonUnit})`);
      }
    }
    total += v!.toNumber();
    count++;
  }
  if (count === 0) return errorValue("LINE_RANGE_EMPTY", "No lines above to aggregate (hit the top of the document, a blank line, or a heading immediately)");
  const result = isAverage ? total / count : total;
  return sawUom ? uomValue(result, commonUnit!) : numberValue(result);
}

export const TOTAL_ABOVE_FN_IDX = allocatePluginFunctionIndex();
export function totalAboveHandler(_args: Value[], context?: LineExecutionContext): Value {
  const ctxError = requireContext(context);
  if (ctxError) return ctxError;
  return aggregateAbove(context!, false);
}

export const AVERAGE_ABOVE_FN_IDX = allocatePluginFunctionIndex();
export function averageAboveHandler(_args: Value[], context?: LineExecutionContext): Value {
  const ctxError = requireContext(context);
  if (ctxError) return ctxError;
  return aggregateAbove(context!, true);
}
