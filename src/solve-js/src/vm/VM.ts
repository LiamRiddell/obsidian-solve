import { OpCode } from "@solve-js/parser/OpCode";
import { Value, ValueType, numberValue, stringValue, bigIntValue, hexValue, uomValue, vectorValue, boolValue, datetimeValue, percentageValue, persistentValue, isArenaActive } from "@solve-js/vm/Value";
import { OpRegistry, type VM } from "@solve-js/vm/OpRegistry";
import { convertUnit, getMeasure, getBestUnit } from "@solve-js/uom/UomConverter";
import { sharedCurrencyExchange } from "@solve-js/uom/CurrencyExchange";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import { DiagnosticPipeline, DiagnosticEventType } from "@solve-js/diagnostics";
import { builtinFunctions } from "@solve-js/vm/VMBuiltins";
import { getOpCodeName } from "@solve-js/parser/OpCode";
import { unifyUom, binaryOp } from "@solve-js/vm/VMConversion";

export function createVM(registry: OpRegistry, maxStackDepth = 200, maxInstructions = 50000): VM {
    const stack: Value[] = [];
    const variables = new Map<string, Value>();
    let instructionCount = 0;

    return {
      push(v: Value) {
        if (stack.length < maxStackDepth) {
          stack.push(v);
        }
      },
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
      },
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

export interface Bytecode {
    opcodes: Uint8Array;
    numbers: Float64Array;
    strings: string[];
}

// ── Computed-goto dispatch table ─────────────────────────────────────────
// Replaces the `switch` statement with an O(1) function table indexed by
// opcode value. For sparse OpCode values (0–200 with ~55 used entries), V8
// cannot use a dense jump table — the switch compiles to a binary-search tree
// of ~logN comparisons per dispatch. The function table gives O(1) array load
// + handler call, and TurboFan can inline the small handler functions (~1–5
// ops each) directly at the call site.
//
// The array is pre-filled with a no-op handler for ALL slots 0–200 so V8
// keeps it in fast packed-elements mode (not dictionary mode). HALT is handled
// inline in the dispatch loop because it needs to return from executeBytecode().

interface DispatchContext {
    stack: Value[];
    opcodes: Uint8Array;
    numbers: Float64Array;
    strings: string[];
    vm: VM;
    hasArena: boolean;
}

/**
 * Handler function for a single opcode.
 * Receives the dispatch context and current ip (pointing to first operand byte).
 * Returns the new ip for the next instruction.
 */
type OpHandler = (ctx: DispatchContext, ip: number) => number;

/** Default handler for undefined/unknown opcodes — no-op, ip unchanged. */
const NO_OP_HANDLER: OpHandler = (_ctx, ip) => ip;

const MAX_OPCODE = OpCode.PLUGIN_CUSTOM; // 200
const opHandlers: OpHandler[] = [];

/** Populate the dispatch table once at module load time. */
function initDispatchTable(): void {
  // Pre-fill all slots with the no-op default so the array stays in fast
  // packed-elements mode (not dictionary mode for sparse arrays).
  for (let i = 0; i <= MAX_OPCODE; i++) {
    opHandlers[i] = NO_OP_HANDLER;
  }

  // ── Stack operations ──────────────────────────────────────────────────
  // NOP already has NO_OP_HANDLER from pre-fill.

  opHandlers[OpCode.DUP] = (ctx, ip) => {
    ctx.stack.push(ctx.stack[ctx.stack.length - 1]);
    return ip;
  };

  opHandlers[OpCode.SWAP] = (ctx, ip) => {
    const a = ctx.stack.pop()!;
    const b = ctx.stack.pop()!;
    ctx.stack.push(a);
    ctx.stack.push(b);
    return ip;
  };

  // ── Push literals ─────────────────────────────────────────────────────
  opHandlers[OpCode.PUSH_NUMBER] = (ctx, ip) => {
    ctx.stack.push(numberValue(ctx.numbers[ctx.opcodes[ip]]));
    return ip + 1;
  };

  opHandlers[OpCode.PUSH_BIGINT] = (ctx, ip) => {
    ctx.stack.push(bigIntValue(BigInt(ctx.numbers[ctx.opcodes[ip]])));
    return ip + 1;
  };

  opHandlers[OpCode.PUSH_HEX] = (ctx, ip) => {
    ctx.stack.push(hexValue(ctx.numbers[ctx.opcodes[ip]]));
    return ip + 1;
  };

  opHandlers[OpCode.PUSH_STRING] = (ctx, ip) => {
    ctx.stack.push(stringValue(ctx.strings[ctx.opcodes[ip]]));
    return ip + 1;
  };

  opHandlers[OpCode.PUSH_BOOLEAN] = (ctx, ip) => {
    ctx.stack.push(boolValue(ctx.opcodes[ip] === 1));
    return ip + 1;
  };

  // ── Arithmetic (with inlined numeric fast paths) ──────────────────────

  opHandlers[OpCode.ADD] = (ctx, ip) => {
    const r = ctx.stack.pop()!, l = ctx.stack.pop()!;
    if (l.type === ValueType.Number && r.type === ValueType.Number) {
      ctx.stack.push(numberValue((l.value as number) + (r.value as number)));
    } else if (l.type === ValueType.Datetime) {
      let durMs = 0;
      if (r.type === ValueType.Uom) {
        const unit = r.unit;
        if (unit) { try { durMs = convertUnit(r.toNumber(), unit, "ms"); } catch { /* Ignore */ } }
      } else {
        durMs = r.toNumber();
      }
      ctx.stack.push(datetimeValue(l.toNumber() + durMs));
    } else {
      ctx.stack.push(binaryOp(l, r, (a, b) => a + b, (a, b) => a + b));
    }
    return ip;
  };

  opHandlers[OpCode.SUB] = (ctx, ip) => {
    const r = ctx.stack.pop()!, l = ctx.stack.pop()!;
    if (l.type === ValueType.Number && r.type === ValueType.Number) {
      ctx.stack.push(numberValue((l.value as number) - (r.value as number)));
    } else if (l.type === ValueType.Datetime) {
      let durMs = 0;
      if (r.type === ValueType.Uom) {
        const unit = r.unit;
        if (unit) { try { durMs = convertUnit(r.toNumber(), unit, "ms"); } catch { /* Ignore */ } }
      } else {
        durMs = r.toNumber();
      }
      ctx.stack.push(datetimeValue(l.toNumber() - durMs));
    } else {
      ctx.stack.push(binaryOp(l, r, (a, b) => a - b, (a, b) => a - b));
    }
    return ip;
  };

  opHandlers[OpCode.MUL] = (ctx, ip) => {
    const r = ctx.stack.pop()!, l = ctx.stack.pop()!;
    if (l.type === ValueType.Number && r.type === ValueType.Number) {
      ctx.stack.push(numberValue((l.value as number) * (r.value as number)));
    } else {
      ctx.stack.push(binaryOp(l, r, (a, b) => a * b, (a, b) => a * b));
    }
    return ip;
  };

  opHandlers[OpCode.DIV] = (ctx, ip) => {
    const r = ctx.stack.pop()!, l = ctx.stack.pop()!;
    if (l.type === ValueType.Uom && r.type === ValueType.Uom) {
      const { lv, rv, sameMeasure } = unifyUom(l, r);
      if (sameMeasure) {
        ctx.stack.push(numberValue(lv / rv));
      } else {
        ctx.stack.push(uomValue(lv / rv, l.unit!));
      }
    } else {
      ctx.stack.push(binaryOp(l, r, (a, b) => a / b, (a, b) => a / b));
    }
    return ip;
  };

  opHandlers[OpCode.MOD] = (ctx, ip) => {
    const r = ctx.stack.pop()!, l = ctx.stack.pop()!;
    ctx.stack.push(binaryOp(l, r, (a, b) => a % b, (a, b) => a % b));
    return ip;
  };

  opHandlers[OpCode.EXP] = (ctx, ip) => {
    const r = ctx.stack.pop()!, l = ctx.stack.pop()!;
    ctx.stack.push(numberValue(Math.pow(l.toNumber(), r.toNumber())));
    return ip;
  };

  // ── Unary operators ───────────────────────────────────────────────────

  opHandlers[OpCode.NEG] = (ctx, ip) => {
    const v = ctx.stack.pop()!;
    if (v.type === ValueType.BigInt) ctx.stack.push(bigIntValue(-(v.value as bigint)));
    else if (v.type === ValueType.Uom) ctx.stack.push(uomValue(-v.toNumber(), v.unit!));
    else ctx.stack.push(numberValue(-v.toNumber()));
    return ip;
  };

  opHandlers[OpCode.POS] = (ctx, ip) => {
    const v = ctx.stack.pop()!;
    if (v.type === ValueType.Uom) ctx.stack.push(uomValue(v.toNumber(), v.unit!));
    else ctx.stack.push(numberValue(v.toNumber()));
    return ip;
  };

  // ── Type conversions ──────────────────────────────────────────────────

  opHandlers[OpCode.TO_NUMBER] = (ctx, ip) => {
    const v = ctx.stack.pop()!;
    ctx.stack.push(numberValue(v.toNumber()));
    return ip;
  };

  opHandlers[OpCode.TO_HEX] = (ctx, ip) => {
    const v = ctx.stack.pop()!;
    ctx.stack.push(hexValue(v.toNumber()));
    return ip;
  };

  opHandlers[OpCode.TO_PERCENTAGE] = (ctx, ip) => {
    const v = ctx.stack.pop()!;
    ctx.stack.push(percentageValue(v.toNumber()));
    return ip;
  };

  // ── Bitwise operations ────────────────────────────────────────────────

  opHandlers[OpCode.LSHIFT] = (ctx, ip) => {
    const r = ctx.stack.pop()!, l = ctx.stack.pop()!;
    if (l.type === ValueType.BigInt || r.type === ValueType.BigInt) {
      ctx.stack.push(bigIntValue(BigInt(l.toNumber()) << BigInt(r.toNumber())));
    } else {
      ctx.stack.push(numberValue(l.toNumber() << r.toNumber()));
    }
    return ip;
  };

  opHandlers[OpCode.RSHIFT] = (ctx, ip) => {
    const r = ctx.stack.pop()!, l = ctx.stack.pop()!;
    if (l.type === ValueType.BigInt || r.type === ValueType.BigInt) {
      ctx.stack.push(bigIntValue(BigInt(l.toNumber()) >> BigInt(r.toNumber())));
    } else {
      ctx.stack.push(numberValue(l.toNumber() >> r.toNumber()));
    }
    return ip;
  };

  opHandlers[OpCode.BIT_AND] = (ctx, ip) => {
    const r = ctx.stack.pop()!, l = ctx.stack.pop()!;
    if (l.type === ValueType.BigInt || r.type === ValueType.BigInt) {
      ctx.stack.push(bigIntValue(BigInt(l.toNumber()) & BigInt(r.toNumber())));
    } else {
      ctx.stack.push(numberValue(l.toNumber() & r.toNumber()));
    }
    return ip;
  };

  opHandlers[OpCode.BIT_OR] = (ctx, ip) => {
    const r = ctx.stack.pop()!, l = ctx.stack.pop()!;
    if (l.type === ValueType.BigInt || r.type === ValueType.BigInt) {
      ctx.stack.push(bigIntValue(BigInt(l.toNumber()) | BigInt(r.toNumber())));
    } else {
      ctx.stack.push(numberValue(l.toNumber() | r.toNumber()));
    }
    return ip;
  };

  opHandlers[OpCode.BIT_XOR] = (ctx, ip) => {
    const r = ctx.stack.pop()!, l = ctx.stack.pop()!;
    if (l.type === ValueType.BigInt || r.type === ValueType.BigInt) {
      ctx.stack.push(bigIntValue(BigInt(l.toNumber()) ^ BigInt(r.toNumber())));
    } else {
      ctx.stack.push(numberValue(l.toNumber() ^ r.toNumber()));
    }
    return ip;
  };

  opHandlers[OpCode.BIT_NOT] = (ctx, ip) => {
    const v = ctx.stack.pop()!;
    if (v.type === ValueType.BigInt) ctx.stack.push(bigIntValue(~(v.value as bigint)));
    else ctx.stack.push(numberValue(~v.toNumber()));
    return ip;
  };

  // ── Variables ─────────────────────────────────────────────────────────

  opHandlers[OpCode.LOAD_VAR] = (ctx, ip) => {
    const varIdx = ctx.opcodes[ip];
    const varName = ctx.strings[varIdx];
    const val = ctx.vm.getVar(varName);
    if (val !== undefined) ctx.stack.push(val);
    else ctx.stack.push(numberValue(0));
    return ip + 1;
  };

  opHandlers[OpCode.STORE_VAR] = (ctx, ip) => {
    const val = ctx.stack.pop()!;
    const varIdx = ctx.opcodes[ip];
    const varName = ctx.strings[varIdx];
    ctx.vm.setVar(varName, ctx.hasArena ? persistentValue(val) : val);
    ctx.stack.push(val);
    return ip + 1;
  };

  // ── Datetime ──────────────────────────────────────────────────────────

  opHandlers[OpCode.DATE_NOW] = (ctx, ip) => {
    ctx.stack.push(datetimeValue(Date.now()));
    return ip;
  };

  opHandlers[OpCode.DATE_ADD] = (ctx, ip) => {
    const durValue = ctx.stack.pop()!;
    const dtValue = ctx.stack.pop()!;
    const dt = dtValue.toNumber();
    let durMs = 0;
    if (durValue.type === ValueType.Uom) {
      const unit = durValue.unit;
      if (unit) { try { durMs = convertUnit(durValue.toNumber(), unit, "ms"); } catch { durMs = 0; } }
    } else {
      durMs = durValue.toNumber();
    }
    ctx.stack.push(datetimeValue(dt + durMs));
    return ip;
  };

  opHandlers[OpCode.DATE_SUB] = (ctx, ip) => {
    const durValue = ctx.stack.pop()!;
    const dtValue = ctx.stack.pop()!;
    const dt = dtValue.toNumber();
    let durMs = 0;
    if (durValue.type === ValueType.Uom) {
      const unit = durValue.unit;
      if (unit) { try { durMs = convertUnit(durValue.toNumber(), unit, "ms"); } catch { durMs = 0; } }
    } else {
      durMs = durValue.toNumber();
    }
    ctx.stack.push(datetimeValue(dt - durMs));
    return ip;
  };

  // ── UoM ───────────────────────────────────────────────────────────────

  opHandlers[OpCode.UOM_CONVERT] = (ctx, ip) => {
    const unit = (ctx.stack.pop()!.value as string);
    const val = ctx.stack.pop()!.toNumber();
    ctx.stack.push(uomValue(val, unit));
    return ip;
  };

  opHandlers[OpCode.UOM_CONVERT_TO] = (ctx, ip) => {
    const toUnit = (ctx.stack.pop()!.value as string);
    const fromUnit = (ctx.stack.pop()!.value as string);
    const val = ctx.stack.pop()!.toNumber();
    const measure = getMeasure(fromUnit);
    const isCurrency = sharedCurrencyExchange.isCurrency(fromUnit) && sharedCurrencyExchange.isCurrency(toUnit);
    if (measure && getMeasure(toUnit) === measure) {
      const converted = convertUnit(val, fromUnit, toUnit);
      ctx.stack.push(uomValue(converted, toUnit));
    } else if (isCurrency) {
      const converted = sharedCurrencyExchange.convertSync(val, fromUnit, toUnit);
      if (converted !== null) {
        ctx.stack.push(uomValue(converted, toUnit));
      } else {
        ctx.stack.push(uomValue(val, fromUnit));
      }
    } else {
      ctx.stack.push(uomValue(val, fromUnit));
    }
    return ip;
  };

  opHandlers[OpCode.UOM_BEST] = (ctx, ip) => {
    const unit = (ctx.stack.pop()!.value as string);
    const val = ctx.stack.pop()!.toNumber();
    const { value, unit: bestUnit } = getBestUnit(val, unit);
    ctx.stack.push(uomValue(value, bestUnit));
    return ip;
  };

  // UOM_CONVERT_IN: handles postfix `expr in unit` syntax.
  // The left expression may be a uomValue (already tagged with a unit) or a
  // plain number. Pops: toUnit (string), leftVal (Value). Pushes: converted
  // uomValue or original leftVal if conversion is not possible.
  opHandlers[OpCode.UOM_CONVERT_IN] = (ctx, ip) => {
    const toUnit = (ctx.stack.pop()!.value as string);
    const left = ctx.stack.pop()!;

    if (left.type === ValueType.Uom) {
      const fromUnit = left.unit!;
      const val = left.toNumber();
      const measure = getMeasure(fromUnit);
      const isCurrency = sharedCurrencyExchange.isCurrency(fromUnit) && sharedCurrencyExchange.isCurrency(toUnit);
      if (measure && getMeasure(toUnit) === measure) {
        const converted = convertUnit(val, fromUnit, toUnit);
        ctx.stack.push(uomValue(converted, toUnit));
      } else if (isCurrency) {
        const converted = sharedCurrencyExchange.convertSync(val, fromUnit, toUnit);
        if (converted !== null) {
          ctx.stack.push(uomValue(converted, toUnit));
        } else {
          ctx.stack.push(left);
        }
      } else {
        ctx.stack.push(left);
      }
    } else {
      // Plain number: just wrap with the target unit (no conversion needed).
      ctx.stack.push(uomValue(left.toNumber(), toUnit));
    }
    return ip;
  };

  opHandlers[OpCode.UOM_GET_VALUE] = (ctx, ip) => {
    const v = ctx.stack.pop()!;
    ctx.stack.push(numberValue(v.toNumber()));
    return ip;
  };

  // ── Vector operations ─────────────────────────────────────────────────

  opHandlers[OpCode.VEC_NEW] = (ctx, ip) => {
    const count = ctx.opcodes[ip];
    const components: number[] = [];
    for (let i = 0; i < count; i++) components.unshift(ctx.stack.pop()!.toNumber());
    ctx.stack.push(vectorValue(components));
    return ip + 1;
  };

  opHandlers[OpCode.VEC_ADD] = (ctx, ip) => {
    const r = ctx.stack.pop()!, l = ctx.stack.pop()!;
    ctx.stack.push(binaryOp(l, r, (a, b) => a + b));
    return ip;
  };

  opHandlers[OpCode.VEC_SUB] = (ctx, ip) => {
    const r = ctx.stack.pop()!, l = ctx.stack.pop()!;
    ctx.stack.push(binaryOp(l, r, (a, b) => a - b));
    return ip;
  };

  // ── Dice roll ─────────────────────────────────────────────────────────

  opHandlers[OpCode.DICE_ROLL] = (ctx, ip) => {
    const to = ctx.stack.pop()!.toNumber();
    const from = ctx.stack.pop()!.toNumber();
    ctx.stack.push(numberValue(Math.floor(Math.random() * (to - from + 1)) + from));
    return ip;
  };

  // ── Call builtin ──────────────────────────────────────────────────────

  opHandlers[OpCode.CALL_BUILTIN] = (ctx, ip) => {
    const fnIdx = ctx.opcodes[ip];
    const argCount = ctx.opcodes[ip + 1];
    const args: Value[] = [];
    for (let i = 0; i < argCount; i++) args.push(ctx.stack.pop()!);
    const fn = builtinFunctions[fnIdx];
    if (fn) ctx.stack.push(fn(args.reverse()));
    return ip + 2;
  };

  // ── Plugin custom opcode ──────────────────────────────────────────────

  opHandlers[OpCode.PLUGIN_CUSTOM] = (ctx, ip) => {
    const handler = ctx.vm.registry.get(OpCode.PLUGIN_CUSTOM);
    if (handler) {
      return handler(ctx.vm, ctx.opcodes, ip, ctx.numbers, ctx.strings);
    }
    return ip;
  };
}

initDispatchTable();

/**
 * Execute bytecode with optional diagnostic pipeline integration.
 *
 * Performance notes:
 * - Uses a computed-goto dispatch table (opHandlers[]) indexed by opcode
 *   value instead of a switch statement. For sparse OpCode values (0–200
 *   with gaps), V8 can't use a dense jump table for the switch — the
 *   dispatch table gives O(1) array load + inlinable function call.
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
): Value | undefined {
    const { opcodes, numbers, strings } = bytecode;
    const reg = vm.registry;
    let ip = 0;
    let localInstructionCount = 0;
    const maxInstructions = vm.getMaxInstructions();

    // Direct stack array reference. Bypasses VM.push/pop bounds checks
    // for the hot loop. The bytecode compiler guarantees stack balance,
    // so bounds checks are only needed for malformed/corrupt bytecode
    // (which would be caught by tests long before reaching production).
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

    if (opcodes.length === 0) return undefined;

    // Build the dispatch context once before the loop — V8 eliminates the
    // allocation via escape analysis, but hoisting guarantees it's a single
    // object slot reused for every dispatch rather than 50k+ allocations.
    const ctx: DispatchContext = { stack, opcodes, numbers, strings, vm, hasArena };

    while (ip < opcodes.length) {
      // Tighten instruction limit check: combined increment + guard.
      // V8 optimises `++localInstructionCount > maxInstructions` into a
      // single fused add-and-compare on the hot path. The default limit
      // (50k) is never reached in benchmarks, so this branch is statically
      // predicted not-taken by the CPU.
      if (++localInstructionCount > maxInstructions) {
        throw ErrorFactory.execution("INSTRUCTION_LIMIT_EXCEEDED", `Execution exceeded maximum of ${maxInstructions} instructions`);
      }
      const op = opcodes[ip++] as OpCode;

      if (shouldTrace) {
        pipeline!.fireVmStep({
          type: DiagnosticEventType.VmStep,
          elapsedNs: 0,
          expression: expression ?? "",
          opcode: op,
          opcodeName: getOpCodeName(op),
          ip: ip - 1,
          stackDepth: stack.length,
          instructionNumber: localInstructionCount,
        });
      }

      // HALT is handled inline — the return statement must exit the entire
      // executeBytecode() function, which a handler function cannot do.
      if (op === OpCode.HALT) {
        const result = stack.pop()!;
        return hasArena ? persistentValue(result) : result;
      }

      // Dispatch via computed-goto table: reuse the pre-built context object.
      // For opcodes 0–200, all slots are pre-filled (packed-elements array).
      // Opcodes > 200 fall through to registry.
      const handler = op <= MAX_OPCODE ? opHandlers[op] : undefined;
      if (handler) {
        ip = handler(ctx, ip);
      } else if (op >= OpCode.PLUGIN_CUSTOM) {
        const pluginHandler = reg.get(op as OpCode);
        if (pluginHandler) {
          ip = pluginHandler(vm, opcodes, ip, numbers, strings);
        }
      }
    }

    // Fallback return (reached if while loop exits without HALT — shouldn't happen on valid bytecode)
    const fallback = stack.pop()!;
    return hasArena ? persistentValue(fallback) : fallback;
}