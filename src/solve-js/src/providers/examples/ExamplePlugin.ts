import { solve } from "@solve-js/api/SolveAPI";
import { Value, ValueType } from "@solve-js/vm/Value";

export function registerExamplePlugin(): void {
  const EXAMPLE_OPCODE = solve.allocateOpcode();

  solve.registerOpcodeHandler({
    opcode: EXAMPLE_OPCODE,
    pluginName: "example-hello",
    handler: (vm, opcodes, ip, numbers, strings) => {
      vm.push(new Value(ValueType.String, `hello plugin`));
      return ip;
    },
  });
}
