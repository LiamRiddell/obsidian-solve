import { sharedParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { PrefixParselet, InfixParselet } from "@solve-js/parser/Parselet";
import { sharedOpRegistry, IOpcodeHandlerRegistration } from "@solve-js/vm/OpRegistry";
import { OpCode } from "@solve-js/parser/OpCode";
import { Value } from "@solve-js/vm/Value";
import { IVariableSource } from "@solve-js/variables/IVariableSource";
import { sharedVariableResolver } from "@solve-js/variables/VariableResolver";
import { sharedLexer } from "@solve-js/lexer/Lexer";
import type { LexerPlugin } from "@solve-js/lexer/ExpressionLexer";
import type { IAsyncResolver } from "@solve-js/resolvers/ResolverRegistry";

export interface ISolve {
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
  lexerPlugin?: LexerPlugin;
  prefixParselets?: Array<{ tokenType: string; parselet: PrefixParselet }>;
  infixParselets?: Array<{ tokenType: string; parselet: InfixParselet }>;
  opcodeHandlers?: IOpcodeHandlerRegistration[];
  variableSources?: IVariableSource[];
  /**
   * Async resolver for this package's domain.
   * When set, the ExpressionEngine runs preflight() before VM execution.
   * If async data is needed, a Pending result is returned immediately
   * and the line re-evaluates when the data resolves.
   */
  asyncResolver?: IAsyncResolver;
}

export class Solve implements ISolve {
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
    if (pkg.lexerPlugin) {
      sharedLexer.registerPlugin(pkg.lexerPlugin);
    }
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

export const solve = new Solve();
