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
import type { NormalizerRule } from "@solve-js/normalizer/NormalizerRule";

/**
 * Public API for registering plugins with the solve-js engine.
 *
 * All registration goes through this interface — parselets, opcode handlers,
 * variable sources, and full packages. The default implementation is
 * {@link Solve} (singleton via {@link solve}).
 *
 * @example
 * ```typescript
 * import { solve } from "@solve-js";
 * solve.registerPackage(myCustomPackage);
 * ```
 */
export interface ISolve {
  /** Register a prefix parselet (e.g., `GE`, `NOW`, `floor`). */
  registerPrefixParselet(tokenType: string, parselet: PrefixParselet): void;
  /** Register an infix parselet (e.g., `+`, `in`, `to`). */
  registerInfixParselet(tokenType: string, parselet: InfixParselet): void;
  /** Register a bytecode handler for a specific opcode. */
  registerOpcodeHandler(registration: IOpcodeHandlerRegistration): void;
  /** Allocate a unique opcode for plugin custom bytecode. See {@link OpRegistry.allocateOpcode}. */
  allocateOpcode(): OpCode;
  /** Register a variable source (provides variable values at runtime). */
  registerVariableSource(source: IVariableSource): void;
  /** Register a complete package (parselets + opcode handlers + variable sources). */
  registerPackage(pkg: ISolvePackage): void;
  /** Get the OpCode enum for emitting plugin bytecode. */
  getOpCode(): typeof OpCode;
  /** Convenience reference to the Value class for creating typed values. */
  Value: typeof Value;
}

/**
 * Package descriptor for registering a complete provider with the engine.
 *
 * A package bundles all the pieces needed for a domain-specific provider:
 * lexer plugins for custom token recognition, parselets for Pratt parsing,
 * opcode handlers for VM bytecode, variable sources, and an optional async
 * resolver for data that loads asynchronously (e.g., exchange rates, game prices).
 *
 * @example
 * ```typescript
 * const myPackage: ISolvePackage = {
 *   name: "MyProvider",
 *   lexerPlugin: myLexerPlugin,
 *   prefixParselets: [{ tokenType: "MY_FUNC", parselet: new MyParselet() }],
 *   opcodeHandlers: [{ opcode: MY_OPCODE, handler: myHandler, pluginName: "MyProvider" }],
 *   asyncResolver: myAsyncResolver,
 * };
 * solve.registerPackage(myPackage);
 * ```
 */
export interface ISolvePackage {
  /** Human-readable name for debugging and error attribution. */
  name: string;
  /** Optional lexer plugin for recognizing custom tokens (e.g., `GE`, `£`). */
  lexerPlugin?: LexerPlugin;
  /** Prefix parselets for this package's custom functions/operators. */
  prefixParselets?: Array<{ tokenType: string; parselet: PrefixParselet }>;
  /** Infix parselets for this package's custom binary operators. */
  infixParselets?: Array<{ tokenType: string; parselet: InfixParselet }>;
  /** VM opcode handlers for custom bytecode emitted by this package's parselets. */
  opcodeHandlers?: IOpcodeHandlerRegistration[];
  /** Variable sources that provide values at runtime. */
  variableSources?: IVariableSource[];
  /**
   * Async resolver for this package's domain.
   * When set, the ExpressionEngine runs preflight() before VM execution.
   * If async data is needed, a Pending result is returned immediately
   * and the line re-evaluates when the data resolves.
   */
  asyncResolver?: IAsyncResolver;
  /**
   * Normalizer rules for post-lexer token fusion.
   * Applied by the TokenNormalizer between lexing and parsing.
   * Used for multi-word phrase matching (e.g., "to the power of" → CARET),
   * domain-specific token fusion (e.g., item name merging), and implicit
   * operator insertion.
   */
  normalizerRules?: NormalizerRule[];
}

/**
 * Default implementation of {@link ISolve} — the plugin registration API.
 *
 * All registrations delegate to shared singletons (parselet registry, opcode
 * registry, variable resolver, lexer). This ensures that packages registered
 * through any Solve instance are visible engine-wide.
 *
 * @example
 * ```typescript
 * import { solve } from "@solve-js";
 *
 * // Register a complete provider package
 * solve.registerPackage({
 *   name: "MyProvider",
 *   prefixParselets: [{ tokenType: "MY_FUNC", parselet: new MyParselet() }],
 * });
 *
 * // Or register individual pieces
 * const myOpcode = solve.allocateOpcode();
 * solve.registerOpcodeHandler({ opcode: myOpcode, handler: myHandler, pluginName: "MyProvider" });
 * ```
 */
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

  allocateOpcode(): OpCode {
    return sharedOpRegistry.allocateOpcode();
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

/**
 * Singleton Solve instance — the default plugin registration API.
 *
 * All packages should register through this instance. The underlying registries
 * are shared singletons, so multiple Solve instances would be redundant.
 */
export const solve = new Solve();
