import { solve } from "@solve-js/api/SolveAPI";
import { OpCode } from "@solve-js/parser/OpCode";
import { Value, ValueType } from "@solve-js/vm/Value";

export function registerExamplePlugin(): void {
  const EXAMPLE_OPCODE = OpCode.PLUGIN_CUSTOM;

  solve.registerOpcodeHandler({
    opcode: EXAMPLE_OPCODE,
    pluginName: "example-hello",
    handler: (vm, opcodes, ip, numbers, strings) => {
      vm.push(new Value(ValueType.String, `hello plugin`));
      return ip;
    },
  });
}
