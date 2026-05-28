import { InfixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";

export class VectorAddParselet implements InfixParselet {
	readonly category = "Vector";
	readonly bindingPower = BindingPower.Sum;

  parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(this.bindingPower, builder);
    builder.emitOpcode(OpCode.VEC_ADD);
  }
}

export class VectorSubParselet implements InfixParselet {
	readonly category = "Vector";
	readonly bindingPower = BindingPower.Sum;

  parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(this.bindingPower, builder);
    builder.emitOpcode(OpCode.VEC_SUB);
  }
}

export class VectorDotParselet implements InfixParselet {
	readonly category = "Vector";
	readonly bindingPower = BindingPower.Product;

  parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(this.bindingPower, builder);
    builder.emitOpcode(OpCode.VEC_DOT);
  }
}
