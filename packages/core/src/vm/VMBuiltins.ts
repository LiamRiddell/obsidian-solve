import { Value, ValueType, numberValue, stringValue, uomValue, errorValue, type MatrixData } from "@solve-js/vm/Value";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import { unifyUom } from "@solve-js/vm/VMConversion";
import { transpose, determinant, inverse, matrixMultiply } from "@solve-js/vm/MatrixOps";
// Type-only — VM.ts imports pluginFunctionRegistry FROM this file, so a
// runtime import the other direction would be circular; `import type` is
// erased before compilation and doesn't create that problem.
import type { LineExecutionContext } from "@solve-js/vm/VM";
import { inflationRatio, CPI_MIN_YEAR, CPI_MAX_YEAR } from "@solve-js/packages/finance/data/CpiTable";

// ── Local formatting helpers for hex()/bin() (indices 48/49 below) ─────────
//
// Deliberately NOT imported from vm/VM.ts (which has its own private
// toBinaryString()/toOctalString() used by OpCode.TO_BINARY/TO_OCTAL) —
// VM.ts imports builtinFunctions FROM this file, so importing the other
// direction would create a circular module dependency. These are tiny,
// self-contained duplicates matching the same sign-handling convention
// (see VM.ts's toBinaryString/toOctalString) and the same uppercase-digit
// convention as FormatEngine.ts's formatHex() (its "= 0x{PADDED}" display
// string isn't reusable as-is — it's tied to FormattingSettings padding
// config that a plain builtin function call has no access to — so this
// matches its digit-formatting convention rather than importing it).

/** "255" -> "0xFF", "-255" -> "-0xFF". Truncates toward zero first. */
function toHexPrefixedString(n: number): string {
    const t = Math.trunc(n);
    return t < 0 ? `-0x${Math.abs(t).toString(16).toUpperCase()}` : `0x${t.toString(16).toUpperCase()}`;
}

/** "10" -> "0b1010", "-10" -> "-0b1010". Truncates toward zero first. */
function toBinPrefixedString(n: number): string {
    const t = Math.trunc(n);
    return t < 0 ? `-0b${Math.abs(t).toString(2)}` : `0b${t.toString(2)}`;
}

/**
 * Registry of built-in mathematical functions.
 * Indexed by the number pushed as an operand of OpCode.CALL_BUILTIN.
 */
export const builtinFunctions: Record<number, (args: Value[]) => Value> = {
    // ── Populated below ──
    0: (args) => numberValue(Math.sqrt(args[0].toNumber())),
    // abs(a): for a Matrix, "|a|" (Calca's determinant-pipe notation) is a
    // valid alias for det(a) (index 64) — reusing the SAME implementation,
    // not a separate one. Plain-number abs is unaffected.
    1: (args) => args[0].type === ValueType.Matrix ? determinant(args[0].value as MatrixData) : numberValue(Math.abs(args[0].toNumber())),
    2: (args) => numberValue(Math.sin(args[0].toNumber())),
    3: (args) => numberValue(Math.cos(args[0].toNumber())),
    4: (args) => numberValue(Math.tan(args[0].toNumber())),
    5: (args) => numberValue(Math.log(args[0].toNumber())),
    6: (args) => numberValue(Math.ceil(args[0].toNumber())),
    7: (args) => numberValue(Math.floor(args[0].toNumber())),
    8: (args) => numberValue(Math.round(args[0].toNumber())),
    // min/max: a plain loop replicating Math.min/Math.max's exact semantics
    // (NaN poisons the result regardless of position; empty args -> ±Infinity)
    // avoids the intermediate array .map()+spread allocates on every call.
    9: (args) => {
        let result = Infinity;
        let hasNaN = false;
        for (const a of args) {
            const n = a.toNumber();
            if (Number.isNaN(n)) hasNaN = true;
            else if (n < result) result = n;
        }
        return numberValue(hasNaN ? NaN : result);
    },
    10: (args) => {
        let result = -Infinity;
        let hasNaN = false;
        for (const a of args) {
            const n = a.toNumber();
            if (Number.isNaN(n)) hasNaN = true;
            else if (n > result) result = n;
        }
        return numberValue(hasNaN ? NaN : result);
    },
    11: (args) => numberValue(Math.asin(args[0].toNumber())),
    12: (args) => numberValue(Math.acos(args[0].toNumber())),
    13: (args) => numberValue(Math.atan(args[0].toNumber())),
    14: (args) => numberValue(Math.atan2(args[0].toNumber(), args[1].toNumber())),
    15: (args) => numberValue(Math.sinh(args[0].toNumber())),
    16: (args) => numberValue(Math.cosh(args[0].toNumber())),
    17: (args) => numberValue(Math.tanh(args[0].toNumber())),
    18: (args) => numberValue(Math.asinh(args[0].toNumber())),
    19: (args) => numberValue(Math.acosh(args[0].toNumber())),
    20: (args) => numberValue(Math.atanh(args[0].toNumber())),
    21: (args) => numberValue(Math.cbrt(args[0].toNumber())),
    22: (args) => numberValue(Math.clz32(args[0].toNumber())),
    23: (args) => numberValue(Math.expm1(args[0].toNumber())),
    24: (args) => numberValue(Math.exp(args[0].toNumber())),
    25: (args) => numberValue(Math.fround(args[0].toNumber())),
    // hypot: left as .map()+spread (unlike min/max above) — Math.hypot uses
    // a numerically-stable scaling algorithm internally to avoid overflow
    // for very large/small inputs; a naive manual reimplementation risks
    // silently changing results at the extremes, so the tiny array
    // allocation here is the safer trade.
    26: (args) => numberValue(Math.hypot(...args.map(a => a.toNumber()))),
    27: (args) => numberValue(Math.imul(args[0].toNumber(), args[1].toNumber())),
    28: (args) => numberValue(Math.log10(args[0].toNumber())),
    29: (args) => numberValue(Math.log1p(args[0].toNumber())),
    30: (args) => numberValue(Math.log2(args[0].toNumber())),
    31: (args) => numberValue(Math.pow(args[0].toNumber(), args[1].toNumber())),
    32: (args) => numberValue(Math.random()),
    33: (args) => numberValue(Math.sign(args[0].toNumber())),
    34: (args) => numberValue(Math.trunc(args[0].toNumber())),
    35: (args) => numberValue(args[0].toNumber() * Math.PI / 180),
    36: (args) => numberValue(args[0].toNumber() * 180 / Math.PI),
    // 37: diceRoll(from, to) — random integer in range [from, to] inclusive.
    // A reversed range (from > to) used to silently produce values outside
    // [to, from] via a negative-length Math.random() spread (e.g.
    // "roll(6, 1)" returning values like 2-5, never 1 or 6) instead of
    // erroring on the invalid input.
    37: (args) => {
        const from = args[0].toNumber();
        const to = args[1].toNumber();
        if (from > to) {
            return errorValue("INVALID_RANGE", `roll: invalid range, ${from} is greater than ${to}`);
        }
        return numberValue(Math.floor(Math.random() * (to - from + 1)) + from);
    },
    // gcd(a, b) — Euclidean algorithm. Negative inputs are treated by
    // magnitude (gcd is conventionally defined over non-negative integers).
    38: (args) => {
        let a = Math.trunc(Math.abs(args[0].toNumber()));
        let b = Math.trunc(Math.abs(args[1].toNumber()));
        while (b !== 0) {
            const t = b;
            b = a % b;
            a = t;
        }
        return numberValue(a);
    },
    // lcm(a, b) = |a*b| / gcd(a, b), via the same Euclidean gcd inline
    // (a standalone gcd() call site — no shared helper needed for two uses).
    39: (args) => {
        const a = Math.trunc(Math.abs(args[0].toNumber()));
        const b = Math.trunc(Math.abs(args[1].toNumber()));
        if (a === 0 || b === 0) return numberValue(0);
        let x = a, y = b;
        while (y !== 0) {
            const t = y;
            y = x % y;
            x = t;
        }
        return numberValue((a / x) * b);
    },
    // permutation(n, r) = n! / (n-r)! — computed as a running product
    // rather than two full factorials, so it stays exact for n well
    // beyond where n! itself would exceed Number.MAX_SAFE_INTEGER.
    40: (args) => {
        const n = Math.trunc(args[0].toNumber());
        const r = Math.trunc(args[1].toNumber());
        if (n < 0 || r < 0 || r > n) {
            return errorValue("INVALID_RANGE", `permutation: invalid n=${n}, r=${r} (require 0 <= r <= n)`);
        }
        let result = 1;
        for (let i = 0; i < r; i++) result *= (n - i);
        return numberValue(result);
    },
    // combination(n, r) = n! / (r! * (n-r)!) — multiply-then-divide one
    // step at a time (standard technique) keeps every intermediate result
    // an integer, avoiding the overflow a naive factorial-ratio would hit.
    41: (args) => {
        const n = Math.trunc(args[0].toNumber());
        const r = Math.trunc(args[1].toNumber());
        if (n < 0 || r < 0 || r > n) {
            return errorValue("INVALID_RANGE", `combination: invalid n=${n}, r=${r} (require 0 <= r <= n)`);
        }
        const k = Math.min(r, n - r);
        let result = 1;
        for (let i = 0; i < k; i++) result = (result * (n - i)) / (i + 1);
        return numberValue(Math.round(result));
    },
    // average(...) — arithmetic mean of any number of arguments. Backs the
    // MathPhrases package's "average of X, Y, Z" (packages/mathphrases/).
    42: (args) => {
        if (args.length === 0) return numberValue(0);
        const sum = args.reduce((acc, a) => acc + a.toNumber(), 0);
        return numberValue(sum / args.length);
    },
    // median(...) — middle value; average of the two middle values for an
    // even argument count.
    43: (args) => {
        if (args.length === 0) return numberValue(0);
        const sorted = args.map((a) => a.toNumber()).sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return numberValue(
            sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
        );
    },
    // total(...) — sum of any number of arguments.
    44: (args) => numberValue(args.reduce((acc, a) => acc + a.toNumber(), 0)),
    // count(...) — number of arguments passed.
    45: (args) => numberValue(args.length),
    // proportion(a, b, c) -> d such that a:b = c:d, i.e. d = c * (b/a) —
    // "A is to B as C is to what". Unit-aware via unifyUom: "5 km is to
    // 500m as 5 cm is to what" unifies 5km/500m to a 10:1 ratio (500m ==
    // 0.5km), so 5cm at the same ratio -> 0.5cm. Falls back to plain
    // toNumber() ratios when the units aren't the same measure (unifyUom's
    // own fallback) rather than guessing at an unsupported conversion.
    46: (args) => {
        const [a, b, c] = args;
        const { lv: aNum, rv: bNum } = unifyUom(a, b);
        if (aNum === 0) {
            return errorValue("PROPORTION_DIVIDE_BY_ZERO", `Cannot compute proportion: "${a.value}" is zero`);
        }
        const result = c.toNumber() * (bNum / aNum);
        return c.type === ValueType.Uom ? uomValue(result, c.unit!) : numberValue(result);
    },
    // clamp(value, lo, hi) — restrict value to [lo, hi]. Backs
    // "clamp X between Y and Z" / "clamp X from Y to Z".
    47: (args) => {
        const value = args[0].toNumber();
        const lo = args[1].toNumber();
        const hi = args[2].toNumber();
        if (lo > hi) {
            return errorValue("INVALID_RANGE", `clamp: invalid range, ${lo} is greater than ${hi}`);
        }
        return numberValue(Math.min(Math.max(value, lo), hi));
    },
    // hex(n) — Python/JS-style call-syntax hex formatting, e.g. hex(255) ->
    // "0xFF". Distinct from the Converters package's `255 as hex` (see
    // packages/converters/parselets/AsConverterParselet.ts): "as hex"
    // produces a ValueType.Hex (a typed NUMBER that still participates in
    // arithmetic, formatted specially on display), while hex() is a plain
    // function call that returns an ordinary String value — matching
    // Python's hex()/JS convention of a function returning display text,
    // not a numeric type.
    48: (args) => stringValue(toHexPrefixedString(args[0].toNumber())),
    // bin(n) — same call-syntax shape as hex() above, e.g. bin(10) -> "0b1010".
    49: (args) => stringValue(toBinPrefixedString(args[0].toNumber())),
    // int(x) — coerce ANY value (Number, Percentage, Uom, String, Hex, ...)
    // to a plain integer Number, truncating any fractional part toward
    // zero (Math.trunc semantics: int(5.7) -> 5, int(-5.7) -> -5). Distinct
    // from the Converters package's `x as number` (TO_NUMBER opcode),
    // which only strips a unit/percentage wrapper and keeps any decimal
    // part (e.g. "5.7 as number" -> 5.7) — int() additionally truncates.
    50: (args) => numberValue(Math.trunc(args[0].toNumber())),

    // ── Finance (packages/finance/) ──────────────────────────────────────
    // All finance builtins preserve the principal/amount argument's Uom
    // unit (e.g. a currency like "$") onto the result, matching
    // ProportionParselet's convention (index 46, above) — a plain-number
    // input produces a plain-number result.
    //
    // `rate` arguments are always a decimal fraction (e.g. 0.07 for 7%) —
    // this is how "%" already normalizes everywhere else in this codebase
    // (see packages/percentage/parselets/PercentParselet.ts: "7%" divides
    // by 100 at parse time, producing a plain Number 0.07, not a distinct
    // percentage type). Writing "at 7" instead of "at 7%" in a phrase form
    // passes 7 as-is (not 0.07) — the "%" is not implicit.

    // compoundFutureValue(principal, rate, years) -> FV = P*(1+r)^years.
    // Backs "compound interest on $P over Y years at R%" and the
    // compoundInterest(principal, rate, years) function-call form.
    51: (args) => {
        const principal = args[0].toNumber();
        const rate = args[1].toNumber();
        const years = args[2].toNumber();
        if (1 + rate <= 0) {
            return errorValue("INVALID_RATE", `compoundInterest: rate ${rate} makes (1 + rate) non-positive`);
        }
        const fv = principal * Math.pow(1 + rate, years);
        return args[0].type === ValueType.Uom ? uomValue(fv, args[0].unit!) : numberValue(fv);
    },
    // compoundInterestEarned(principal, rate, years) -> FV - principal, the
    // interest-only portion. Backs "interest on $P over Y years at R%" and
    // the interestEarned(principal, rate, years) function-call form.
    52: (args) => {
        const principal = args[0].toNumber();
        const rate = args[1].toNumber();
        const years = args[2].toNumber();
        if (1 + rate <= 0) {
            return errorValue("INVALID_RATE", `interestEarned: rate ${rate} makes (1 + rate) non-positive`);
        }
        const interest = principal * (Math.pow(1 + rate, years) - 1);
        return args[0].type === ValueType.Uom ? uomValue(interest, args[0].unit!) : numberValue(interest);
    },
    // compoundInterestRate(principal, futureValue, years) -> the rate (as a
    // decimal fraction) needed to grow principal to futureValue over years.
    // Function-call only — no clean phrase form for a reverse calculation
    // like this without inventing awkward new keywords, so it's scoped to
    // compoundInterestRate(...) rather than a natural-language phrase.
    53: (args) => {
        const principal = args[0].toNumber();
        const futureValue = args[1].toNumber();
        const years = args[2].toNumber();
        if (principal <= 0 || futureValue <= 0) {
            return errorValue("INVALID_RANGE", `compoundInterestRate: principal and futureValue must both be positive`);
        }
        if (years <= 0) {
            return errorValue("INVALID_RANGE", `compoundInterestRate: years must be greater than 0`);
        }
        return numberValue(Math.pow(futureValue / principal, 1 / years) - 1);
    },
    // compoundInterestYears(principal, futureValue, rate) -> the number of
    // years needed to grow principal to futureValue at a fixed rate.
    // Function-call only, same reasoning as index 53 above.
    54: (args) => {
        const principal = args[0].toNumber();
        const futureValue = args[1].toNumber();
        const rate = args[2].toNumber();
        if (principal <= 0 || futureValue <= 0) {
            return errorValue("INVALID_RANGE", `compoundInterestYears: principal and futureValue must both be positive`);
        }
        if (1 + rate <= 0 || rate === 0) {
            return errorValue("INVALID_RATE", `compoundInterestYears: rate ${rate} is not usable (must be > -1 and not 0)`);
        }
        return numberValue(Math.log(futureValue / principal) / Math.log(1 + rate));
    },
    // loanRepayment(principal, rate, years, periodsPerYear) — standard
    // amortizing-loan repayment (mortgage formula), redistributed evenly
    // across `periodsPerYear` periods/year: 365=daily, 12=monthly, 1=annual,
    // 0=total over the life of the loan. The loan is ALWAYS amortized
    // monthly internally (the standard mortgage convention) regardless of
    // periodsPerYear — "daily"/"annual"/"total" are the same total
    // repayment redistributed, not separately-amortized loans. Verified
    // against real worked numbers (principal=$10,000, rate=6%, years=6):
    // monthly $165.73, annual $1,988.75 (== total/years exactly), daily
    // $5.45 (== total/(years*365)), total $11,932.48.
    // Backs "daily/monthly/annual/total repayment on $P over Y years at R%".
    55: (args) => {
        const principal = args[0].toNumber();
        const rate = args[1].toNumber();
        const years = args[2].toNumber();
        const periodsPerYear = args[3].toNumber();
        if (principal <= 0) return errorValue("INVALID_RANGE", `loanRepayment: principal must be positive`);
        if (years <= 0) return errorValue("INVALID_RANGE", `loanRepayment: years must be positive`);
        if (rate < 0) return errorValue("INVALID_RATE", `loanRepayment: rate must not be negative`);
        if (periodsPerYear < 0) return errorValue("INVALID_RANGE", `loanRepayment: periodsPerYear must not be negative`);
        const { totalRepayment } = amortizeLoan(principal, rate, years);
        const result = periodsPerYear === 0 ? totalRepayment : totalRepayment / (years * periodsPerYear);
        return args[0].type === ValueType.Uom ? uomValue(result, args[0].unit!) : numberValue(result);
    },
    // loanInterest(principal, rate, years, periodsPerYear) — the interest
    // portion of index 55's repayment, same periodsPerYear convention.
    // Backs "daily/monthly/annual/total interest on $P over Y years at R%".
    56: (args) => {
        const principal = args[0].toNumber();
        const rate = args[1].toNumber();
        const years = args[2].toNumber();
        const periodsPerYear = args[3].toNumber();
        if (principal <= 0) return errorValue("INVALID_RANGE", `loanInterest: principal must be positive`);
        if (years <= 0) return errorValue("INVALID_RANGE", `loanInterest: years must be positive`);
        if (rate < 0) return errorValue("INVALID_RATE", `loanInterest: rate must not be negative`);
        if (periodsPerYear < 0) return errorValue("INVALID_RANGE", `loanInterest: periodsPerYear must not be negative`);
        const { totalInterest } = amortizeLoan(principal, rate, years);
        const result = periodsPerYear === 0 ? totalInterest : totalInterest / (years * periodsPerYear);
        return args[0].type === ValueType.Uom ? uomValue(result, args[0].unit!) : numberValue(result);
    },
    // monthlyPayment(principal, rate, years) — convenience 3-arg wrapper
    // around index 55's monthly case, for direct function-call use without
    // the periodsPerYear parameter (the task's minimum-ask function form).
    57: (args) => {
        const principal = args[0].toNumber();
        const rate = args[1].toNumber();
        const years = args[2].toNumber();
        if (principal <= 0) return errorValue("INVALID_RANGE", `monthlyPayment: principal must be positive`);
        if (years <= 0) return errorValue("INVALID_RANGE", `monthlyPayment: years must be positive`);
        if (rate < 0) return errorValue("INVALID_RATE", `monthlyPayment: rate must not be negative`);
        const { monthlyPayment } = amortizeLoan(principal, rate, years);
        return args[0].type === ValueType.Uom ? uomValue(monthlyPayment, args[0].unit!) : numberValue(monthlyPayment);
    },
    // taxAdd(amount, rate) -> amount * (1 + rate). Backs "tax on $X at R%" /
    // "VAT on $X at R%". No default rate is baked in anywhere — the caller
    // always supplies one explicitly, since tax rates vary by region and
    // change over time; this package makes no assumption about which rate
    // applies.
    58: (args) => {
        const amount = args[0].toNumber();
        const rate = args[1].toNumber();
        const result = amount * (1 + rate);
        return args[0].type === ValueType.Uom ? uomValue(result, args[0].unit!) : numberValue(result);
    },
    // taxRemove(amount, rate) -> amount / (1 + rate) — extracts the
    // pre-tax amount from a tax-INCLUSIVE total. Backs "tax off $X at R%" /
    // "VAT off $X at R%".
    59: (args) => {
        const amount = args[0].toNumber();
        const rate = args[1].toNumber();
        if (1 + rate <= 0) {
            return errorValue("INVALID_RATE", `taxRemove: rate ${rate} makes (1 + rate) non-positive`);
        }
        return args[0].type === ValueType.Uom
            ? uomValue(amount / (1 + rate), args[0].unit!)
            : numberValue(amount / (1 + rate));
    },

    // inflationAdjust(amount, fromYear, toYear) -- CPI-based inflation
    // adjustment between two arbitrary years, using the bundled CPI-U
    // table (packages/finance/data/CpiTable.ts -- see its doc comment for
    // vintage/accuracy notes). Backs the function-call form
    // inflationAdjust(...) (FunctionCallParselet's builtinNameToIndex map)
    // and the "what is $X in fromYear worth in toYear" phrase form
    // (InflationQueryParselet.ts). The two present-year-relative phrase
    // forms ("what is $X from year" / "what was $X worth in year" / "$X
    // in year dollars") and the flat-rate future-value projection ("value
    // of $X in year assuming N% inflation") are collision-safe
    // pluginFunctions instead, not indices here -- see
    // packages/finance/parselets/InflationPluginFunctions.ts.
    60: (args) => {
        const amount = args[0].toNumber();
        const fromYear = args[1].toNumber();
        const toYear = args[2].toNumber();
        const ratio = inflationRatio(fromYear, toYear);
        if (ratio === undefined) {
            return errorValue(
                "INFLATION_YEAR_OUT_OF_RANGE",
                `inflationAdjust: fromYear ${fromYear} or toYear ${toYear} is outside the bundled CPI table's range (${CPI_MIN_YEAR}-${CPI_MAX_YEAR})`,
            );
        }
        const result = amount * ratio;
        return args[0].type === ValueType.Uom ? uomValue(result, args[0].unit!) : numberValue(result);
    },

    // root(n, x) -- the n-th root of x (Numi's `root n (x)` phrasing maps
    // to this same call-style form; see FunctionCallParselet's name map).
    // No native Math.root exists (unlike Math.cbrt for n=3 specifically),
    // so this is Math.pow(x, 1/n) directly -- exact for n=2/n=3 modulo the
    // usual floating-point pow() rounding, same precision class as every
    // other builtin here.
    61: (args) => {
        const n = args[0].toNumber();
        const x = args[1].toNumber();
        return numberValue(Math.pow(x, 1 / n));
    },

    // fact(n) / factorial(n) -- integer factorial. Deliberately rejects
    // negative or non-integer input (factorial isn't defined for either
    // without a gamma-function generalization this engine doesn't need) and
    // caps at 170 -- Number.MAX_VALUE overflows to Infinity at 171!, so
    // returning a silently-wrong (or silently-infinite) result past that
    // point would be worse than a clear error.
    62: (args) => {
        const n = args[0].toNumber();
        if (!Number.isInteger(n) || n < 0) {
            return errorValue("INVALID_FACTORIAL_INPUT", `fact: ${n} is not a non-negative integer`);
        }
        if (n > 170) {
            return errorValue("FACTORIAL_OVERFLOW", `fact: ${n}! exceeds the maximum representable double (170! is the largest finite factorial)`);
        }
        let result = 1;
        for (let i = 2; i <= n; i++) result *= i;
        return numberValue(result);
    },

    // ── Matrix (packages/matrix/) ────────────────────────────────────────
    // transpose(a)/det(a)/inv(a)/dot(a,b) — reachable both via ordinary
    // function-call syntax (this map) and via operator syntax (`^T`, `^-1`
    // — see PrecedenceParser.ts's CARET special-casing, which emits these
    // SAME indices) and `|a|` (abs()'s Matrix branch, index 1 above).
    // Real linear-algebra work lives in vm/MatrixOps.ts, shared by both
    // entry points rather than duplicated.

    // transpose(a) — for a Matrix, swaps rows/cols. A plain Number is its
    // own transpose (a 1x1 "matrix" transposed is itself) — matches this
    // engine's existing convention of treating a scalar as a trivial 1x1
    // matrix (see Value.ts's toNumber()/isNaN() 1x1 special case).
    63: (args) => args[0].type === ValueType.Matrix ? transpose(args[0].value as MatrixData) : args[0],
    // det(a) — determinant. A plain Number's "determinant" is itself (the
    // determinant of a 1x1 matrix [x] is x).
    64: (args) => args[0].type === ValueType.Matrix ? determinant(args[0].value as MatrixData) : numberValue(args[0].toNumber()),
    // inv(a) — matrix inverse for a Matrix; for a plain Number, `1/x`
    // (byte-identical to `Math.pow(x, -1)`, which is what `x^-1` computed
    // before this feature existed — see PrecedenceParser.ts's `^-1`
    // special-case doc comment for why this must stay exact).
    65: (args) => {
        if (args[0].type === ValueType.Matrix) return inverse(args[0].value as MatrixData);
        return numberValue(1 / args[0].toNumber());
    },
    // dot(a, b) — matrix product / scalar-broadcast, the SAME dispatch as
    // the `*` operator between two matrices (vm/VM.ts's MUL case). Plain
    // Number operands multiply directly; a Number mixed with a Matrix
    // promotes the Number to a 1x1 Matrix first, so it broadcasts exactly
    // like matrixMultiply()'s own 1x1-scalar case.
    66: (args) => {
        const [a, b] = args;
        if (a.type === ValueType.Number && b.type === ValueType.Number) {
            return numberValue(a.toNumber() * b.toNumber());
        }
        const toMatrix = (v: Value): MatrixData =>
            v.type === ValueType.Matrix ? (v.value as MatrixData) : { rows: 1, cols: 1, data: [v.toNumber()], hasSymbolic: false };
        return matrixMultiply(toMatrix(a), toMatrix(b));
    },
};

/**
 * Standard amortizing-loan math shared by the loanRepayment/loanInterest/
 * monthlyPayment builtins (indices 55-57, above). Always amortizes monthly
 * (the standard mortgage convention) — `annualRate` is the nominal annual
 * rate as a decimal fraction (e.g. 0.06 for 6%).
 *
 * A zero rate is handled as a special case (plain principal/periods split)
 * since the closed-form annuity formula divides by rate and would
 * otherwise produce a NaN from 0/0.
 */
function amortizeLoan(
    principal: number,
    annualRate: number,
    years: number,
): { monthlyPayment: number; totalRepayment: number; totalInterest: number } {
    const n = years * 12;
    const rMonthly = annualRate / 12;
    const monthlyPayment = rMonthly === 0
        ? principal / n
        : (principal * rMonthly) / (1 - Math.pow(1 + rMonthly, -n));
    const totalRepayment = monthlyPayment * n;
    const totalInterest = totalRepayment - principal;
    return { monthlyPayment, totalRepayment, totalInterest };
}

/**
 * Registry of package-registered functions.
 * Indexed by the number pushed as an operand of OpCode.CALL_PLUGIN.
 *
 * Functions may return a Promise — the orchestrator pre-resolves them
 * before VM execution. If a Promise reaches the VM, the CALL_PLUGIN
 * handler throws ASYNC_PLUGIN_CALL.
 *
 * Populated declaratively via {@link IEnginePackage.pluginFunctions} at
 * package-registration time (see ExpressionEngine.registerPackage()).
 * Entries are cleared on package unregister.
 */
export const pluginFunctionRegistry: Record<
    number,
    (args: Value[], context?: LineExecutionContext) => Value | Promise<Value>
> = {};

/** Highest index that fits in a single Uint8Array opcode-stream byte. */
const MAX_PLUGIN_FUNCTION_INDEX = 255;
let nextPluginFunctionIndex = 0;

/**
 * Allocate a unique index into {@link pluginFunctionRegistry} for a package's
 * plugin function.
 *
 * Call once per function — typically at module scope, right where the
 * function is defined — and store the result in a constant. Don't hardcode
 * an index: two packages independently picking the same arbitrary number
 * would silently overwrite each other's handler in the shared registry.
 *
 * @throws If the index pool (0-255, a single opcode-stream byte) is exhausted.
 */
export function allocatePluginFunctionIndex(): number {
    if (nextPluginFunctionIndex > MAX_PLUGIN_FUNCTION_INDEX) {
        throw ErrorFactory.config(
            "PLUGIN_FUNCTION_INDEX_POOL_EXHAUSTED",
            `allocatePluginFunctionIndex: pool exhausted (max ${MAX_PLUGIN_FUNCTION_INDEX + 1} allocations).`
        );
    }
    return nextPluginFunctionIndex++;
}

/**
 * Registry of package-registered `as <name>` converters — the SDK extension
 * point for `IEnginePackage.asConverters` (see ExpressionEngine.registerPackage()).
 *
 * String-keyed rather than index-allocated like {@link pluginFunctionRegistry}:
 * converter names ARE the natural key (there's no bytecode-stream byte-width
 * constraint to economize for — the name is only read at parse time to
 * decide whether it's one of the fixed built-ins with a dedicated fast
 * opcode; anything else falls through to `OpCode.CALL_AS_CONVERTER`, which
 * embeds the name as a string constant and looks it up here at runtime).
 */
export const asConverterRegistry = new Map<string, (value: Value) => Value>();

/**
 * Register a custom `as <name>` converter. Called by
 * ExpressionEngine.registerPackage() for each entry in a package's
 * `asConverters`. Warns (does not throw) on a name collision — mirrors
 * ParseletRegistry's collision warning — since two independently-authored
 * packages picking the same converter name is a real possibility with a
 * shared string-keyed registry, and silently overwriting is worse than a
 * visible warning.
 *
 * Skips the warning when `handler` is REFERENCE-IDENTICAL to what's
 * already registered (mirrors `ParseletRegistry.registerPrefix()`'s own
 * `existing !== parselet` guard) — a package's `asConverters` object is a
 * module-level constant, so re-constructing an `ExpressionEngine` (which
 * re-registers every built-in package's converters from scratch each
 * time — this is not a per-instance cache) passes the exact same function
 * reference every time, not a genuine second package claiming the name.
 * Without this, every `iso8601` converter registration warned on every
 * single `new ExpressionEngine()` call after the first in a process —
 * pure noise, not a real collision signal — surfaced by
 * `DatetimePackage.ts` becoming this registry's first real consumer.
 */
export function registerAsConverter(name: string, handler: (value: Value) => Value): void {
    const key = name.toLowerCase();
    const existing = asConverterRegistry.get(key);
    if (existing && existing !== handler) {
        console.warn(`[asConverterRegistry] Converter name "${key}" is already registered — overwriting.`);
    }
    asConverterRegistry.set(key, handler);
}

/** Reverse a {@link registerAsConverter} call — used by unregisterPackage(). */
export function unregisterAsConverter(name: string): void {
    asConverterRegistry.delete(name.toLowerCase());
}
