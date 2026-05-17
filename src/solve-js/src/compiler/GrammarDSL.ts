import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { PrefixParselet, InfixParselet } from "@solve-js/parser/Parselet";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";

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

  registerTokenOp(tokenType: string, opCode: OpCode): void {
    this.tokenToOp[tokenType] = opCode;
  }

defineInfix(tokenType: string, bindingPower: number, opCode?: OpCode): void {
    const op = opCode || this.tokenToOp[tokenType];
    if (op === undefined) return;

    this.registry.registerInfix(tokenType, {
      parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
        builder.emitOpcode(OpCode.PUSH_NUMBER);
        builder.emitNumber(0);
        builder.emitOpcode(OpCode.NOP);

        parser.parseExpression(bindingPower);
        builder.emitOpcode(op);
      },
      getBindingPower(): number { return bindingPower; },
    });
  }

  definePrefixFromRule(ruleString: string, handler: (builder: BytecodeBuilder, tokens: Token[], parser: Parser) => void, tokenType: string): void {
    this.registry.registerPrefix(tokenType, {
      parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
        handler(builder, [token], parser);
      },
    });
  }

  defineInfixFromRule(ruleString: string, bindingPower: number, handler: (builder: BytecodeBuilder, left: Token, right: Token, parser: Parser) => void, tokenType: string): void {
    this.registry.registerInfix(tokenType, {
      parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
        handler(builder, left, token, parser);
      },
      getBindingPower(): number { return bindingPower; },
    });
  }
}

export interface GrammarRule {
  pattern: string[];
  precedence?: number;
  handler: string;
}

export function compileRule(rule: GrammarRule): { prefix?: PrefixParselet; infix?: InfixParselet } {
  return {};
}

export function createGrammarDSL(registry: ParseletRegistry): GrammarDSL {
  return new GrammarDSL(registry);
}
