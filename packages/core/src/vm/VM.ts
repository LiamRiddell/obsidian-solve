import { OpCode } from "@solve-js/parser/OpCode";
import { Value, ValueType, numberValue, stringValue, bigIntValue, hexValue, uomValue, arrayValue, boolValue, datetimeValue, percentageValue, persistentValue, isArenaActive, errorValue, rateValue, isRateUnit, splitRateUnit, isTimecodeUnit, timecodeFps } from "@solve-js/vm/Value";
import type { VM, OpRegistry } from "@solve-js/vm/OpRegistry";
import { convertUnit, getMeasure, getBestUnit, getConvertiblePossibilities, isWorkdayUnit } from "@solve-js/uom/UomConverter";
import { sharedCurrencyExchange } from "@solve-js/uom/CurrencyExchange";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import { DiagnosticPipeline, DiagnosticEventType } from "@solve-js/diagnostics";
import { builtinFunctions, pluginFunctionRegistry, asConverterRegistry } from "@solve-js/vm/VMBuiltins";
import { getOpCodeName } from "@solve-js/parser/OpCode";
import { unifyUom, binaryOp } from "@solve-js/vm/VMConversion";
import { sharedGlobalVariableStore } from "@solve-js/vm/GlobalVariableStore";

/**
 * Create a new VM instance with the given opcode registry and configurable limits.
 *
 * The VM is a stack machine that executes compiled bytecode. It manages:
 * - A value stack (bounded by `maxStackDepth`)
 * - A variable store (Map of name → Value)
 * - An instruction counter (bounded by `maxInstructions`)
 * - An AbortSignal for async cancellation
 *
 * @param registry - Opcode handler registry for plugin-extensible opcodes
 * @param maxStackDepth - Maximum stack slots (default 200)
 * @param maxInstructions - Maximum opcodes per expression (default 50000)
 */
export function createVM(registry: OpRegistry, maxStackDepth = 200, maxInstructions = 50000): VM {
    const stack: Value[] = [];
    const variables = new Map<string, Value>();
    let instructionCount = 0;

    let activeSignal: AbortSignal | undefined;
    let abortCurrent: (() => void) | undefined;

    return {
      push(v: Value) {
        if (stack.length < maxStackDepth) {
          stack.push(v);
        }
      },
      getMaxStackDepth() { return maxStackDepth; },
      pop() {
        if (stack.length === 0) {
          return numberValue(0);
        }
        return stack.pop()!;
      },
      popNumber() { return stack.pop()!.toNumber(); },
      popString() { return (stack.pop()!.value as string); },
      peek() { return stack[stack.length - 1]; },
      getStack() { return stack; },
      registry,
      getVar(key: string) { return variables.get(key); },
      setVar(key: string, val: Value) { variables.set(key, val); },
      reset() {
        stack.length = 0;
        variables.clear();
        instructionCount = 0;
        // Abort any in-flight async work for the previous expression
        if (abortCurrent) { abortCurrent(); abortCurrent = undefined; }
        activeSignal = undefined;
      },
      get activeSignal() { return activeSignal; },
      set activeSignal(s: AbortSignal | undefined) { activeSignal = s; },
      get abortCurrent() { return abortCurrent; },
      set abortCurrent(f: (() => void) | undefined) { abortCurrent = f; },
      getMaxInstructions() { return maxInstructions; },
      getInstructionCount() { return instructionCount; },
      incrementInstructions(n: number) {
        instructionCount += n;
        if (instructionCount > maxInstructions) {
          throw ErrorFactory.execution("INSTRUCTION_LIMIT_EXCEEDED", `Execution exceeded maximum of ${maxInstructions} instructions`);
        }
      },
    };
}

/**
 * Compiled bytecode ready for VM execution.
 *
 * Uses packed TypedArrays for cache-friendly memory layout:
 * - `opcodes`: Uint8Array of OpCode values
 * - `numbers`: Float64Array of numeric literals (indexed by opcode operands)
 * - `strings`: String table for identifiers, UoM units, and BigInt literals
 */
export interface Bytecode {
    opcodes: Uint8Array;
    numbers: Float64Array;
    strings: string[];
}

/**
 * Discriminated union returned by {@link executeBytecode}.
 *
 * Two variants:
 * - `value`: execution completed synchronously with a concrete Value
 * - `pending`: an async plugin call was encountered — the orchestrator
 *   must await the resolver Promise, then re-execute
 *
 * Replaces the old throw-AsyncSuspenseError pattern, eliminating the need
 * for try/catch in the engine.
 */
export type EvalResult =
    | { type: 'value'; value: Value }
    | { type: 'pending'; queryKey: string; resolver: Promise<Value>; packageId: string; signal: AbortSignal };

/**
 * Extract the Value from an EvalResult.
 * Throws if the result is pending (should not happen at call sites that
 * have already resolved async dependencies).
 */
export function unwrapEvalResult(result: EvalResult): Value {
    if (result.type === 'value') return result.value;
    throw new Error(`Expected value result but got pending: ${result.queryKey}`);
}

// ── Shared helpers ─────────────────────────────────────────────────────
// Kept as module-level functions so V8 can inline them at the switch case
// call sites. Cost: zero when inlined by TurboFan.

/** Extract milliseconds from a duration Value (UoM time unit or plain number).
 *  Used by ADD/SUB datetime fast paths and DATE_ADD/DATE_SUB opcodes. */
function extractDurationMs(value: Value): number {
    if (value.type === ValueType.Uom) {
        const unit = value.unit;
        if (unit) {
            try { return convertUnit(value.toNumber(), unit, "ms"); } catch { /* Ignore */ }
        }
        return 0;
    }
    return value.toNumber();
}

/**
 * Advance (or, for negative `n`, retreat) a Datetime by `n` business days,
 * skipping Saturdays/Sundays — e.g. Friday + 1 workday lands on Monday, not
 * Saturday. Backs the datetime package's `<date> + N workdays` / `<date> -
 * N workdays` arithmetic (see this function's ADD/SUB call sites below).
 *
 * SCOPE DECISION: does NOT exclude public holidays — plain Mon-Fri
 * business-day math only. SoulverCore's own workday calculations
 * auto-exclude public holidays via a live-updating, region-configurable
 * holiday database; picking which holidays/region and keeping such a
 * database current is a real, separate piece of scope this pass
 * deliberately does not take on (matches this codebase's established
 * pattern of documenting a scoped-down simplification rather than silently
 * pretending to support something it doesn't — e.g. Finance's "no
 * hardcoded tax rate" decision in vm/VMBuiltins.ts).
 *
 * Walks one calendar day at a time (matching this file's existing
 * DATE_NEXT_WEEKDAY/DATE_LAST_WEEKDAY local-time convention below) rather
 * than a closed-form calculation — the exact skip pattern depends on which
 * day of the week the anchor date falls on, so there's no fixed ratio like
 * uom/UomConverter.ts's workday<->day RATE conversion (that's a linear
 * approximation acceptable for Rate math; actual date arithmetic needs the
 * real, exact answer).
 */
function addBusinessDays(epochMs: number, n: number): number {
    const date = new Date(epochMs);
    let remaining = Math.trunc(Math.abs(n));
    const direction = n >= 0 ? 1 : -1;
    while (remaining > 0) {
        date.setDate(date.getDate() + direction);
        const day = date.getDay(); // 0=Sunday..6=Saturday
        if (day !== 0 && day !== 6) remaining--;
    }
    return date.getTime();
}

/**
 * Combine a video-timecode Value (`Uom(totalFrames, "timecode@fps")` — see
 * `vm/Value.ts`'s timecode section) with a right-hand operand for ADD/SUB.
 * `sign` is +1 for ADD, -1 for SUB.
 *
 * Handles three right-hand shapes:
 * - Another timecode at the SAME fps -> combine frame counts directly.
 *   ADD ("timecode + timecode") keeps the timecode tag (SoulverCore treats
 *   a timecode primarily as a duration-since-zero, so summing two is
 *   meaningful — concatenating clip lengths — unlike summing two absolute
 *   Datetimes, which this file already rejects above). SUB ("timecode -
 *   timecode") produces a plain `Uom(diff, "frames")` instead, mirroring
 *   this file's Datetime-Datetime SUB convention just above (an absolute-
 *   ish quantity minus another yields a plain duration/count, not another
 *   absolute-ish value).
 * - A plain `Uom("frames")` (see FrameCountParselet) -> add/subtract the
 *   frame count directly, no fps conversion needed.
 * - Any other Time-measure Uom (minutes, seconds, ...) -> convert to
 *   seconds via convertUnit() and multiply by the timecode's own fps to
 *   get a frame count.
 * - A bare Number -> treated as a raw frame count, for convenience.
 *
 * Deliberately NOT commutative (only handles `left` being the timecode) —
 * the task grammar this backs always writes the timecode first
 * ("timecode + N frames", not "N frames + timecode"); see this file's
 * ADD/SUB call sites for where that asymmetry is accepted.
 */
function combineTimecode(tc: Value, r: Value, sign: 1 | -1): Value {
    const fps = timecodeFps(tc.unit!);

    if (r.type === ValueType.Uom && isTimecodeUnit(r.unit)) {
        const rFps = timecodeFps(r.unit!);
        if (rFps !== fps) {
            return errorValue(
                "TIMECODE_FPS_MISMATCH",
                `Cannot combine timecodes at different frame rates (${fps} fps vs ${rFps} fps)`
            );
        }
        return sign === 1
            ? uomValue(tc.toNumber() + r.toNumber(), tc.unit!)
            : uomValue(tc.toNumber() - r.toNumber(), "frames");
    }

    if (r.type === ValueType.Uom && r.unit === "frames") {
        return uomValue(tc.toNumber() + sign * r.toNumber(), tc.unit!);
    }

    if (r.type === ValueType.Uom && r.unit && getMeasure(r.unit) === "time") {
        const seconds = convertUnit(r.toNumber(), r.unit, "s");
        return uomValue(tc.toNumber() + sign * seconds * fps, tc.unit!);
    }

    // Bare Number (or any other Uom) — treated as a raw frame count.
    return uomValue(tc.toNumber() + sign * r.toNumber(), tc.unit!);
}

/**
 * Truthiness for a conditional/logical operand. `Boolean` values use
 * their own value directly; anything else falls back to a JS-like
 * "nonzero is truthy" reading of `toNumber()` — lets a plain numeric
 * expression work as a condition (`if x then ...`) without requiring an
 * explicit comparison, without adding a whole coercion framework.
 */
function isTruthy(value: Value): boolean {
    if (value.type === ValueType.Boolean) return value.value as boolean;
    return value.toNumber() !== 0;
}

/**
 * Rate × Uom (matching the rate's denominator measure) -> plain
 * Uom/Number, the denominator cancelling out. E.g. "$50/week" ×
 * "12 weeks" -> "$600"; "30 fps" × "3 minutes" -> "5,400 frames".
 * Shared by `OpCode.RATE_MUL` (explicit) and `OpCode.MUL`'s automatic
 * rate detection (so plain "*"/"×" syntax works without a package having
 * to route through RATE_MUL specially).
 */
function multiplyRateByMatchingUom(rate: Value, multiplier: Value): Value {
    const { numerator, denominator } = splitRateUnit(rate.unit!);
    const rateMeasure = getMeasure(denominator);
    const multiplierMeasure = getMeasure(multiplier.unit!);
    if (!rateMeasure || rateMeasure !== multiplierMeasure) {
        return errorValue(
            "RATE_MUL_MEASURE_MISMATCH",
            `Cannot multiply a "${denominator}"-denominated rate by "${multiplier.unit}" — different measures`
        );
    }
    const multiplierInDenominatorUnit = convertUnit(multiplier.toNumber(), multiplier.unit!, denominator);
    const total = rate.toNumber() * multiplierInDenominatorUnit;
    return numerator ? uomValue(total, numerator) : numberValue(total);
}

// ── Converters (`as <type>`) formatting helpers ───────────────────────────
// Kept separate from FormatEngine.ts (display-only formatting of a Value
// for the editor gutter): these PRODUCE a new Value (typically a String)
// that becomes the expression's actual result, not just its rendering.

/**
 * Simplify a decimal to the smallest fraction that reproduces it within a
 * tight tolerance, via continued-fraction expansion — so a float like
 * 0.3333333333333333 (not exactly 1/3) still resolves to "1/3" instead of
 * an unreadably large denominator.
 */
function toFractionString(n: number): string {
    if (Number.isNaN(n)) return "NaN";
    if (!isFinite(n)) return n > 0 ? "Infinity" : "-Infinity";
    const negative = n < 0;
    const abs = Math.abs(n);
    const whole = Math.floor(abs);
    const frac = abs - whole;
    if (frac < 1e-9) return `${negative ? "-" : ""}${whole}`;

    let h0 = 0, h1 = 1, k0 = 1, k1 = 0;
    let b = frac;
    const maxDenominator = 1_000_000;
    for (let i = 0; i < 30; i++) {
        const a = Math.floor(b + 1e-9);
        const h2 = a * h1 + h0, k2 = a * k1 + k0;
        if (k2 > maxDenominator) break;
        h0 = h1; h1 = h2; k0 = k1; k1 = k2;
        if (Math.abs(frac - h1 / k1) < 1e-9) break;
        const rem = b - a;
        if (rem < 1e-9) break;
        b = 1 / rem;
    }
    const numerator = whole * k1 + h1;
    return `${negative ? "-" : ""}${numerator}/${k1}`;
}

/**
 * "1 + n" growth multiplier, e.g. a 50% increase (stored as the fraction
 * 0.5, matching Percentage's convention) reads as "1.5x".
 */
function toMultiplierString(n: number): string {
    const multiplier = Math.round((1 + n) * 1e6) / 1e6;
    return `${multiplier}x`;
}

/** Scientific notation with trailing mantissa zeros trimmed ("1.50e+6" -> "1.5e+6"). */
function toScientificString(n: number): string {
    if (n === 0) return "0e+0";
    const [mantissa, exponent] = n.toExponential().split("e");
    const trimmed = mantissa.includes(".") ? mantissa.replace(/0+$/, "").replace(/\.$/, "") : mantissa;
    return `${trimmed}e${exponent}`;
}

function toBinaryString(n: number): string {
    const t = Math.trunc(n);
    return t < 0 ? `-0b${Math.abs(t).toString(2)}` : `0b${t.toString(2)}`;
}

function toOctalString(n: number): string {
    const t = Math.trunc(n);
    return t < 0 ? `-0o${Math.abs(t).toString(8)}` : `0o${t.toString(8)}`;
}

/**
 * Execute bytecode with optional diagnostic pipeline integration.
 *
 * Performance notes:
 * - Uses a `switch(op)` statement for dispatch. V8 compiles dense integer
 *   switches (OpCode values 0–200) into a jump table with O(1) dispatch.
 *   All handler code is inlined directly in the switch cases, allowing
 *   TurboFan to optimize across opcode boundaries.
 * - ADD/SUB/MUL have an inlined numeric fast path that skips the `binaryOp()`
 *   function call + closure allocation when both operands are plain numbers
 *   (>90% of arithmetic ops).
 * - Tracing uses a boolean guard (`shouldTrace`) that the JIT eliminates
 *   entirely when diagnostics are disabled. No function call overhead.
 * - `Value.toNumber()` caches its result — computed once, read thereafter.
 */
export function executeBytecode(
    bytecode: Bytecode,
    vm: VM,
    pipeline?: DiagnosticPipeline | undefined,
    expression?: string
): EvalResult {
    const { opcodes, numbers, strings } = bytecode;
    let ip = 0;
    let localInstructionCount = 0;
    const maxInstructions = vm.getMaxInstructions();
    const maxStackDepth = vm.getMaxStackDepth();

    // Direct stack array reference. Bypasses VM.push/pop's own bounds check
    // (vm.push() silently no-ops past maxStackDepth — fine for the rare
    // direct caller, wrong for the hot loop, which instead gets a single
    // cheap depth check per instruction below, same cost class as the
    // instruction-count check). Built-in packages' bytecode naturally stays
    // well under maxStackDepth (nesting depth is already bounded by
    // maxNestingDepth), but a third-party package's buggy parselet — or a
    // host that raises maxComplexity/maxNestingDepth — has no other
    // backstop against unbounded stack growth without this check.
    const stack = vm.getStack();

    // Boolean guard: JIT will eliminate the entire branch when false.
    // No function call, no argument evaluation, zero overhead.
    const shouldTrace = pipeline?.hasCollectors ?? false;

    // Hoist arena check to a local constant — avoids a function call at
    // every HALT/STORE_VAR/fallback-return in the dispatch loop.
    // The arena is only active during scroll execution (ThreeTierEvaluator
    // Tier 2); in all other paths this is always false and the JIT can
    // eliminate the unreachable persistentValue() branch entirely.
    const hasArena = isArenaActive();

    if (opcodes.length === 0) return { type: 'value', value: numberValue(0) };

    while (ip < opcodes.length) {
      // Tighten instruction limit check: combined increment + guard.
      // V8 optimises `++localInstructionCount > maxInstructions` into a
      // single fused add-and-compare on the hot path. The default limit
      // (50k) is never reached in benchmarks, so this branch is statically
      // predicted not-taken by the CPU.
      if (++localInstructionCount > maxInstructions) {
        throw ErrorFactory.execution("INSTRUCTION_LIMIT_EXCEEDED", `Execution exceeded maximum of ${maxInstructions} instructions`);
      }
      // Same cost class as the check above — one comparison, statically
      // predicted not-taken. Catches stack growth left over from the
      // previous instruction's push(es); a bounded one-instruction delay
      // is fine for a safety limit (see the comment on `stack` above).
      if (stack.length > maxStackDepth) {
        throw ErrorFactory.execution("STACK_LIMIT_EXCEEDED", `Execution exceeded maximum stack depth of ${maxStackDepth}`);
      }
      const op = opcodes[ip++] as OpCode;

      if (shouldTrace) {
        const stackSnapshot = stack.map(v => ({
          type: v.type,
          value: v.value,
          unit: v.unit,
        }));
        pipeline!.fireVmStep({
          type: DiagnosticEventType.VmStep,
          elapsedNs: 0,
          expression: expression ?? "",
          opcode: op,
          opcodeName: getOpCodeName(op),
          ip: ip - 1,
          stackDepth: stack.length,
          instructionNumber: localInstructionCount,
          stack: stackSnapshot,
        });
      }

      // ── switch dispatch: V8 compiles dense integer switches (OpCode 0–200)
      //    into a jump table with O(1) dispatch. Sections mirror the OpCode
      //    enum ordering for discoverability.
      switch (op) {
        // ═══════════════════════════════════════════════════════════════
        // §1  Stack operations  (OpCode 0–3)
        // ═══════════════════════════════════════════════════════════════
        case OpCode.NOP:
          break;
        case OpCode.HALT: {
          const result = stack.pop()!;
          return { type: 'value', value: hasArena ? persistentValue(result) : result };
        }
        case OpCode.DUP:
          stack.push(stack[stack.length - 1]);
          break;
        case OpCode.SWAP: {
          const a = stack.pop()!, b = stack.pop()!;
          stack.push(a);
          stack.push(b);
          break;
        }

        // ═══════════════════════════════════════════════════════════════
        // §2  Push literals  (OpCode 10–15)
        // ═══════════════════════════════════════════════════════════════
        case OpCode.PUSH_NUMBER:
          stack.push(numberValue(numbers[opcodes[ip++]]));
          break;
        case OpCode.PUSH_BIGINT:
          stack.push(bigIntValue(BigInt(strings[opcodes[ip++]])));
          break;
        case OpCode.PUSH_HEX:
          stack.push(hexValue(numbers[opcodes[ip++]]));
          break;
        case OpCode.PUSH_STRING:
          stack.push(stringValue(strings[opcodes[ip++]]));
          break;
        case OpCode.PUSH_BOOLEAN:
          stack.push(boolValue(opcodes[ip++] === 1));
          break;

        // ═══════════════════════════════════════════════════════════════
        // §3  Arithmetic  (OpCode 20–27)
        //     Binary ops (ADD/SUB/MUL/DIV/MOD/EXP) have inlined numeric
        //     fast paths; unary ops (NEG/POS) handle BigInt and UoM.
        // ═══════════════════════════════════════════════════════════════
        case OpCode.ADD: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.Number && r.type === ValueType.Number) {
            stack.push(numberValue((l.value as number) + (r.value as number)));
          } else if (l.type === ValueType.Boolean && r.type === ValueType.Boolean) {
            // The word "and" lexes as PLUS (en.ts: `and: "PLUS"`, a
            // long-standing synonym for arithmetic "+" — "5 and 3" = 8).
            // PLUS is a Tier-1 hardcoded infix operator (see
            // parser/BindingPower.ts's BUILTIN_INFIX_BP), so a registered
            // parselet can never intercept the word "and" the way it can
            // for genuinely new tokens like "or"/"&&" — this opcode-level
            // type check is the only way "true and false" reads as logical
            // AND rather than falling through to NaN-producing numeric
            // addition. Mirrors the Datetime/Rate special-casing already
            // done here for the same reason (operand-type-driven dispatch).
            stack.push(boolValue((l.value as boolean) && (r.value as boolean)));
          } else if (l.type === ValueType.Datetime) {
            if (r.type === ValueType.Datetime) {
              // Adding two absolute timestamps has no standard meaning
              // (unlike subtracting them, which yields a duration).
              stack.push(errorValue("INVALID_DATETIME_OP", "Cannot add two datetimes together"));
            } else if (r.type === ValueType.Uom && isWorkdayUnit(r.unit)) {
              // "<date> + N workdays" — business-day-skip arithmetic, NOT
              // the generic linear-ms duration path below (a workday's
              // real-world length depends on which specific calendar days
              // it actually spans, unlike a fixed-length unit like "day").
              // See addBusinessDays()'s doc comment above.
              stack.push(datetimeValue(addBusinessDays(l.toNumber(), r.toNumber())));
            } else {
              stack.push(datetimeValue(l.toNumber() + extractDurationMs(r)));
            }
          } else if (l.type === ValueType.Uom && isTimecodeUnit(l.unit)) {
            // "timecode + N frames" / "timecode + duration" / "timecode +
            // timecode" — see combineTimecode()'s doc comment above.
            stack.push(combineTimecode(l, r, 1));
          } else {
            stack.push(binaryOp(l, r, (a, b) => a + b, (a, b) => a + b));
          }
          break;
        }
        case OpCode.SUB: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.Number && r.type === ValueType.Number) {
            stack.push(numberValue((l.value as number) - (r.value as number)));
          } else if (l.type === ValueType.Datetime) {
            if (r.type === ValueType.Datetime) {
              // "now - now" used to unconditionally re-wrap the result as
              // ANOTHER Datetime — e.g. subtracting two timestamps close
              // together produced a near-Unix-epoch date ("01/01/1970,
              // 01:00:00") instead of the near-zero duration a user would
              // expect. Two datetimes subtract to a duration, not a point
              // in time — represented as a Uom in milliseconds, consistent
              // with how extractDurationMs() reads durations elsewhere.
              stack.push(uomValue(l.toNumber() - r.toNumber(), "ms"));
            } else if (r.type === ValueType.Uom && isWorkdayUnit(r.unit)) {
              // "<date> - N workdays" — see the matching ADD case above.
              stack.push(datetimeValue(addBusinessDays(l.toNumber(), -r.toNumber())));
            } else {
              stack.push(datetimeValue(l.toNumber() - extractDurationMs(r)));
            }
          } else if (l.type === ValueType.Uom && isTimecodeUnit(l.unit)) {
            // "timecode - timecode" (difference) / "timecode - duration" —
            // see combineTimecode()'s doc comment above.
            stack.push(combineTimecode(l, r, -1));
          } else {
            stack.push(binaryOp(l, r, (a, b) => a - b, (a, b) => a - b));
          }
          break;
        }
        case OpCode.MUL: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.Number && r.type === ValueType.Number) {
            stack.push(numberValue((l.value as number) * (r.value as number)));
          } else if (l.type === ValueType.Uom && isRateUnit(l.unit) && r.type === ValueType.Uom && r.unit) {
            // "30 fps × 3 minutes" -> "5,400 frames" via plain "×"/"*" —
            // no package needs to route through RATE_MUL explicitly.
            stack.push(multiplyRateByMatchingUom(l, r));
          } else if (r.type === ValueType.Uom && isRateUnit(r.unit) && l.type === ValueType.Uom && l.unit) {
            // Commutative: "3 minutes × 30 fps" too.
            stack.push(multiplyRateByMatchingUom(r, l));
          } else {
            stack.push(binaryOp(l, r, (a, b) => a * b, (a, b) => a * b));
          }
          break;
        }
        case OpCode.DIV: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.Uom && r.type === ValueType.Uom) {
            const { lv, rv, sameMeasure } = unifyUom(l, r);
            if (sameMeasure) {
              stack.push(numberValue(lv / rv));
            } else if (sharedCurrencyExchange.isCurrency(l.unit!) && sharedCurrencyExchange.isCurrency(r.unit!)) {
              // Both currencies, but unifyUom couldn't reconcile them (no
              // live rate cached yet) — an honest failure, not a rate:
              // "$X per €Y" isn't a meaningful derived unit the way
              // "km/day" is, so this stays INCOMPATIBLE_UNITS rather than
              // silently becoming a nonsensical currency-pair rate.
              stack.push(errorValue("INCOMPATIBLE_UNITS", `Cannot combine incompatible units: ${l.unit} and ${r.unit}`));
            } else {
              // Genuinely different measures (e.g. "90 km / 3 day") —
              // construct a Rate rather than erroring, now that this
              // codebase has a compound/derived-unit representation (see
              // vm/Value.ts's rateValue()) — matches RATE_DIV's explicit
              // construction opcode, but reachable via plain "/" too.
              stack.push(rateValue(lv / rv, l.unit!, r.unit!));
            }
          } else {
            stack.push(binaryOp(l, r, (a, b) => a / b, (a, b) => a / b));
          }
          break;
        }
        case OpCode.MOD: {
          const r = stack.pop()!, l = stack.pop()!;
          stack.push(binaryOp(l, r, (a, b) => a % b, (a, b) => a % b));
          break;
        }
        case OpCode.EXP: {
          const r = stack.pop()!, l = stack.pop()!;
          stack.push(numberValue(Math.pow(l.toNumber(), r.toNumber())));
          break;
        }
        case OpCode.NEG: {
          const v = stack.pop()!;
          if (v.type === ValueType.BigInt) stack.push(bigIntValue(-(v.value as bigint)));
          else if (v.type === ValueType.Uom) stack.push(uomValue(-v.toNumber(), v.unit!));
          else stack.push(numberValue(-v.toNumber()));
          break;
        }
        case OpCode.POS: {
          const v = stack.pop()!;
          if (v.type === ValueType.Uom) stack.push(uomValue(v.toNumber(), v.unit!));
          else stack.push(numberValue(v.toNumber()));
          break;
        }

        // ═══════════════════════════════════════════════════════════════
        // §4  Bitwise  (OpCode 30–36)
        // ═══════════════════════════════════════════════════════════════
        case OpCode.LSHIFT: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.BigInt || r.type === ValueType.BigInt) {
            stack.push(bigIntValue(BigInt(l.toNumber()) << BigInt(r.toNumber())));
          } else {
            stack.push(numberValue(l.toNumber() << r.toNumber()));
          }
          break;
        }
        case OpCode.RSHIFT: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.BigInt || r.type === ValueType.BigInt) {
            stack.push(bigIntValue(BigInt(l.toNumber()) >> BigInt(r.toNumber())));
          } else {
            stack.push(numberValue(l.toNumber() >> r.toNumber()));
          }
          break;
        }
        case OpCode.BIT_AND: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.BigInt || r.type === ValueType.BigInt) {
            stack.push(bigIntValue(BigInt(l.toNumber()) & BigInt(r.toNumber())));
          } else {
            stack.push(numberValue(l.toNumber() & r.toNumber()));
          }
          break;
        }
        case OpCode.BIT_OR: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.BigInt || r.type === ValueType.BigInt) {
            stack.push(bigIntValue(BigInt(l.toNumber()) | BigInt(r.toNumber())));
          } else {
            stack.push(numberValue(l.toNumber() | r.toNumber()));
          }
          break;
        }
        case OpCode.BIT_XOR: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.BigInt || r.type === ValueType.BigInt) {
            stack.push(bigIntValue(BigInt(l.toNumber()) ^ BigInt(r.toNumber())));
          } else {
            stack.push(numberValue(l.toNumber() ^ r.toNumber()));
          }
          break;
        }
        case OpCode.BIT_NOT: {
          const v = stack.pop()!;
          if (v.type === ValueType.BigInt) stack.push(bigIntValue(~(v.value as bigint)));
          else stack.push(numberValue(~v.toNumber()));
          break;
        }

        // ═══════════════════════════════════════════════════════════════
        // §4b Comparison  (OpCode 40–45)
        //     Numeric fast path when both operands are Number;
        //     EQ/NEQ support UoM unification for same-measure comparison.
        // ═══════════════════════════════════════════════════════════════
        case OpCode.EQ: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.Number && r.type === ValueType.Number) {
            stack.push(boolValue((l.value as number) === (r.value as number)));
          } else if (l.type === ValueType.Uom && r.type === ValueType.Uom) {
            const { lv, rv, sameMeasure } = unifyUom(l, r);
            stack.push(boolValue(sameMeasure && lv === rv));
          } else {
            stack.push(boolValue(l.toNumber() === r.toNumber()));
          }
          break;
        }
        case OpCode.NEQ: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.Number && r.type === ValueType.Number) {
            stack.push(boolValue((l.value as number) !== (r.value as number)));
          } else if (l.type === ValueType.Uom && r.type === ValueType.Uom) {
            const { lv, rv, sameMeasure } = unifyUom(l, r);
            stack.push(boolValue(!sameMeasure || lv !== rv));
          } else {
            stack.push(boolValue(l.toNumber() !== r.toNumber()));
          }
          break;
        }
        case OpCode.LT: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.Number && r.type === ValueType.Number) {
            stack.push(boolValue((l.value as number) < (r.value as number)));
          } else {
            stack.push(boolValue(l.toNumber() < r.toNumber()));
          }
          break;
        }
        case OpCode.LTE: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.Number && r.type === ValueType.Number) {
            stack.push(boolValue((l.value as number) <= (r.value as number)));
          } else {
            stack.push(boolValue(l.toNumber() <= r.toNumber()));
          }
          break;
        }
        case OpCode.GT: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.Number && r.type === ValueType.Number) {
            stack.push(boolValue((l.value as number) > (r.value as number)));
          } else {
            stack.push(boolValue(l.toNumber() > r.toNumber()));
          }
          break;
        }
        case OpCode.GTE: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.Number && r.type === ValueType.Number) {
            stack.push(boolValue((l.value as number) >= (r.value as number)));
          } else {
            stack.push(boolValue(l.toNumber() >= r.toNumber()));
          }
          break;
        }

        // ═══════════════════════════════════════════════════════════════
        // §4c Logical / conditional select  (OpCode 130–132)
        // ═══════════════════════════════════════════════════════════════
        case OpCode.LOGICAL_AND: {
          const r = stack.pop()!, l = stack.pop()!;
          stack.push(boolValue(isTruthy(l) && isTruthy(r)));
          break;
        }
        case OpCode.LOGICAL_OR: {
          const r = stack.pop()!, l = stack.pop()!;
          stack.push(boolValue(isTruthy(l) || isTruthy(r)));
          break;
        }
        case OpCode.SELECT: {
          // Eager ternary: both branches are ALREADY evaluated and on the
          // stack by the time this opcode runs (this VM has no jump/branch
          // opcodes — see OpCode.ts's comment on SELECT for why that's an
          // intentional simplification, not an oversight). Stack order
          // (bottom to top) matches the natural parse order of "if
          // condition then thenVal else elseVal": [condition, thenVal, elseVal].
          const elseVal = stack.pop()!;
          const thenVal = stack.pop()!;
          const condition = stack.pop()!;
          stack.push(isTruthy(condition) ? thenVal : elseVal);
          break;
        }

        // ═══════════════════════════════════════════════════════════════
        // §5  Functions  (OpCode 50–52)
        // ═══════════════════════════════════════════════════════════════
        case OpCode.CALL_PLUGIN: {
          const fnIdx = opcodes[ip++];
          const argCount = opcodes[ip++];
          const args: Value[] = [];
          for (let i = 0; i < argCount; i++) args.push(stack.pop()!);
          args.reverse();
          const fn = pluginFunctionRegistry[fnIdx];
          if (!fn) {
            stack.push(numberValue(0));
          } else {
            const result = fn(args);
            if (result instanceof Promise) {
              // Return pending result — no throw. The orchestrator checks
              // result.type and handles async resolution outside the VM.
              // The pluginId + domain are embedded in the cache key format:
              //   {pluginId}:{domain}:{fnIdx}:{hash(args)}
              // We use a deterministic key from fnIdx + args for now;
              // the engine scopes it by pluginId before storing.
              const cacheKey = `plugin:${fnIdx}:${args.map(a => String(a.value ?? '')).join('|')}`;
              // activeSignal must be set by the engine before calling executeBytecode.
              // If it's not (bug), we use a new signal that will never abort —
              // this is a safety net, not the expected path.
              const signal = vm.activeSignal!;
              return { type: 'pending', queryKey: cacheKey, resolver: result, packageId: '', signal };
            }
            stack.push(result);
          }
          break;
        }
        case OpCode.CALL_BUILTIN: {
          const fnIdx = opcodes[ip++];
          const argCount = opcodes[ip++];
          const args: Value[] = [];
          for (let i = 0; i < argCount; i++) args.push(stack.pop()!);
          const fn = builtinFunctions[fnIdx];
          if (fn) stack.push(fn(args.reverse()));
          break;
        }

        // ═══════════════════════════════════════════════════════════════
        // §6  Variables  (OpCode 60–63)
        // ═══════════════════════════════════════════════════════════════
        case OpCode.LOAD_VAR: {
          const varName = strings[opcodes[ip++]];
          const val = vm.getVar(varName);
          if (val !== undefined) {
            stack.push(val);
          } else {
            throw ErrorFactory.execution(
              "UNDEFINED_VARIABLE",
              `Undefined variable: ${varName}`,
              { varName },
            );
          }
          break;
        }
        case OpCode.STORE_VAR: {
          const val = stack.pop()!;
          const varName = strings[opcodes[ip++]];
          vm.setVar(varName, hasArena ? persistentValue(val) : val);
          stack.push(val);
          break;
        }
        case OpCode.LOAD_GLOBAL_VAR: {
          // GlobalVariableAsyncResolver's preflight() runs BEFORE the VM ever
          // reaches this opcode and intercepts the "not yet declared by any
          // loaded document" case (returning a Pending value up front,
          // mirroring how currency conversion's preflight intercepts before
          // UOM_CONVERT_TO runs) — by the time execution gets here, the value
          // is guaranteed present, so this is an unconditional read, no
          // undefined-check/throw needed.
          const varName = strings[opcodes[ip++]];
          stack.push(sharedGlobalVariableStore.get(varName)!);
          break;
        }
        case OpCode.STORE_GLOBAL_VAR: {
          const val = stack.pop()!;
          const varName = strings[opcodes[ip++]];
          // Persisting here matters even more than for STORE_VAR: a global
          // outlives not just this call's own VM but every OTHER document's
          // arena-reset cycles too. An un-persisted arena Value stored here
          // would get silently corrupted by a later, unrelated arena
          // allocation in ANY document, not just this one.
          sharedGlobalVariableStore.set(varName, hasArena ? persistentValue(val) : val);
          stack.push(val);
          break;
        }

        // ═══════════════════════════════════════════════════════════════
        // §7  Type conversions  (OpCode 70–74, 140–145)
        // ═══════════════════════════════════════════════════════════════
        case OpCode.TO_NUMBER: {
          const v = stack.pop()!;
          stack.push(numberValue(v.toNumber()));
          break;
        }
        case OpCode.TO_HEX: {
          const v = stack.pop()!;
          stack.push(hexValue(v.toNumber()));
          break;
        }
        case OpCode.TO_PERCENTAGE: {
          const v = stack.pop()!;
          stack.push(percentageValue(v.toNumber()));
          break;
        }
        case OpCode.TO_FRACTION: {
          const v = stack.pop()!;
          stack.push(stringValue(toFractionString(v.toNumber())));
          break;
        }
        case OpCode.TO_MULTIPLIER: {
          const v = stack.pop()!;
          stack.push(stringValue(toMultiplierString(v.toNumber())));
          break;
        }
        case OpCode.TO_SCI: {
          const v = stack.pop()!;
          stack.push(stringValue(toScientificString(v.toNumber())));
          break;
        }
        case OpCode.TO_BINARY: {
          const v = stack.pop()!;
          stack.push(stringValue(toBinaryString(v.toNumber())));
          break;
        }
        case OpCode.TO_OCTAL: {
          const v = stack.pop()!;
          stack.push(stringValue(toOctalString(v.toNumber())));
          break;
        }
        case OpCode.CALL_AS_CONVERTER: {
          const name = (stack.pop()!.value as string).toLowerCase();
          const value = stack.pop()!;
          const converter = asConverterRegistry.get(name);
          if (!converter) {
            stack.push(errorValue("UNKNOWN_AS_CONVERTER", `Unknown converter "as ${name}"`));
          } else {
            stack.push(converter(value));
          }
          break;
        }

        // ═══════════════════════════════════════════════════════════════
        // §8  UoM  (OpCode 80–84)
        // ═══════════════════════════════════════════════════════════════
        case OpCode.UOM_CONVERT: {
          const unit = (stack.pop()!.value as string);
          const val = stack.pop()!.toNumber();
          stack.push(uomValue(val, unit));
          break;
        }
        case OpCode.UOM_CONVERT_TO: {
          const toUnit = (stack.pop()!.value as string);
          const fromUnit = (stack.pop()!.value as string);
          const val = stack.pop()!.toNumber();
          const measure = getMeasure(fromUnit);
          const isCurrency = sharedCurrencyExchange.isCurrency(fromUnit) && sharedCurrencyExchange.isCurrency(toUnit);
          if (measure && getMeasure(toUnit) === measure) {
            stack.push(uomValue(convertUnit(val, fromUnit, toUnit), toUnit));
          } else if (isCurrency) {
            const converted = sharedCurrencyExchange.convertSync(val, fromUnit, toUnit);
            if (converted !== null) {
              stack.push(uomValue(converted, toUnit));
            } else {
              // No live rate cached yet (or the fetch failed). Pushing the
              // unconverted value under its original unit would silently
              // masquerade as a correct conversion — e.g. "450 EUR to USD"
              // displaying as "450.00 EUR", which reads as a successful
              // no-op rather than the missing-data case it actually is.
              // An Error value makes the failure visible instead.
              stack.push(errorValue("CURRENCY_RATE_UNAVAILABLE", `No exchange rate available for ${fromUnit} to ${toUnit}`));
            }
          } else {
            stack.push(uomValue(val, fromUnit));
          }
          break;
        }
        case OpCode.UOM_POSSIBILITIES: {
          // "sourceUnit to ?" — pops the source unit name string, pushes a
          // human-readable list of every other unit in the same measure.
          const unit = (stack.pop()!.value as string);
          const possibilities = getConvertiblePossibilities(unit);
          stack.push(stringValue(possibilities.length > 0 ? possibilities.join(", ") : `No known units for "${unit}"`));
          break;
        }
        case OpCode.UOM_BEST: {
          const unit = (stack.pop()!.value as string);
          const val = stack.pop()!.toNumber();
          const { value, unit: bestUnit } = getBestUnit(val, unit);
          stack.push(uomValue(value, bestUnit));
          break;
        }
        case OpCode.UOM_CONVERT_IN: {
          const toUnit = (stack.pop()!.value as string);
          const left = stack.pop()!;
          if (left.type === ValueType.Uom) {
            const fromUnit = left.unit!;
            const val = left.toNumber();
            const measure = getMeasure(fromUnit);
            const isCurrency = sharedCurrencyExchange.isCurrency(fromUnit) && sharedCurrencyExchange.isCurrency(toUnit);
            if (measure && getMeasure(toUnit) === measure) {
              stack.push(uomValue(convertUnit(val, fromUnit, toUnit), toUnit));
            } else if (isCurrency) {
              const converted = sharedCurrencyExchange.convertSync(val, fromUnit, toUnit);
              if (converted !== null) {
                stack.push(uomValue(converted, toUnit));
              } else {
                // See the matching comment in UOM_CONVERT_TO — pushing the
                // original value here would silently pass off a missing
                // exchange rate as a successful (non-)conversion.
                stack.push(errorValue("CURRENCY_RATE_UNAVAILABLE", `No exchange rate available for ${fromUnit} to ${toUnit}`));
              }
            } else {
              stack.push(left);
            }
          } else {
            stack.push(uomValue(left.toNumber(), toUnit));
          }
          break;
        }
        case OpCode.UOM_GET_VALUE: {
          const v = stack.pop()!;
          stack.push(numberValue(v.toNumber()));
          break;
        }

        // ═══════════════════════════════════════════════════════════════
        // §8.5  Rate — "quantity per unit of something" (OpCode 110–112)
        //       See vm/Value.ts's rateValue()/isRateUnit()/splitRateUnit().
        // ═══════════════════════════════════════════════════════════════
        case OpCode.RATE_DIV: {
          // Construction: Uom ÷ Uom (different measures) -> Rate.
          // "90 km / 3 day" -> "30 km/day": magnitude divides, units join.
          const denominatorVal = stack.pop()!;
          const numeratorVal = stack.pop()!;
          if (denominatorVal.type !== ValueType.Uom || !denominatorVal.unit) {
            stack.push(errorValue("RATE_MISSING_DENOMINATOR_UNIT", "Cannot build a rate: the right-hand side of \"/\" has no unit"));
            break;
          }
          const numeratorUnit = numeratorVal.type === ValueType.Uom ? (numeratorVal.unit ?? "") : "";
          stack.push(rateValue(numeratorVal.toNumber() / denominatorVal.toNumber(), numeratorUnit, denominatorVal.unit));
          break;
        }
        case OpCode.RATE_MUL: {
          // Explicit form of the same rate-multiplication OpCode.MUL now
          // applies automatically to any Uom×Uom pair where one side is
          // rate-shaped — see multiplyRateByMatchingUom(). Kept as its own
          // opcode for packages that want to emit it deliberately rather
          // than relying on operand-type auto-detection.
          const multiplier = stack.pop()!;
          const rate = stack.pop()!;
          if (rate.type !== ValueType.Uom || !isRateUnit(rate.unit)) {
            stack.push(errorValue("RATE_MUL_LEFT_NOT_A_RATE", "Left-hand side of a rate multiplication must be a rate (e.g. \"$50/week\")"));
            break;
          }
          if (multiplier.type !== ValueType.Uom || !multiplier.unit) {
            stack.push(errorValue("RATE_MUL_RIGHT_MISSING_UNIT", "Right-hand side of a rate multiplication must have a unit matching the rate's denominator"));
            break;
          }
          stack.push(multiplyRateByMatchingUom(rate, multiplier));
          break;
        }
        case OpCode.RATE_CONVERT: {
          // Rescale a rate's denominator to a new unit, preserving the
          // real-world rate. "30/week as /month" -> "~130/month".
          const newDenominatorUnit = (stack.pop()!.value as string);
          const rate = stack.pop()!;
          if (rate.type !== ValueType.Uom || !isRateUnit(rate.unit)) {
            stack.push(errorValue("RATE_CONVERT_NOT_A_RATE", "Cannot convert a non-rate value's denominator"));
            break;
          }
          const { numerator, denominator } = splitRateUnit(rate.unit);
          const rateMeasure = getMeasure(denominator);
          const targetMeasure = getMeasure(newDenominatorUnit);
          if (!rateMeasure || rateMeasure !== targetMeasure) {
            stack.push(errorValue(
              "RATE_CONVERT_MEASURE_MISMATCH",
              `Cannot convert a "${denominator}"-denominated rate to "${newDenominatorUnit}" — different measures`
            ));
            break;
          }
          // How many `denominator` units are in one `newDenominatorUnit`
          // (e.g. how many weeks in 1 month) — the rate scales by that factor.
          const factor = convertUnit(1, newDenominatorUnit, denominator);
          stack.push(rateValue(rate.toNumber() * factor, numerator, newDenominatorUnit));
          break;
        }

        // ═══════════════════════════════════════════════════════════════
        // §8.7  Time — clock-time-of-day (OpCode 120)
        // ═══════════════════════════════════════════════════════════════
        case OpCode.CLOCK_TIME_TODAY: {
          // "9:00am"/"16:00" — anchored to TODAY's calendar date, not a
          // relative offset from `now` (so it stays correct regardless of
          // what time it currently is — "9:00am" always means 9am today).
          const totalMinutes = stack.pop()!.toNumber();
          const now = new Date();
          const anchored = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
          anchored.setMinutes(totalMinutes);
          stack.push(datetimeValue(anchored.getTime()));
          break;
        }

        // ═══════════════════════════════════════════════════════════════
        // §9  Datetime  (OpCode 90–93)
        // ═══════════════════════════════════════════════════════════════
        case OpCode.DATE_NOW:
          stack.push(datetimeValue(Date.now()));
          break;
        case OpCode.DATE_LITERAL:
          stack.push(datetimeValue(numbers[opcodes[ip++]]));
          break;
        case OpCode.DATE_ADD: {
          const durValue = stack.pop()!, dtValue = stack.pop()!;
          stack.push(datetimeValue(dtValue.toNumber() + extractDurationMs(durValue)));
          break;
        }
        case OpCode.DATE_SUB: {
          const durValue = stack.pop()!, dtValue = stack.pop()!;
          stack.push(datetimeValue(dtValue.toNumber() - extractDurationMs(durValue)));
          break;
        }
        case OpCode.DATE_NEXT_WEEKDAY:
        case OpCode.DATE_LAST_WEEKDAY: {
          // Stack: [now, targetDayIndex] — targetDayIndex on top (0=Sunday..6=Saturday).
          // Computes the actual next/previous occurrence of that weekday,
          // NOT a blind ±7-day offset — "next Monday" from a Monday lands
          // 7 days ahead (next week's Monday), not today; "last Monday"
          // from a Monday lands 7 days back, not today. Time-of-day is
          // preserved from `now` (matches "today"/"now" both resolving to
          // the current instant elsewhere in this file, not midnight).
          const targetDay = stack.pop()!.toNumber();
          const nowValue = stack.pop()!;
          const now = nowValue.toNumber();
          const currentDay = new Date(now).getDay();
          let diffDays = op === OpCode.DATE_NEXT_WEEKDAY
            ? (targetDay - currentDay + 7) % 7
            : (currentDay - targetDay + 7) % 7;
          if (diffDays === 0) diffDays = 7;
          const offsetMs = diffDays * 24 * 60 * 60 * 1000;
          stack.push(datetimeValue(op === OpCode.DATE_NEXT_WEEKDAY ? now + offsetMs : now - offsetMs));
          break;
        }

        // ═══════════════════════════════════════════════════════════════
        // §10 Array / Vector  (OpCode 100–108)
        //     Unified Array type replaces Vec2/Vec3/Vec4. Stores number[].
        // ═══════════════════════════════════════════════════════════════
        case OpCode.ARR_NEW: {
          const count = opcodes[ip++];
          const components: number[] = [];
          for (let i = 0; i < count; i++) components.unshift(stack.pop()!.toNumber());
          stack.push(arrayValue(components));
          break;
        }
        case OpCode.ARR_ADD: {
          const r = stack.pop()!, l = stack.pop()!;
          stack.push(binaryOp(l, r, (a, b) => a + b));
          break;
        }
        case OpCode.ARR_SUB: {
          const r = stack.pop()!, l = stack.pop()!;
          stack.push(binaryOp(l, r, (a, b) => a - b));
          break;
        }
        case OpCode.ARR_DOT: {
          const r = stack.pop()!, l = stack.pop()!;
          const lv = l.value as number[], rv = r.value as number[];
          const len = Math.min(lv.length, rv.length);
          let sum = 0;
          for (let i = 0; i < len; i++) sum += lv[i] * rv[i];
          stack.push(numberValue(sum));
          break;
        }
        case OpCode.ARR_CROSS: {
          const r = stack.pop()!, l = stack.pop()!;
          const lv = l.value as number[], rv = r.value as number[];
          if (lv.length >= 3 && rv.length >= 3) {
            stack.push(arrayValue([
              lv[1] * rv[2] - lv[2] * rv[1],
              lv[2] * rv[0] - lv[0] * rv[2],
              lv[0] * rv[1] - lv[1] * rv[0],
            ]));
          } else {
            stack.push(arrayValue([0, 0, 0]));
          }
          break;
        }
        case OpCode.ARR_SCALE: {
          const scalar = stack.pop()!.toNumber();
          const arr = stack.pop()!;
          const av = arr.value as number[];
          const result = new Array(av.length);
          for (let i = 0; i < av.length; i++) result[i] = av[i] * scalar;
          stack.push(arrayValue(result));
          break;
        }
        case OpCode.ARR_MAGNITUDE: {
          const arr = stack.pop()!;
          const av = arr.value as number[];
          let sumSq = 0;
          for (let i = 0; i < av.length; i++) sumSq += av[i] * av[i];
          stack.push(numberValue(Math.sqrt(sumSq)));
          break;
        }
        case OpCode.ARR_NORMALIZE: {
          const arr = stack.pop()!;
          const av = arr.value as number[];
          let sumSq = 0;
          for (let i = 0; i < av.length; i++) sumSq += av[i] * av[i];
          const mag = Math.sqrt(sumSq);
          if (mag === 0) {
            stack.push(arrayValue(new Array(av.length).fill(0)));
          } else {
            const result = new Array(av.length);
            for (let i = 0; i < av.length; i++) result[i] = av[i] / mag;
            stack.push(arrayValue(result));
          }
          break;
        }

      }
    }

    // Fallback return (reached if while loop exits without HALT — shouldn't happen on valid bytecode)
    const fallback = stack.pop()!;
    return { type: 'value', value: hasArena ? persistentValue(fallback) : fallback };
}