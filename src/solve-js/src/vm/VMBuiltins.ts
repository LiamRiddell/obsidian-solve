import { Value, numberValue, errorValue } from "@solve-js/vm/Value";

/**
 * Registry of 37 built-in mathematical functions.
 * Indexed by the number pushed as an operand of OpCode.CALL_BUILTIN.
 */
export const builtinFunctions: Record<number, (args: Value[]) => Value> = {
    // ── Populated below ──
    0: (args) => numberValue(Math.sqrt(args[0].toNumber())),
    1: (args) => numberValue(Math.abs(args[0].toNumber())),
    2: (args) => numberValue(Math.sin(args[0].toNumber())),
    3: (args) => numberValue(Math.cos(args[0].toNumber())),
    4: (args) => numberValue(Math.tan(args[0].toNumber())),
    5: (args) => numberValue(Math.log(args[0].toNumber())),
    6: (args) => numberValue(Math.ceil(args[0].toNumber())),
    7: (args) => numberValue(Math.floor(args[0].toNumber())),
    8: (args) => numberValue(Math.round(args[0].toNumber())),
    9: (args) => numberValue(Math.min(...args.map(a => a.toNumber()))),
    10: (args) => numberValue(Math.max(...args.map(a => a.toNumber()))),
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
};

/**
 * Registry of plugin-registered functions.
 * Indexed by the number pushed as an operand of OpCode.CALL_PLUGIN.
 *
 * Functions may return a Promise — the orchestrator pre-resolves them
 * before VM execution. If a Promise reaches the VM, the CALL_PLUGIN
 * handler throws ASYNC_PLUGIN_CALL.
 *
 * Populated by DomainRegistry.register() at plugin registration time.
 * Entries are cleared on plugin unregister.
 */
export const pluginFunctionRegistry: Record<
    number,
    (args: Value[]) => Value | Promise<Value>
> = {};
