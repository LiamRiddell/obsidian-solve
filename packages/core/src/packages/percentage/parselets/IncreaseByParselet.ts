import { InfixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";

export class IncreaseByParselet implements InfixParselet {
	readonly category = "Percentage";
	readonly bindingPower = BindingPower.Conditional;

	constructor(private readonly multiplier: number) {}

  parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
    // left operand (e.g., 100) is already on the VM stack.
    // Parse the right expression (e.g., "20%" via PercentParselet -> 0.2).
    parser.parseExpression(this.bindingPower, builder);

    // Bytecode: compute left * (1 + right) for increase, left * (1 - right) for decrease.
    // Stack: [left, right] -> PUSH 1 -> [left, right, 1] -> SWAP -> [left, 1, right]
    // -> ADD/SUB -> [left, 1±right] -> MUL -> [left * (1±right)]
    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(1);
    builder.emitOpcode(OpCode.SWAP);
    builder.emitOpcode(this.multiplier > 0 ? OpCode.ADD : OpCode.SUB);
    builder.emitOpcode(OpCode.MUL);
  }
}
