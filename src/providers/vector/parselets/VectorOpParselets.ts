import { InfixParselet } from "@/engine/parser/Parselet";
import { Parser } from "@/engine/parser/Parser";
import { Token } from "@/engine/lexer/Token";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { OpCode } from "@/engine/parser/OpCode";
import { BindingPower } from "@/engine/parser/BindingPower";

export class VectorAddParselet implements InfixParselet {
  getBindingPower(): number {
    return BindingPower.Sum;
  }

  parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(this.getBindingPower(), builder);
    builder.emitOpcode(OpCode.VEC_ADD);
  }
}

export class VectorSubParselet implements InfixParselet {
  getBindingPower(): number {
    return BindingPower.Sum;
  }

  parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(this.getBindingPower(), builder);
    builder.emitOpcode(OpCode.VEC_SUB);
  }
}

export class VectorDotParselet implements InfixParselet {
  getBindingPower(): number {
    return BindingPower.Product;
  }

  parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(this.getBindingPower(), builder);
    builder.emitOpcode(OpCode.VEC_DOT);
  }
}