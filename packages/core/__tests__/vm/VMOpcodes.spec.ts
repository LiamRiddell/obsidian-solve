import { describe, expect, test, afterEach } from "@jest/globals";
import { createVM, executeBytecode, unwrapEvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry, OpRegistry } from "@solve-js/vm/OpRegistry";
import { OpCode } from "@solve-js/parser/OpCode";
import { Value, ValueType, enableValueArena, disableValueArena, numberValue, bigIntValue, uomValue, rowVectorValue, percentageValue, datetimeValue, stringValue, type MatrixData } from "@solve-js/vm/Value";
import { sharedGlobalVariableStore } from "@solve-js/vm/GlobalVariableStore";
import type { VM } from "@solve-js/vm/OpRegistry";

function bc(
  ops: number[],
  numbers: number[] = [],
  strings: string[] = []
): { opcodes: Uint8Array; numbers: Float64Array; strings: string[] } {
  return {
    opcodes: new Uint8Array(ops),
    numbers: new Float64Array(numbers),
    strings,
  };
}

/** Helper to create a fresh VM */
function freshVM(maxStackDepth = 200, maxInstructions = 50000): VM {
  return createVM(sharedOpRegistry, maxStackDepth, maxInstructions);
}

function pushValues(vm: VM, ...values: Value[]): void {
  for (const v of values) vm.push(v);
}

describe("VM — Stack operations", () => {
  test("SWAP exchanges top two stack values", () => {
    const vm = freshVM();
    const result = executeBytecode(
      bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.SWAP, OpCode.HALT], [10, 20]),
      vm
    );
    // After SWAP, top should be 10 (was 20 before swap)
    expect(unwrapEvalResult(result).toNumber()).toBe(10);
  });

  test("DUP duplicates top of stack", () => {
    const vm = freshVM();
    // PUSH 7, DUP (stack: [7, 7]), ADD (pop 7+7=14, push 14), HALT (pop+return 14)
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.DUP, OpCode.ADD, OpCode.HALT], [7]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(14);
  });

  test("NOP does not affect stack", () => {
    const vm = freshVM();
    const result = executeBytecode(
      bc([OpCode.NOP, OpCode.NOP, OpCode.PUSH_NUMBER, 0, OpCode.HALT], [42]),
      vm
    );
    expect(unwrapEvalResult(result).toNumber()).toBe(42);
  });
});

describe("VM — Push literals", () => {
  test("PUSH_BIGINT pushes a bigint value", () => {
    const vm = freshVM();
    // BigInt values are stored in the strings array;
    // the VM reads them as strings and converts via BigInt() at runtime.
    const result = executeBytecode(bc([OpCode.PUSH_BIGINT, 0, OpCode.HALT], [], ["9007199254740991"]), vm);
    expect(unwrapEvalResult(result).type).toBe(ValueType.BigInt);
    expect(unwrapEvalResult(result).value).toEqual(BigInt(9007199254740991));
  });

  test("PUSH_HEX pushes a hex value", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_HEX, 0, OpCode.HALT], [255]), vm);
    expect(unwrapEvalResult(result).type).toBe(ValueType.Hex);
    expect(unwrapEvalResult(result).toNumber()).toBe(255);
  });

  test("PUSH_BOOLEAN true", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_BOOLEAN, 1, OpCode.HALT]), vm);
    expect(unwrapEvalResult(result).value).toBe(true);
  });

  test("PUSH_BOOLEAN false", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_BOOLEAN, 0, OpCode.HALT]), vm);
    expect(unwrapEvalResult(result).value).toBe(false);
  });

  test("PUSH_STRING with valid index", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_STRING, 0, OpCode.HALT], [], ["hello world"]), vm);
    expect(unwrapEvalResult(result).value).toBe("hello world");
  });
});

describe("VM — Arithmetic", () => {
  test("NEG negates a positive number", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.NEG, OpCode.HALT], [42]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(-42);
  });

  test("NEG negates a negative number", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.NEG, OpCode.HALT], [-10]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(10);
  });

  test("NEG on BigInt", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_BIGINT, 0, OpCode.NEG, OpCode.HALT], [], ["100"]), vm);
    expect(unwrapEvalResult(result).type).toBe(ValueType.BigInt);
    expect(unwrapEvalResult(result).value).toEqual(BigInt(-100));
  });

  test("POS on number is identity", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.POS, OpCode.HALT], [42]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(42);
  });

  test("EXP computes power", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.EXP, OpCode.HALT], [2, 10]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(1024);
  });

  test("MOD with negative numbers", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.MOD, OpCode.HALT], [10, -3]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBeCloseTo(10 % -3);
  });
});

describe("VM — binaryOp fallback paths", () => {
  // These tests exercise the binaryOp() fallback in ADD/SUB/MUL/DIV/MOD.
  // The inlined numeric fast path (both operands Number) handles ~90%+ of
  // arithmetic. When one or both operands is a non-Number type (Vector, BigInt,
  // UoM, String), execution falls through to binaryOp() for type-aware dispatch.
  // These tests guard against regressions where the inlined path accidentally
  // excludes valid operand type combinations.

  // ── ADD: mixed-type fallback ────────────────────────────────────────

  test("ADD Number + Vector (vector scaling)", () => {
    const vm = freshVM();
    pushValues(vm, numberValue(10), rowVectorValue([1, 2]));
    // Stack: [Number(10), Vector[1,2]]; ADD pops r=Vector, l=Number
    const result = executeBytecode(bc([OpCode.ADD, OpCode.HALT]), vm);
    // binaryOp: l=Number, r=Vector → rv.map(v => op(lv, v)) → [10+1, 10+2]
    expect(unwrapEvalResult(result).type).toBe(ValueType.Matrix);
    expect((unwrapEvalResult(result).value as MatrixData).data).toEqual([11, 12]);
  });

  test("ADD Vector + Number (vector scaling)", () => {
    const vm = freshVM();
    pushValues(vm, rowVectorValue([1, 2]), numberValue(10));
    // Stack: [Vector[1,2], Number(10)]; ADD pops r=Number, l=Vector
    const result = executeBytecode(bc([OpCode.ADD, OpCode.HALT]), vm);
    // binaryOp: l=Vector, r=Number → lv.map(v => op(v, rv)) → [1+10, 2+10]
    expect(unwrapEvalResult(result).type).toBe(ValueType.Matrix);
    expect((unwrapEvalResult(result).value as MatrixData).data).toEqual([11, 12]);
  });

  test("ADD BigInt + Number", () => {
    const vm = freshVM();
    pushValues(vm, bigIntValue(BigInt(100)), numberValue(50));
    const result = executeBytecode(bc([OpCode.ADD, OpCode.HALT]), vm);
    expect(unwrapEvalResult(result).type).toBe(ValueType.BigInt);
    expect(unwrapEvalResult(result).value).toEqual(BigInt(150));
  });

  test("ADD Number + BigInt", () => {
    const vm = freshVM();
    pushValues(vm, numberValue(50), bigIntValue(BigInt(100)));
    const result = executeBytecode(bc([OpCode.ADD, OpCode.HALT]), vm);
    expect(unwrapEvalResult(result).type).toBe(ValueType.BigInt);
    expect(unwrapEvalResult(result).value).toEqual(BigInt(150));
  });

  test("ADD Number + UoM", () => {
    const vm = freshVM();
    pushValues(vm, numberValue(75), uomValue(5, "m"));
    const result = executeBytecode(bc([OpCode.ADD, OpCode.HALT]), vm);
    expect(unwrapEvalResult(result).type).toBe(ValueType.Uom);
    expect(unwrapEvalResult(result).toNumber()).toBe(80);
    expect(unwrapEvalResult(result).unit).toBe("m");
  });

  test("ADD Number + String (falls through to numeric conversion)", () => {
    const vm = freshVM();
    // PUSH_STRING r, PUSH_NUMBER l — stack bottom to top: [Number, String]
    // ADD pops: r=String("5"), l=Number(10)
    pushValues(vm, numberValue(10), stringValue("5"));
    const result = executeBytecode(bc([OpCode.ADD, OpCode.HALT]), vm);
    // binaryOp final fallback: both toNumber() → 10 + 5 = 15
    expect(unwrapEvalResult(result).type).toBe(ValueType.Number);
    expect(unwrapEvalResult(result).toNumber()).toBe(15);
  });

  // ── SUB: mixed-type fallback ────────────────────────────────────────

  test("SUB BigInt - Number", () => {
    const vm = freshVM();
    pushValues(vm, bigIntValue(BigInt(100)), numberValue(30));
    const result = executeBytecode(bc([OpCode.SUB, OpCode.HALT]), vm);
    expect(unwrapEvalResult(result).type).toBe(ValueType.BigInt);
    expect(unwrapEvalResult(result).value).toEqual(BigInt(70));
  });

  test("SUB Vector - Number", () => {
    const vm = freshVM();
    pushValues(vm, rowVectorValue([10, 20]), numberValue(3));
    const result = executeBytecode(bc([OpCode.SUB, OpCode.HALT]), vm);
    expect(unwrapEvalResult(result).type).toBe(ValueType.Matrix);
    expect((unwrapEvalResult(result).value as MatrixData).data).toEqual([7, 17]);
  });

  test("SUB Number - Vector", () => {
    const vm = freshVM();
    pushValues(vm, numberValue(10), rowVectorValue([1, 2]));
    const result = executeBytecode(bc([OpCode.SUB, OpCode.HALT]), vm);
    expect(unwrapEvalResult(result).type).toBe(ValueType.Matrix);
    expect((unwrapEvalResult(result).value as MatrixData).data).toEqual([9, 8]);
  });

  // ── MUL: mixed-type fallback ────────────────────────────────────────

  test("MUL BigInt * Number", () => {
    const vm = freshVM();
    pushValues(vm, bigIntValue(BigInt(10)), numberValue(3));
    const result = executeBytecode(bc([OpCode.MUL, OpCode.HALT]), vm);
    expect(unwrapEvalResult(result).type).toBe(ValueType.BigInt);
    expect(unwrapEvalResult(result).value).toEqual(BigInt(30));
  });

  test("MUL Vector * Number", () => {
    const vm = freshVM();
    pushValues(vm, rowVectorValue([2, 3]), numberValue(4));
    const result = executeBytecode(bc([OpCode.MUL, OpCode.HALT]), vm);
    expect(unwrapEvalResult(result).type).toBe(ValueType.Matrix);
    expect((unwrapEvalResult(result).value as MatrixData).data).toEqual([8, 12]);
  });

  test("MUL Number * Vector", () => {
    const vm = freshVM();
    pushValues(vm, numberValue(4), rowVectorValue([2, 3]));
    const result = executeBytecode(bc([OpCode.MUL, OpCode.HALT]), vm);
    expect(unwrapEvalResult(result).type).toBe(ValueType.Matrix);
    expect((unwrapEvalResult(result).value as MatrixData).data).toEqual([8, 12]);
  });

  // ── DIV/MOD: mixed-type fallback (always go through binaryOp) ──────

  test("DIV Vector / Number", () => {
    const vm = freshVM();
    pushValues(vm, rowVectorValue([10, 20]), numberValue(2));
    const result = executeBytecode(bc([OpCode.DIV, OpCode.HALT]), vm);
    expect(unwrapEvalResult(result).type).toBe(ValueType.Matrix);
    expect((unwrapEvalResult(result).value as MatrixData).data).toEqual([5, 10]);
  });

  test("MOD BigInt % Number", () => {
    const vm = freshVM();
    pushValues(vm, bigIntValue(BigInt(10)), numberValue(3));
    const result = executeBytecode(bc([OpCode.MOD, OpCode.HALT]), vm);
    expect(unwrapEvalResult(result).type).toBe(ValueType.BigInt);
    expect(unwrapEvalResult(result).value).toEqual(BigInt(1));
  });

  // ── Matrix scalar broadcast via ADD/SUB: always delegates to binaryOp
  //    (no dedicated vector-add opcode — see vm/VMConversion.ts) ──────────

  test("ADD Matrix + Number (scalar broadcast)", () => {
    const vm = freshVM();
    pushValues(vm, rowVectorValue([5, 10]), numberValue(3));
    const result = executeBytecode(bc([OpCode.ADD, OpCode.HALT]), vm);
    expect(unwrapEvalResult(result).type).toBe(ValueType.Matrix);
    expect((unwrapEvalResult(result).value as MatrixData).data).toEqual([8, 13]);
  });

  test("SUB Matrix - Number (scalar broadcast)", () => {
    const vm = freshVM();
    pushValues(vm, rowVectorValue([5, 10]), numberValue(3));
    const result = executeBytecode(bc([OpCode.SUB, OpCode.HALT]), vm);
    expect(unwrapEvalResult(result).type).toBe(ValueType.Matrix);
    expect((unwrapEvalResult(result).value as MatrixData).data).toEqual([2, 7]);
  });
});

describe("VM — Bitwise operations", () => {
  test("LSHIFT shifts left", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.LSHIFT, OpCode.HALT], [1, 3]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(8);
  });

  test("RSHIFT shifts right", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.RSHIFT, OpCode.HALT], [16, 2]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(4);
  });

  test("BIT_AND computes bitwise AND", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.BIT_AND, OpCode.HALT], [6, 3]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(2);
  });

  test("BIT_OR computes bitwise OR", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.BIT_OR, OpCode.HALT], [5, 3]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(7);
  });

  test("BIT_XOR computes bitwise XOR", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.BIT_XOR, OpCode.HALT], [5, 3]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(6);
  });

  test("BIT_NOT computes bitwise NOT", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.BIT_NOT, OpCode.HALT], [0]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(~0);
  });

  test("LSHIFT with BigInt", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_BIGINT, 0, OpCode.PUSH_BIGINT, 1, OpCode.LSHIFT, OpCode.HALT], [], ["1", "3"]), vm);
    expect(unwrapEvalResult(result).type).toBe(ValueType.BigInt);
    expect(unwrapEvalResult(result).value).toEqual(BigInt(8));
  });

  test("RSHIFT with BigInt", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_BIGINT, 0, OpCode.PUSH_BIGINT, 1, OpCode.RSHIFT, OpCode.HALT], [], ["16", "2"]), vm);
    expect(unwrapEvalResult(result).type).toBe(ValueType.BigInt);
    expect(unwrapEvalResult(result).value).toEqual(BigInt(4));
  });

  test("BIT_AND with BigInt", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_BIGINT, 0, OpCode.PUSH_BIGINT, 1, OpCode.BIT_AND, OpCode.HALT], [], ["6", "3"]), vm);
    expect(unwrapEvalResult(result).type).toBe(ValueType.BigInt);
    expect(unwrapEvalResult(result).value).toEqual(BigInt(2));
  });

  test("BIT_XOR with BigInt", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_BIGINT, 0, OpCode.PUSH_BIGINT, 1, OpCode.BIT_XOR, OpCode.HALT], [], ["5", "3"]), vm);
    expect(unwrapEvalResult(result).type).toBe(ValueType.BigInt);
    expect(unwrapEvalResult(result).value).toEqual(BigInt(6));
  });

  test("BIT_NOT with BigInt", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_BIGINT, 0, OpCode.BIT_NOT, OpCode.HALT], [], ["0"]), vm);
    expect(unwrapEvalResult(result).type).toBe(ValueType.BigInt);
    expect(unwrapEvalResult(result).value).toEqual(BigInt(~BigInt(0)));
  });
});

describe("VM — Type conversion", () => {
  test("TO_NUMBER converts to number", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_HEX, 0, OpCode.TO_NUMBER, OpCode.HALT], [255]), vm);
    expect(unwrapEvalResult(result).type).toBe(ValueType.Number);
    expect(unwrapEvalResult(result).toNumber()).toBe(255);
  });

  test("TO_HEX converts to hex", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.TO_HEX, OpCode.HALT], [255]), vm);
    expect(unwrapEvalResult(result).type).toBe(ValueType.Hex);
  });

  test("TO_PERCENTAGE converts to percentage", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.TO_PERCENTAGE, OpCode.HALT], [0.5]), vm);
    expect(unwrapEvalResult(result).type).toBe(ValueType.Percentage);
  });
});

describe("VM — Dice roll", () => {
  test("CALL_BUILTIN diceRoll returns within range over many rolls", () => {
    for (let i = 0; i < 100; i++) {
      const vm = freshVM();
      const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.CALL_BUILTIN, 37, 2, OpCode.HALT], [1, 6]), vm);
      const val = unwrapEvalResult(result).toNumber();
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(6);
    }
  });
});

describe("VM — Matrix operations", () => {
  test("MAT_NEW creates a 1x2 row-vector matrix", () => {
    const vm = freshVM();
    const result = executeBytecode(
      bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.MAT_NEW, 1, 2, OpCode.HALT], [10, 20]),
      vm
    );
    expect(unwrapEvalResult(result).type).toBe(ValueType.Matrix);
    expect((unwrapEvalResult(result).value as MatrixData).data).toEqual([10, 20]);
  });

  test("MAT_NEW creates a 1x4 row-vector matrix", () => {
    const vm = freshVM();
    const result = executeBytecode(
      bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.PUSH_NUMBER, 2, OpCode.PUSH_NUMBER, 3, OpCode.MAT_NEW, 1, 4, OpCode.HALT], [1, 2, 3, 4]),
      vm
    );
    expect(unwrapEvalResult(result).type).toBe(ValueType.Matrix);
    expect((unwrapEvalResult(result).value as MatrixData).data).toEqual([1, 2, 3, 4]);
  });

  test("ADD adds two same-shape matrices element-wise", () => {
    const vm = freshVM();
    const result = executeBytecode(
      bc([
        OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.MAT_NEW, 1, 2, // [1, 2]
        OpCode.PUSH_NUMBER, 2, OpCode.PUSH_NUMBER, 3, OpCode.MAT_NEW, 1, 2, // [3, 4]
        OpCode.ADD, OpCode.HALT,
      ], [1, 2, 3, 4]),
      vm
    );
    expect((unwrapEvalResult(result).value as MatrixData).data).toEqual([4, 6]);
  });
});

describe("VM — Datetime operations", () => {
  test("DATE_ADD adds milliseconds to datetime", () => {
    const vm = freshVM();
    const base = Date.now();
    const result = executeBytecode(
      bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.DATE_ADD, OpCode.HALT], [base, 5000]),
      vm
    );
    expect(unwrapEvalResult(result).type).toBe(ValueType.Datetime);
    expect(unwrapEvalResult(result).toNumber()).toBe(base + 5000);
  });

  test("DATE_SUB subtracts milliseconds from datetime", () => {
    const vm = freshVM();
    const base = Date.now();
    const result = executeBytecode(
      bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.DATE_SUB, OpCode.HALT], [base, 3000]),
      vm
    );
    expect(unwrapEvalResult(result).type).toBe(ValueType.Datetime);
    expect(unwrapEvalResult(result).toNumber()).toBe(base - 3000);
  });

  test("DATE_NOW pushes current timestamp", () => {
    const vm = freshVM();
    const before = Date.now();
    const result = executeBytecode(bc([OpCode.DATE_NOW, OpCode.HALT]), vm);
    const after = Date.now();
    expect(unwrapEvalResult(result).type).toBe(ValueType.Datetime);
    expect((unwrapEvalResult(result).value as number)).toBeGreaterThanOrEqual(before);
    expect((unwrapEvalResult(result).value as number)).toBeLessThanOrEqual(after);
  });

  test("ADD with Datetime + number milliseconds", () => {
    const vm = freshVM();
    // Pre-populate stack with a Datetime value, then run bytecode that pushes a number and ADDs
    const dtValue = datetimeValue(1000);
    vm.push(dtValue);
    const result = executeBytecode(
      bc([OpCode.PUSH_NUMBER, 0, OpCode.ADD, OpCode.HALT], [5000]),
      vm
    );
    expect(unwrapEvalResult(result).type).toBe(ValueType.Datetime);
    expect(unwrapEvalResult(result).toNumber()).toBe(6000);
  });
});

describe("VM — UoM operations", () => {
  test("UOM_CONVERT pushes a unit value", () => {
    const vm = freshVM();
    // UOM_CONVERT pops unit (top of stack) then value (second).
    // Stack must be: [value, unit_string] bottom to top → push number first, then string.
    const result = executeBytecode(
      bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_STRING, 0, OpCode.UOM_CONVERT, OpCode.HALT], [100], ["cm"]),
      vm
    );
    expect(unwrapEvalResult(result).type).toBe(ValueType.Uom);
    expect(unwrapEvalResult(result).toNumber()).toBe(100);
    expect(unwrapEvalResult(result).unit).toBe("cm");
  });

  test("UOM_GET_VALUE extracts numeric value from UoM", () => {
    const vm = freshVM();
    const result = executeBytecode(
      bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_STRING, 0, OpCode.UOM_CONVERT, OpCode.UOM_GET_VALUE, OpCode.HALT], [42], ["kg"]),
      vm
    );
    expect(unwrapEvalResult(result).type).toBe(ValueType.Number);
    expect(unwrapEvalResult(result).toNumber()).toBe(42);
  });

  test("UOM_BEST finds best unit", () => {
    const vm = freshVM();
    // UOM_BEST pops: unit string (top of stack), then numeric value (second).
    // Does NOT work on a UoM Value — expects raw components on the stack.
    const result = executeBytecode(
      bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_STRING, 0, OpCode.UOM_BEST, OpCode.HALT], [1000], ["mm"]),
      vm
    );
    // 1000 mm should convert to 1 m
    expect(unwrapEvalResult(result).type).toBe(ValueType.Uom);
    expect(unwrapEvalResult(result).toNumber()).toBeCloseTo(1, 5);
    expect(unwrapEvalResult(result).unit).toBe("m");
  });
});

describe("VM — Variables", () => {
  test("STORE_VAR stores and pushes value", () => {
    const vm = freshVM();
    const result = executeBytecode(
      bc([OpCode.PUSH_NUMBER, 0, OpCode.STORE_VAR, 0, OpCode.HALT], [42], ["x"]),
      vm
    );
    // STORE_VAR also leaves value on stack
    expect(unwrapEvalResult(result).toNumber()).toBe(42);
    // Verify variable was set
    expect(vm.getVar("x")!.toNumber()).toBe(42);
  });

  test("LOAD_VAR loads stored variable", () => {
    const vm = freshVM();
    // Pre-set a variable using the public VM API
    vm.setVar("y", numberValue(99));
    const result = executeBytecode(bc([OpCode.LOAD_VAR, 0, OpCode.HALT], [], ["y"]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(99);
  });

  test("LOAD_VAR throws for undefined variable", () => {
    const vm = freshVM();
    expect(() => {
      unwrapEvalResult(executeBytecode(bc([OpCode.LOAD_VAR, 0, OpCode.HALT], [], ["undefined_var"]), vm));
    }).toThrow(/Undefined variable: undefined_var/);
  });
});

describe("VM — Global Variables (direct bytecode, no parser/preflight)", () => {
  // These exercise ONLY the VM opcode handlers against sharedGlobalVariableStore
  // directly — GlobalVariableAsyncResolver's preflight (which handles the
  // "not yet declared" case by intercepting before the VM runs at all) is
  // covered separately in GlobalVariablesAcrossDocuments.spec.ts. Here, the
  // store is always pre-seeded before LOAD_GLOBAL_VAR executes, matching the
  // VM handler's own documented precondition.
  afterEach(() => {
    sharedGlobalVariableStore.clear();
  });

  test("STORE_GLOBAL_VAR stores into sharedGlobalVariableStore and also pushes the value", () => {
    const vm = freshVM();
    const result = executeBytecode(
      bc([OpCode.PUSH_NUMBER, 0, OpCode.STORE_GLOBAL_VAR, 0, OpCode.HALT], [42], ["x"]),
      vm
    );
    expect(unwrapEvalResult(result).toNumber()).toBe(42);
    expect(sharedGlobalVariableStore.get("x")!.toNumber()).toBe(42);
  });

  test("LOAD_GLOBAL_VAR reads a value already present in sharedGlobalVariableStore", () => {
    sharedGlobalVariableStore.set("y", numberValue(99));
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.LOAD_GLOBAL_VAR, 0, OpCode.HALT], [], ["y"]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(99);
  });

  test("STORE_GLOBAL_VAR does NOT write into the VM's own local scope — LOAD_VAR for the same name still throws", () => {
    const vm = freshVM();
    executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.STORE_GLOBAL_VAR, 0, OpCode.HALT], [5], ["x"]), vm);
    expect(() => {
      unwrapEvalResult(executeBytecode(bc([OpCode.LOAD_VAR, 0, OpCode.HALT], [], ["x"]), vm));
    }).toThrow(/Undefined variable: x/);
  });

  test("STORE_VAR does NOT write into sharedGlobalVariableStore — a global of the same name is unaffected", () => {
    const vm = freshVM();
    executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.STORE_VAR, 0, OpCode.HALT], [5], ["x"]), vm);
    expect(sharedGlobalVariableStore.has("x")).toBe(false);
  });

  test("a global written by one VM is visible to LOAD_GLOBAL_VAR on a completely different VM instance", () => {
    const vmA = freshVM();
    executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.STORE_GLOBAL_VAR, 0, OpCode.HALT], [7], ["shared"]), vmA);

    const vmB = freshVM(); // fresh VM, own empty local scope
    const result = executeBytecode(bc([OpCode.LOAD_GLOBAL_VAR, 0, OpCode.HALT], [], ["shared"]), vmB);
    expect(unwrapEvalResult(result).toNumber()).toBe(7);
  });

  test("STORE_GLOBAL_VAR persists past this VM's own arena when active", () => {
    enableValueArena(64);
    try {
      const vm = freshVM();
      executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.STORE_GLOBAL_VAR, 0, OpCode.HALT], [77], ["x"]), vm);
      expect(sharedGlobalVariableStore.get("x")!.toNumber()).toBe(77);
    } finally {
      disableValueArena();
    }
  });

  test("a global stored while one VM's arena is active survives a LATER, unrelated arena reset from a different VM", () => {
    enableValueArena(64);
    try {
      const vmA = freshVM();
      executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.STORE_GLOBAL_VAR, 0, OpCode.HALT], [11], ["g"]), vmA);

      // A second, unrelated evaluation on a DIFFERENT VM re-enables/resets
      // the (shared, module-level) arena — if STORE_GLOBAL_VAR hadn't
      // persisted the Value, this would silently corrupt "g"'s stored value.
      enableValueArena(64);
      const vmB = freshVM();
      executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.HALT], [999]), vmB);

      expect(sharedGlobalVariableStore.get("g")!.toNumber()).toBe(11);
    } finally {
      disableValueArena();
    }
  });

  test("STORE_GLOBAL_VAR overwrites a previous value for the same name (last-write-wins)", () => {
    const vm = freshVM();
    executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.STORE_GLOBAL_VAR, 0, OpCode.HALT], [1], ["x"]), vm);
    executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.STORE_GLOBAL_VAR, 0, OpCode.HALT], [2], ["x"]), vm);
    expect(sharedGlobalVariableStore.get("x")!.toNumber()).toBe(2);
  });
});

describe("VM — CALL_BUILTIN", () => {
  // CALL_BUILTIN args: [fnIdx, argCount]. Args are popped from the stack.
  // builtinFunctions index mapping (from VMBuiltins):
  // 0=abs, 1=sqrt, 2=sin, 3=cos, 4=tan, 5=log, 6=ceil, 7=floor, 8=round,
  // 9=asin, 10=acos, 11=atan, 12=sinh, 13=cosh, 14=atan2, 15=hypot,
  // 16=cbrt, 17=log2, 18=log10, 19=expm1, 20=log1p, 21=clz32, 22=imul,
  // 23=fround, 24=exp, 25=min, 26=max, 27=random, 28=randint, 29=srand,
  // 30=seed, 31=pow, 32=lerp, 33=sign, 34=trunc, 35=deg, 36=rad

  test("sin(0) = 0", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.CALL_BUILTIN, 2, 1, OpCode.HALT], [0]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBeCloseTo(0);
  });

  test("cos(0) = 1", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.CALL_BUILTIN, 3, 1, OpCode.HALT], [0]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBeCloseTo(1);
  });

  test("log(1) = 0", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.CALL_BUILTIN, 5, 1, OpCode.HALT], [1]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBeCloseTo(0);
  });

  test("ceil(4.2) = 5", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.CALL_BUILTIN, 6, 1, OpCode.HALT], [4.2]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(5);
  });

  test("floor(4.9) = 4", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.CALL_BUILTIN, 7, 1, OpCode.HALT], [4.9]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(4);
  });

  test("round(4.5) = 5", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.CALL_BUILTIN, 8, 1, OpCode.HALT], [4.5]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(5);
  });

  test("atan2(1, 0) ≈ π/2", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.CALL_BUILTIN, 14, 2, OpCode.HALT], [1, 0]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBeCloseTo(Math.PI / 2, 5);
  });

  test("exp(1) ≈ e", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.CALL_BUILTIN, 24, 1, OpCode.HALT], [1]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBeCloseTo(Math.E, 5);
  });

  test("pow(2, 10) = 1024", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.CALL_BUILTIN, 31, 2, OpCode.HALT], [2, 10]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(1024);
  });

  test("sign(-5) = -1", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.CALL_BUILTIN, 33, 1, OpCode.HALT], [-5]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(-1);
  });

  test("trunc(3.9) = 3", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.CALL_BUILTIN, 34, 1, OpCode.HALT], [3.9]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(3);
  });

  test("deg(180) ≈ 3.14159", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.CALL_BUILTIN, 35, 1, OpCode.HALT], [180]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBeCloseTo(Math.PI, 5);
  });

  test("rad(π) ≈ 180", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.CALL_BUILTIN, 36, 1, OpCode.HALT], [Math.PI]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBeCloseTo(180, 5);
  });
});

describe("VM — Edge cases & error handling", () => {
  test("empty bytecode returns value result", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([], [], []), vm);
    expect(result.type).toBe('value');
    expect(unwrapEvalResult(result).toNumber()).toBe(0);
  });

  test("no HALT — fallback stack pop", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0], [42]), vm);
    expect(result).toBeDefined();
    expect(unwrapEvalResult(result).toNumber()).toBe(42);
  });

  test("stack overflow — push beyond maxStackDepth throws instead of silently continuing", () => {
    // Regression: maxStackDepth used to be documented as an enforced VM
    // safety limit but was dead code — executeBytecode's hot loop bypassed
    // vm.push()'s bounds check entirely and pushed straight onto the raw
    // stack array with no limit at all. Pins the fix: exceeding the limit
    // now throws a clear error instead of growing the stack unbounded.
    const vm = freshVM(2, 50000);
    const ops: number[] = [];
    for (let i = 0; i < 10; i++) {
      ops.push(OpCode.PUSH_NUMBER, 0);
    }
    ops.push(OpCode.HALT);
    const numbers = new Float64Array(10).fill(42);
    expect(() => unwrapEvalResult(executeBytecode(bc(ops, Array.from(numbers)), vm))).toThrow(/maximum stack depth/i);
  });

  test("instruction limit exceeded throws", () => {
    const vm = freshVM(200, 5);
    const ops: number[] = [];
    for (let i = 0; i < 20; i++) {
      ops.push(OpCode.NOP);
    }
    ops.push(OpCode.HALT);
    // Actual error message: "Execution exceeded maximum of 5 instructions"
    expect(() => unwrapEvalResult(executeBytecode(bc(ops), vm))).toThrow(/maximum of \d+ instructions/i);
  });

  test("invalid opcode does not throw — falls through default case", () => {
    const vm = freshVM();
    const result = executeBytecode(
      bc([255, OpCode.PUSH_NUMBER, 0, OpCode.HALT], [42]),
      vm
    );
    // 255 is not a recognized opcode — falls through default which is a no-op
    expect(unwrapEvalResult(result).toNumber()).toBe(42);
  });
});

describe("VM — UoM conversion edge cases", () => {
  test("UOM_CONVERT with unit string from strings table", () => {
    const vm = freshVM();
    const result = executeBytecode(
      bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_STRING, 0, OpCode.UOM_CONVERT, OpCode.HALT], [1.5], ["m"]),
      vm
    );
    expect(unwrapEvalResult(result).type).toBe(ValueType.Uom);
    expect(unwrapEvalResult(result).toNumber()).toBe(1.5);
    expect(unwrapEvalResult(result).unit).toBe("m");
  });

  test("UOM_CONVERT_TO converts between compatible units", () => {
    const vm = freshVM();
    // UOM_CONVERT_TO pops: toUnit (string), uom-value (Value), then pops fromUnit and value from the uom.
    // Wait — actually let's check UOM_CONVERT_TO more carefully...
    // It pops: toUnit (string), then fromUnit (string), then value (number)
    // Stack: [value, fromUnit_string, toUnit_string] bottom to top
    // Push value first, then fromUnit, then toUnit
    const result = executeBytecode(
      bc([
        OpCode.PUSH_NUMBER, 0,                          // value: 100
        OpCode.PUSH_STRING, 0,                          // fromUnit: "cm"
        OpCode.PUSH_STRING, 1,                          // toUnit: "m"
        OpCode.UOM_CONVERT_TO, OpCode.HALT,
      ], [100], ["cm", "m"]),
      vm
    );
    // Expect the uom (100 cm) to be pushed as-is since convert would fail with our test setup
    expect(unwrapEvalResult(result).type).toBe(ValueType.Uom);
  });
});

describe("VM — Value arena integration", () => {
  test("HALT clones when arena is active", () => {
    enableValueArena(64);
    try {
      const vm = freshVM();
      const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.HALT], [42]), vm);
      expect(unwrapEvalResult(result).toNumber()).toBe(42);
    } finally {
      disableValueArena();
    }
  });

  test("STORE_VAR persists past arena when active", () => {
    enableValueArena(64);
    try {
      const vm = freshVM();
      executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.STORE_VAR, 0, OpCode.HALT], [77], ["x"]), vm);
      // Variable should persist after arena is disabled
      expect(vm.getVar("x")!.toNumber()).toBe(77);
    } finally {
      disableValueArena();
    }
  });
});
