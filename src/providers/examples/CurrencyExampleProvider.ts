import { solveAPI } from "@/engine/api/SolveAPI";
import { OpCode } from "@/engine/parser/OpCode";
import { Value, ValueType } from "@/engine/vm/Value";

export function registerCurrencyPlugin(): void {
  const CURRENCY_LOOKUP = OpCode.PLUGIN_CUSTOM;

  solveAPI.registerOpcodeHandler({
    opcode: CURRENCY_LOOKUP,
    pluginName: "currency",
    handler: (vm, opcodes, ip, numbers, strings) => {
      const amount = vm.popNumber();
      const toCurrency = strings[opcodes[ip++]];
      vm.push(new Value(ValueType.String, `${amount} ${toCurrency}`));
      return ip;
    },
  });
}
