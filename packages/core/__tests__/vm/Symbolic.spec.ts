/**
 * vm/Symbolic.ts — the bounded symbolic simplifier/formatter (pure
 * function tests), plus VM-level tests exercising `executeBytecode()`'s
 * `symbolicTolerant` flag directly (matching VMOpcodes.spec.ts's own
 * hand-built-bytecode convention) since there is no user-facing parser
 * surface for symbolic values until Phase H.2's `=>` operator lands.
 */
import { describe, expect, test } from "@jest/globals";
import { simplifySymbolic, formatSymbolic, constNode, varNode, type SymbolicNode } from "@solve-js/vm/Symbolic";
import { createVM, executeBytecode, unwrapEvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { OpCode } from "@solve-js/parser/OpCode";
import { ValueType, numberValue } from "@solve-js/vm/Value";
import type { VM } from "@solve-js/vm/OpRegistry";

function add(left: SymbolicNode, right: SymbolicNode): SymbolicNode { return { kind: "add", left, right }; }
function sub(left: SymbolicNode, right: SymbolicNode): SymbolicNode { return { kind: "sub", left, right }; }
function mul(left: SymbolicNode, right: SymbolicNode): SymbolicNode { return { kind: "mul", left, right }; }
function div(left: SymbolicNode, right: SymbolicNode): SymbolicNode { return { kind: "div", left, right }; }
function neg(operand: SymbolicNode): SymbolicNode { return { kind: "neg", operand }; }

describe("simplifySymbolic — constant folding", () => {
  test("const+const folds to a single const", () => {
    expect(simplifySymbolic(add(constNode(2), constNode(3)))).toEqual(constNode(5));
  });
  test("const-const folds", () => {
    expect(simplifySymbolic(sub(constNode(5), constNode(3)))).toEqual(constNode(2));
  });
  test("const*const folds", () => {
    expect(simplifySymbolic(mul(constNode(4), constNode(5)))).toEqual(constNode(20));
  });
  test("const/const folds", () => {
    expect(simplifySymbolic(div(constNode(10), constNode(4)))).toEqual(constNode(2.5));
  });
});

describe("simplifySymbolic — identities", () => {
  test("x+0 -> x", () => {
    expect(simplifySymbolic(add(varNode("x"), constNode(0)))).toEqual(varNode("x"));
  });
  test("0+x -> x", () => {
    expect(simplifySymbolic(add(constNode(0), varNode("x")))).toEqual(varNode("x"));
  });
  test("x-0 -> x", () => {
    expect(simplifySymbolic(sub(varNode("x"), constNode(0)))).toEqual(varNode("x"));
  });
  test("0-x -> -x", () => {
    expect(simplifySymbolic(sub(constNode(0), varNode("x")))).toEqual(neg(varNode("x")));
  });
  test("x*1 -> x, 1*x -> x", () => {
    expect(simplifySymbolic(mul(varNode("x"), constNode(1)))).toEqual(varNode("x"));
    expect(simplifySymbolic(mul(constNode(1), varNode("x")))).toEqual(varNode("x"));
  });
  test("x*0 -> 0, 0*x -> 0", () => {
    expect(simplifySymbolic(mul(varNode("x"), constNode(0)))).toEqual(constNode(0));
    expect(simplifySymbolic(mul(constNode(0), varNode("x")))).toEqual(constNode(0));
  });
  test("x*-1 -> -x", () => {
    expect(simplifySymbolic(mul(varNode("x"), constNode(-1)))).toEqual(neg(varNode("x")));
  });
  test("x/1 -> x", () => {
    expect(simplifySymbolic(div(varNode("x"), constNode(1)))).toEqual(varNode("x"));
  });
  test("--x -> x", () => {
    expect(simplifySymbolic(neg(neg(varNode("x"))))).toEqual(varNode("x"));
  });
});

describe("simplifySymbolic — flatten-and-collect top-level sums", () => {
  test("1+2+b+3+b collects to 2b+6 (left-assoc chain, matching how a parser would build it)", () => {
    // ((((1+2)+b)+3)+b)
    const tree = add(add(add(add(constNode(1), constNode(2)), varNode("b")), constNode(3)), varNode("b"));
    const simplified = simplifySymbolic(tree);
    expect(formatSymbolic(simplified)).toBe("2b+6");
  });

  test("x-x cancels to 0 (structural, no numeric value needed for x)", () => {
    expect(simplifySymbolic(sub(varNode("x"), varNode("x")))).toEqual(constNode(0));
  });

  test("x+x collects to 2x", () => {
    expect(formatSymbolic(simplifySymbolic(add(varNode("x"), varNode("x"))))).toBe("2x");
  });

  test("does NOT collect terms inside a product (explicitly out of scope)", () => {
    // 2*b + 3*b should NOT become 5b — collecting through mul is deferred.
    const tree = add(mul(constNode(2), varNode("b")), mul(constNode(3), varNode("b")));
    const simplified = simplifySymbolic(tree);
    expect(formatSymbolic(simplified)).toBe("2b+3b");
  });
});

describe("formatSymbolic — display", () => {
  test("a plain constant", () => {
    expect(formatSymbolic(constNode(5))).toBe("5");
  });
  test("a plain variable", () => {
    expect(formatSymbolic(varNode("x"))).toBe("x");
  });
  test("coefficient*variable renders with no space or asterisk", () => {
    expect(formatSymbolic(mul(constNode(2), varNode("b")))).toBe("2b");
    expect(formatSymbolic(mul(varNode("b"), constNode(2)))).toBe("2b");
  });
  test("negation renders with a leading minus, no space", () => {
    expect(formatSymbolic(neg(varNode("x")))).toBe("-x");
  });
  test("subtraction renders as 'x-3', not 'x+-3'", () => {
    expect(formatSymbolic(sub(varNode("x"), constNode(3)))).toBe("x-3");
  });
  test("a nested sum inside a product is parenthesized", () => {
    const tree = mul(add(varNode("x"), constNode(1)), varNode("y"));
    expect(formatSymbolic(tree)).toBe("(x+1)*y");
  });
});

// ── VM-level: symbolic-tolerant executeBytecode() ──────────────────────────

function bc(ops: number[], numbers: number[] = [], strings: string[] = []) {
  return { opcodes: new Uint8Array(ops), numbers: new Float64Array(numbers), strings };
}

function freshVM(): VM {
  return createVM(sharedOpRegistry, 200, 50000);
}

describe("executeBytecode — symbolicTolerant mode", () => {
  test("default (false): an undefined variable still hard-throws UNDEFINED_VARIABLE, completely unchanged", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.LOAD_VAR, 0, OpCode.HALT], [], ["b"]), vm);
    expect(result.type).toBe("error");
  });

  test("true: an undefined variable pushes a Symbolic placeholder instead of throwing", () => {
    const vm = freshVM();
    const result = executeBytecode(bc([OpCode.LOAD_VAR, 0, OpCode.HALT], [], ["b"]), vm, undefined, undefined, undefined, true);
    const value = unwrapEvalResult(result);
    expect(value.type).toBe(ValueType.Symbolic);
    expect(formatSymbolic(value.value as SymbolicNode)).toBe("b");
  });

  test("1+2+b+3+b, evaluated via real bytecode with symbolicTolerant=true, produces 2b+6", () => {
    const vm = freshVM();
    // ((((1+2)+b)+3)+b) -- left-associative chain, matching real parser output.
    const result = executeBytecode(
      bc(
        [
          OpCode.PUSH_NUMBER, 0, // 1
          OpCode.PUSH_NUMBER, 1, // 2
          OpCode.ADD,
          OpCode.LOAD_VAR, 0,    // b
          OpCode.ADD,
          OpCode.PUSH_NUMBER, 2, // 3
          OpCode.ADD,
          OpCode.LOAD_VAR, 0,    // b
          OpCode.ADD,
          OpCode.HALT,
        ],
        [1, 2, 3],
        ["b"],
      ),
      vm,
      undefined, undefined, undefined,
      true,
    );
    const value = unwrapEvalResult(result);
    expect(value.type).toBe(ValueType.Symbolic);
    expect(formatSymbolic(value.value as SymbolicNode)).toBe("2b+6");
  });

  test("a symbolic value combined with SUB/MUL/DIV all dispatch correctly", () => {
    const vm = freshVM();
    // b*3 - 1  =>  should NOT collect (3*b isn't a bare var term already
    // collected the same way) but should still simplify to a clean form.
    const result = executeBytecode(
      bc(
        [
          OpCode.LOAD_VAR, 0,     // b
          OpCode.PUSH_NUMBER, 0,  // 3
          OpCode.MUL,
          OpCode.PUSH_NUMBER, 1,  // 1
          OpCode.SUB,
          OpCode.HALT,
        ],
        [3, 1],
        ["b"],
      ),
      vm,
      undefined, undefined, undefined,
      true,
    );
    const value = unwrapEvalResult(result);
    expect(value.type).toBe(ValueType.Symbolic);
    expect(formatSymbolic(value.value as SymbolicNode)).toBe("3b-1");
  });

  test("a fully-defined variable (present in vm) is read normally even in tolerant mode — no symbolic leakage for known variables", () => {
    const vm = freshVM();
    vm.setVar("x", numberValue(10));
    const result = executeBytecode(
      bc([OpCode.LOAD_VAR, 0, OpCode.PUSH_NUMBER, 0, OpCode.ADD, OpCode.HALT], [5], ["x"]),
      vm,
      undefined, undefined, undefined,
      true,
    );
    const value = unwrapEvalResult(result);
    expect(value.type).toBe(ValueType.Number);
    expect(value.toNumber()).toBe(15);
  });
});
