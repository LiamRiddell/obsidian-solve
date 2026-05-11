import { ParseletRegistry, sharedParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { PrefixParselet, InfixParselet } from "@/engine/parser/Parselet";
import { OpRegistry, sharedOpRegistry, IOpcodeHandlerRegistration } from "@/engine/vm/OpRegistry";
import { OpCode } from "@/engine/parser/OpCode";
import { Value } from "@/engine/vm/Value";
import { IVariableSource } from "@/engine/variables/IVariableSource";
import { sharedVariableResolver } from "@/engine/variables/VariableResolver";

export interface ISolveAPI {
  registerPrefixParselet(tokenType: string, parselet: PrefixParselet): void;
  registerInfixParselet(tokenType: string, parselet: InfixParselet): void;
  registerOpcodeHandler(registration: IOpcodeHandlerRegistration): void;
  registerVariableSource(source: IVariableSource): void;
  getOpCode(): typeof OpCode;
  Value: typeof Value;
}

export class SolveAPI implements ISolveAPI {
  Value = Value;

  registerPrefixParselet(tokenType: string, parselet: PrefixParselet): void {
    sharedParseletRegistry.registerPrefix(tokenType, parselet);
  }

  registerInfixParselet(tokenType: string, parselet: InfixParselet): void {
    sharedParseletRegistry.registerInfix(tokenType, parselet);
  }

  registerOpcodeHandler(registration: IOpcodeHandlerRegistration): void {
    sharedOpRegistry.register(registration);
  }

  registerVariableSource(source: IVariableSource): void {
    sharedVariableResolver.registerSource(source);
  }

  getOpCode(): typeof OpCode {
    return OpCode;
  }
}

export const solveAPI = new SolveAPI();
