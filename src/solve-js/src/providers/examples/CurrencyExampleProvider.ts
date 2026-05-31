import { solve } from "@solve-js/api/SolveAPI";
import { Value, ValueType } from "@solve-js/vm/Value";

export function registerCurrencyPlugin(): void {
  const CURRENCY_LOOKUP = solve.allocateOpcode();

  solve.registerOpcodeHandler({
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
