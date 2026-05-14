import { sharedParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { PrefixParselet, InfixParselet } from "@/engine/parser/Parselet";
import { sharedOpRegistry, IOpcodeHandlerRegistration } from "@/engine/vm/OpRegistry";
import { OpCode } from "@/engine/parser/OpCode";
import { Value } from "@/engine/vm/Value";
import { IVariableSource } from "@/engine/variables/IVariableSource";
import { sharedVariableResolver } from "@/engine/variables/VariableResolver";

export interface ISolveAPI {
  registerPrefixParselet(tokenType: string, parselet: PrefixParselet): void;
  registerInfixParselet(tokenType: string, parselet: InfixParselet): void;
  registerOpcodeHandler(registration: IOpcodeHandlerRegistration): void;
  registerVariableSource(source: IVariableSource): void;
  registerPackage(pkg: ISolvePackage): void;
  getOpCode(): typeof OpCode;
  Value: typeof Value;
}

export interface ISolvePackage {
  name: string;
  prefixParselets?: Array<{ tokenType: string; parselet: PrefixParselet }>;
  infixParselets?: Array<{ tokenType: string; parselet: InfixParselet }>;
  opcodeHandlers?: IOpcodeHandlerRegistration[];
  variableSources?: IVariableSource[];
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

  registerPackage(pkg: ISolvePackage): void {
    if (pkg.prefixParselets) {
      for (const pp of pkg.prefixParselets) {
        this.registerPrefixParselet(pp.tokenType, pp.parselet);
      }
    }
    if (pkg.infixParselets) {
      for (const ip of pkg.infixParselets) {
        this.registerInfixParselet(ip.tokenType, ip.parselet);
      }
    }
    if (pkg.opcodeHandlers) {
      for (const oh of pkg.opcodeHandlers) {
        this.registerOpcodeHandler(oh);
      }
    }
    if (pkg.variableSources) {
      for (const vs of pkg.variableSources) {
        this.registerVariableSource(vs);
      }
    }
  }

  getOpCode(): typeof OpCode {
    return OpCode;
  }
}

export const solveAPI = new SolveAPI();
