import { describe, expect, test } from "@jest/globals";
import { ScopeManager } from "@solve-js/vm/ScopeManager";
import { Value, numberValue } from "@solve-js/vm/Value";

function makeRecord(lineNumber: number, value: Value) {
  return {
    lineNumber,
    expression: "test",
    bytecode: { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [] },
    lastResult: value,
    readVariables: [],
    writeVariable: null,
  };
}

describe("ScopeManager", () => {
  test("write and read variable", () => {
    const scope = new ScopeManager();
    scope.write("x", 10, makeRecord(10, numberValue(5)));
    const val = scope.read("x", 20);
    expect(val).toBeDefined();
    expect(val!.toNumber()).toBe(5);
  });

  test("read returns undefined for unknown variable", () => {
    const scope = new ScopeManager();
    expect(scope.read("unknown", 10)).toBeUndefined();
  });

  test("shadowing: line 50 defines x, line 100 redefines x", () => {
    const scope = new ScopeManager();
    scope.write("x", 50, makeRecord(50, numberValue(5)));
    scope.write("x", 100, makeRecord(100, numberValue(10)));
    const before = scope.read("x", 75);
    expect(before!.toNumber()).toBe(5);
    const after = scope.read("x", 125);
    expect(after!.toNumber()).toBe(10);
  });

  test("read at exact definition line returns correct value", () => {
    const scope = new ScopeManager();
    scope.write("x", 10, makeRecord(10, numberValue(42)));
    const val = scope.read("x", 10);
    expect(val!.toNumber()).toBe(42);
  });

  test("invalidateDownstream removes shadowed definitions", () => {
    const scope = new ScopeManager();
    scope.write("x", 10, makeRecord(10, numberValue(1)));
    scope.write("x", 20, makeRecord(20, numberValue(2)));
    scope.write("x", 30, makeRecord(30, numberValue(3)));
    scope.invalidateDownstream("x", 20);
    const afterInvalidate = scope.read("x", 40);
    expect(afterInvalidate!.toNumber()).toBe(2);
    const afterBeyond = scope.read("x", 100);
    expect(afterBeyond!.toNumber()).toBe(2);
  });

  test("invalidateDownstream on non-existent definition is no-op", () => {
    const scope = new ScopeManager();
    scope.write("x", 10, makeRecord(10, numberValue(1)));
    scope.invalidateDownstream("x", 999);
    const val = scope.read("x", 100);
    expect(val!.toNumber()).toBe(1);
  });

  test("invalidateDownstream on unknown variable is no-op", () => {
    const scope = new ScopeManager();
    scope.invalidateDownstream("unknown", 10);
  });

  test("clear resets all definitions", () => {
    const scope = new ScopeManager();
    scope.write("x", 10, makeRecord(10, numberValue(5)));
    scope.clear();
    expect(scope.read("x", 100)).toBeUndefined();
  });

  test("multiple variables tracked independently", () => {
    const scope = new ScopeManager();
    scope.write("x", 10, makeRecord(10, numberValue(1)));
    scope.write("y", 20, makeRecord(20, numberValue(2)));
    expect(scope.read("x", 30)!.toNumber()).toBe(1);
    expect(scope.read("y", 30)!.toNumber()).toBe(2);
  });
});
