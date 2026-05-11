import { describe, expect, test } from "@jest/globals";
import { solveAPI, SolveAPI } from "@/engine/api/SolveAPI";
import { OpCode } from "@/engine/parser/OpCode";
import { Value, numberValue } from "@/engine/vm/Value";
import { sharedOpRegistry, type VM } from "@/engine/vm/OpRegistry";
import { sharedVariableResolver } from "@/engine/variables/VariableResolver";
import { IVariableSource } from "@/engine/variables/IVariableSource";

describe("SolveAPI", () => {
  test("solveAPI is a singleton", () => {
    expect(solveAPI).toBeDefined();
    expect(solveAPI).toBeInstanceOf(SolveAPI);
  });

  test("getOpCode returns OpCode enum", () => {
    expect(solveAPI.getOpCode()).toBe(OpCode);
    expect(OpCode.HALT).toBe(1);
    expect(OpCode.ADD).toBe(20);
  });

  test("Value is accessible via solveAPI.Value", () => {
    expect(solveAPI.Value).toBe(Value);
    const v = new solveAPI.Value("number", 42);
    expect(v.toNumber()).toBe(42);
  });

  test("registerOpcodeHandler registers to shared registry", () => {
    const TEST_OP = 200 as OpCode;
    solveAPI.registerOpcodeHandler({
      opcode: TEST_OP,
      pluginName: "test-handler",
      handler: (vm: VM) => {
        vm.push(numberValue(99));
        return 0;
      },
    });

    const handler = sharedOpRegistry.get(TEST_OP);
    expect(handler).toBeDefined();
  });
});
