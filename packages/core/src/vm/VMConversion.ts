import { Value, ValueType, numberValue, bigIntValue, uomValue, matrixValue, errorValue, symbolicValue, type MatrixData, type MatrixEntry } from "@solve-js/vm/Value";
import { convertUnit, getMeasure } from "@solve-js/uom/UomConverter";
import { sharedCurrencyExchange } from "@solve-js/uom/CurrencyExchange";
import { sameShape } from "@solve-js/vm/MatrixOps";
import { type SymbolicNode, constNode, simplifySymbolic } from "@solve-js/vm/Symbolic";

/** Converts a Value into a SymbolicNode — its own tree if already Symbolic, else a `const` node wrapping its numeric value. */
function toSymbolicNode(v: Value): SymbolicNode {
    return v.type === ValueType.Symbolic ? (v.value as SymbolicNode) : constNode(v.toNumber());
}

/**
 * Unify two Value operands that may carry units of measurement.
 * Returns numeric values in a common unit (or undefined unit if incompatible).
 */
export function unifyUom(l: Value, r: Value): { lv: number; rv: number; unit: string | undefined; sameMeasure: boolean } {
    if (l.type === ValueType.Uom && r.type === ValueType.Uom) {
        if (l.unit === r.unit) {
            return { lv: l.toNumber(), rv: r.toNumber(), unit: l.unit, sameMeasure: true };
        }
        const lMeasure = getMeasure(l.unit!);
        const rMeasure = getMeasure(r.unit!);
        const isCurrency = sharedCurrencyExchange.isCurrency(l.unit!) && sharedCurrencyExchange.isCurrency(r.unit!);

        if (lMeasure && lMeasure === rMeasure) {
            const rvConverted = convertUnit(r.toNumber(), r.unit!, l.unit!);
            return { lv: l.toNumber(), rv: rvConverted, unit: l.unit, sameMeasure: true };
        }
        if (isCurrency) {
            const rvConverted = sharedCurrencyExchange.convertSync(r.toNumber(), r.unit!, l.unit!);
            if (rvConverted !== null) {
                return { lv: l.toNumber(), rv: rvConverted, unit: l.unit, sameMeasure: true };
            }
        }
        return { lv: l.toNumber(), rv: r.toNumber(), unit: undefined, sameMeasure: false };
    }
    if (l.type === ValueType.Uom) {
        return { lv: l.toNumber(), rv: r.toNumber(), unit: l.unit, sameMeasure: true };
    }
    if (r.type === ValueType.Uom) {
        return { lv: l.toNumber(), rv: r.toNumber(), unit: r.unit, sameMeasure: true };
    }
    return { lv: l.toNumber(), rv: r.toNumber(), unit: undefined, sameMeasure: true };
}

/**
 * Apply a numeric binary operation with type-aware dispatch.
 * Handles BigInt, UoM, Vector, Symbolic, and plain Number operands.
 *
 * @param symbolicOp - which SymbolicNode kind to build when either operand
 *   is Symbolic (`vm/Symbolic.ts`). Only ADD/SUB/MUL/DIV pass this (the
 *   "four arithmetic opcodes" the symbolic-algebra phase scopes itself
 *   to) — MOD's own call site passes nothing, so a Symbolic operand there
 *   falls through to the ordinary numeric path (`toNumber()` -> 0), an
 *   explicit, disclosed scope boundary rather than an oversight.
 */
export function binaryOp(
    l: Value, r: Value,
    op: (a: number, b: number) => number,
    bigOp?: (a: bigint, b: bigint) => bigint,
    symbolicOp?: "add" | "sub" | "mul" | "div"
): Value {
    // Error/Pending short-circuit — MUST run before any other branch.
    // Value.toNumber() returns 0 for both Error and Pending (see
    // vm/Value.ts), so without this check, every path below (including
    // the plain-number fast path two lines down) would silently treat an
    // errored or not-yet-resolved operand as the number 0 — e.g. an
    // errored cross-line reference (`prev + 1` in packages/lines) would
    // quietly evaluate to 1 instead of surfacing the error. Propagate
    // Error/Pending operands as-is (left operand checked first, matching
    // left-to-right evaluation order) rather than manufacturing a new
    // error, so the original error code/message (or pending query key)
    // reaches the caller unchanged. Confirmed via ADD/SUB/MUL/DIV/MOD in
    // vm/VM.ts: none of their type-specific fast paths (Number/Boolean/
    // Datetime/Uom/Rate) match Error or Pending, so every one of them
    // already funnels here on those operand types.
    if (l.type === ValueType.Error) return l;
    if (r.type === ValueType.Error) return r;
    if (l.type === ValueType.Pending) return l;
    if (r.type === ValueType.Pending) return r;

    // Symbolic dispatch — either operand carries a free-variable formula.
    // Builds the corresponding SymbolicNode (the non-symbolic side, if
    // any, becomes a `const` node via its own numeric value), simplifies
    // it (vm/Symbolic.ts's deliberately bounded rule set), and wraps the
    // result back as Symbolic. `symbolicOp` is undefined for opcodes that
    // don't support this (currently just MOD) — those fall through to the
    // ordinary numeric path below unchanged.
    if (symbolicOp && (l.type === ValueType.Symbolic || r.type === ValueType.Symbolic)) {
        const node: SymbolicNode = { kind: symbolicOp, left: toSymbolicNode(l), right: toSymbolicNode(r) };
        return symbolicValue(simplifySymbolic(node));
    }

    // Fast path: both operands are plain numbers — skip all type checks.
    // This is the overwhelmingly common case (90%+ of all binary ops).
    // Inlined arithmetic avoids the overhead of helper function dispatch,
    // UoM unification, Vector iteration, BigInt conversion, and NaN guards.
    if (l.type === ValueType.Number && r.type === ValueType.Number) {
        return numberValue(op(l.value as number, r.value as number));
    }

    if (l.type === ValueType.BigInt || r.type === ValueType.BigInt) {
        // Read an already-BigInt operand's raw bigint directly — routing it
        // through .toNumber() first (as this used to do unconditionally)
        // round-trips through an IEEE754 double, silently truncating any
        // value beyond ~2^53 before the bigint math even runs. E.g.
        // `12345678901234567890n + 0` corrupted to 12345678901234567168n.
        // A genuinely Number-typed operand has no extra precision to lose,
        // so it still converts via toNumber() (BigInt() throws on
        // fractional input here, same as before this fix).
        const lb = l.type === ValueType.BigInt ? (l.value as bigint) : BigInt(l.toNumber());
        const rb = r.type === ValueType.BigInt ? (r.value as bigint) : BigInt(r.toNumber());
        if (bigOp) return bigIntValue(bigOp(lb, rb));
        return bigIntValue(lb + rb);
    }

    if (l.type === ValueType.Uom || r.type === ValueType.Uom) {
        const { lv, rv, unit, sameMeasure } = unifyUom(l, r);
        if (isNaN(lv) || isNaN(rv)) return numberValue(0);
        if (!sameMeasure) {
            // unifyUom couldn't reconcile the two units — either they're
            // genuinely incompatible measures (meters + kilograms), or
            // they're both currencies but no rate was available yet.
            // Silently combining the raw magnitudes here used to produce a
            // confidently-wrong, unitless number (e.g. "0.01 BTC + 1 ETH"
            // → a bare "1.01", the naive 0.01+1 sum with the currency
            // context just dropped) instead of surfacing the failure —
            // mirrors the existing UOM_CONVERT_TO/_IN error path in VM.ts.
            const lUnit = l.type === ValueType.Uom ? l.unit : undefined;
            const rUnit = r.type === ValueType.Uom ? r.unit : undefined;
            return errorValue("INCOMPATIBLE_UNITS", `Cannot combine incompatible units: ${lUnit ?? "?"} and ${rUnit ?? "?"}`);
        }
        return uomValue(op(lv, rv), unit!);
    }

    // Element-wise Matrix dispatch (ADD/SUB/DIV/MOD land here; MUL's real
    // scalar-vs-matrix-product disambiguation happens in VM.ts's own MUL
    // case BEFORE falling through to binaryOp() at all, so this generic
    // path only ever needs to handle the always-element-wise ops).
    if (l.type === ValueType.Matrix && r.type === ValueType.Matrix) {
        const lm = l.value as MatrixData;
        const rm = r.value as MatrixData;
        if (!sameShape(lm, rm)) {
            // Silently truncating/broadcasting a shape mismatch used to
            // drop components with no indication (the old flat-Array
            // Math.min() truncation bug) — surface it instead.
            return errorValue("DIMENSION_MISMATCH", `Cannot combine matrices of different shapes: ${lm.rows}x${lm.cols} and ${rm.rows}x${rm.cols}`);
        }
        const result: MatrixEntry[] = new Array(lm.data.length);
        for (let i = 0; i < lm.data.length; i++) result[i] = op(lm.data[i] as number, rm.data[i] as number);
        return matrixValue(lm.rows, lm.cols, result);
    }

    if (l.type === ValueType.Matrix) {
        // Scalar broadcast: [1,2,3]/10 => [0.1,0.2,0.3] — preserves shape.
        const lm = l.value as MatrixData;
        const scalar = r.toNumber();
        const result: MatrixEntry[] = lm.data.map(v => op(v as number, scalar));
        return matrixValue(lm.rows, lm.cols, result);
    }

    if (r.type === ValueType.Matrix) {
        const rm = r.value as MatrixData;
        const scalar = l.toNumber();
        const result: MatrixEntry[] = rm.data.map(v => op(scalar, v as number));
        return matrixValue(rm.rows, rm.cols, result);
    }

    const lNum = l.toNumber();
    const rNum = r.toNumber();
    if (isNaN(lNum) || isNaN(rNum)) return numberValue(0);
    return numberValue(op(lNum, rNum));
}
