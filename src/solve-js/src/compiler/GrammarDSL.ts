import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { PrefixParselet, InfixParselet } from "@solve-js/parser/Parselet";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";

/**
 * Grammar DSL — a fluent API for defining token-to-opcode mappings and
 * parselet handlers without manually constructing PrefixParselet/InfixParselet objects.
 *
 * Reduces boilerplate for simple arithmetic-style operators by auto-generating
 * the parselet boilerplate (category, parse function, binding power) from a
 * token type + opcode pair.
 */
export class GrammarDSL {
  private registry: ParseletRegistry;
  private tokenToOp: Record<string, OpCode>;

  constructor(registry: ParseletRegistry) {
    this.registry = registry;
    this.tokenToOp = {
      PLUS: OpCode.ADD,
      MINUS: OpCode.SUB,
      STAR: OpCode.MUL,
      SLASH: OpCode.DIV,
      CARET: OpCode.EXP,
      MOD: OpCode.MOD,
      LSHIFT: OpCode.LSHIFT,
      RSHIFT: OpCode.RSHIFT,
    };
  }

  /**
   * Map a token type to its corresponding opcode.
   * Used by {@link defineInfix} to auto-select the opcode if none is provided.
   *
   * @param tokenType - Token type string (e.g., "PLUS", "STAR")
   * @param opCode - The OpCode to emit for this token type
   */
  registerTokenOp(tokenType: string, opCode: OpCode): void {
    this.tokenToOp[tokenType] = opCode;
  }

  /**
   * Define an infix operator with a given binding power.
   *
   * Creates and registers an InfixParselet that:
   * 1. Emits a PUSH_NUMBER(0) + NOP (safety no-op for stack alignment)
   * 2. Calls parseExpression with the given binding power for right operand
   * 3. Emits the mapped opcode
   *
   * @param tokenType - Token type for this operator
   * @param bindingPower - Precedence (higher = tighter binding)
   * @param opCode - Optional explicit OpCode; if omitted, derived from tokenToOp mapping
   */
  defineInfix(tokenType: string, bindingPower: number, opCode?: OpCode): void {
    const op = opCode || this.tokenToOp[tokenType];
    if (op === undefined) return;

this.registry.registerInfix(tokenType, {
       category: "GrammarDSL",
       parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
         builder.emitOpcode(OpCode.PUSH_NUMBER);
         builder.emitNumber(0);
         builder.emitOpcode(OpCode.NOP);

         parser.parseExpression(bindingPower);
         builder.emitOpcode(op);
       },
       bindingPower,
     });
  }

  /**
   * Define a prefix parselet from a rule string and handler function.
   *
   * @param ruleString - Grammar rule description (for documentation only)
   * @param handler - Function that emits bytecode for this prefix pattern
   * @param tokenType - Token type that triggers this prefix parselet
   */
  definePrefixFromRule(ruleString: string, handler: (builder: BytecodeBuilder, tokens: Token[], parser: Parser) => void, tokenType: string): void {
this.registry.registerPrefix(tokenType, {
       category: "GrammarDSL",
       parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
         handler(builder, [token], parser);
       },
     });
  }

  /**
   * Define an infix parselet from a rule string and handler function.
   *
   * @param ruleString - Grammar rule description (for documentation only)
   * @param bindingPower - Precedence level for this operator
   * @param handler - Function that emits bytecode for left + operator + right
   * @param tokenType - Token type that triggers this infix parselet
   */
  defineInfixFromRule(ruleString: string, bindingPower: number, handler: (builder: BytecodeBuilder, left: Token, right: Token, parser: Parser) => void, tokenType: string): void {
this.registry.registerInfix(tokenType, {
       category: "GrammarDSL",
       parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
         handler(builder, left, token, parser);
       },
       bindingPower,
     });
  }
}

/**
 * A grammar rule definition for the DSL compiler.
 */
export interface GrammarRule {
  /** Token sequence pattern (e.g., ["NUMBER", "PLUS", "NUMBER"]). */
  pattern: string[];
  /** Precedence level (optional, defaults to 0). */
  precedence?: number;
  /** Name of the handler function to emit. */
  handler: string;
}

/**
 * Compile a grammar rule into prefix/infix parselets.
 * Reserved for future declarative grammar support.
 */
export function compileRule(rule: GrammarRule): { prefix?: PrefixParselet; infix?: InfixParselet } {
  return {};
}

/**
 * Create a GrammarDSL instance bound to the given ParseletRegistry.
 * Convenience factory — equivalent to `new GrammarDSL(registry)`.
 */
export function createGrammarDSL(registry: ParseletRegistry): GrammarDSL {
  return new GrammarDSL(registry);
}
