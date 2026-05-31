import { Value, ValueType, numberValue, bigIntValue, uomValue, arrayValue } from "@solve-js/vm/Value";
import { convertUnit, getMeasure } from "@solve-js/uom/UomConverter";
import { sharedCurrencyExchange } from "@solve-js/uom/CurrencyExchange";

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
 * Handles BigInt, UoM, Vector, and plain Number operands.
 */
export function binaryOp(
    l: Value, r: Value,
    op: (a: number, b: number) => number,
    bigOp?: (a: bigint, b: bigint) => bigint
): Value {
    // Fast path: both operands are plain numbers — skip all type checks.
    // This is the overwhelmingly common case (90%+ of all binary ops).
    // Inlined arithmetic avoids the overhead of helper function dispatch,
    // UoM unification, Vector iteration, BigInt conversion, and NaN guards.
    if (l.type === ValueType.Number && r.type === ValueType.Number) {
        return numberValue(op(l.value as number, r.value as number));
    }

    if (l.type === ValueType.BigInt || r.type === ValueType.BigInt) {
        const lb = BigInt(l.toNumber());
        const rb = BigInt(r.toNumber());
        if (bigOp) return bigIntValue(bigOp(lb, rb));
        return bigIntValue(lb + rb);
    }

    if (l.type === ValueType.Uom || r.type === ValueType.Uom) {
        const { lv, rv, unit } = unifyUom(l, r);
        if (isNaN(lv) || isNaN(rv)) return numberValue(0);
        return uomValue(op(lv, rv), unit!);
    }

    if (l.type === ValueType.Array && r.type === ValueType.Array) {
        const lv = l.value as number[];
        const rv = r.value as number[];
        const len = Math.min(lv.length, rv.length);
        const result: number[] = [];
        for (let i = 0; i < len; i++) result.push(op(lv[i], rv[i]));
        return arrayValue(result);
    }

    if (l.type === ValueType.Array) {
        const lv = l.value as number[];
        const result = lv.map(v => op(v, r.toNumber()));
        return arrayValue(result);
    }

    if (r.type === ValueType.Array) {
        const rv = r.value as number[];
        const result = rv.map(v => op(l.toNumber(), v));
        return arrayValue(result);
    }

    const lNum = l.toNumber();
    const rNum = r.toNumber();
    if (isNaN(lNum) || isNaN(rNum)) return numberValue(0);
    return numberValue(op(lNum, rNum));
}
