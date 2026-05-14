import { solveAPI } from "@/engine/api/SolveAPI";
import { OpCode } from "@/engine/parser/OpCode";
import { Value, ValueType } from "@/engine/vm/Value";

export function registerExamplePlugin(): void {
  const EXAMPLE_OPCODE = OpCode.PLUGIN_CUSTOM;

  solveAPI.registerOpcodeHandler({
    opcode: EXAMPLE_OPCODE,
    pluginName: "example-hello",
    handler: (vm, opcodes, ip, numbers, strings) => {
      vm.push(new Value(ValueType.String, `hello plugin`));
      return ip;
    },
  });
}