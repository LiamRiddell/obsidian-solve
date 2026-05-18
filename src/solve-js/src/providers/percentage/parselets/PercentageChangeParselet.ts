import { InfixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";

export class PercentageChangeParselet implements InfixParselet {
	readonly category = "Percentage";
	getBindingPower(): number {
    return BindingPower.Conditional;
  }

  parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
    // Check if the left operand is a UNIT token
    // If so, this is a UoM conversion, not a percentage change
    if (left.type === "UNIT") {
      // This is a UoM conversion, not a percentage change
      // Don't parse the right operand as a percentage change
      // Instead, let the UoM parselet handle it
      return;
    }
    
    // Parse the right operand (target value)
    parser.parseExpression(this.getBindingPower(), builder);
    
    // Calculate percentage change: right / left - 1
    // Stack before: [left, right]
    // After SWAP: [right, left]
    builder.emitOpcode(OpCode.SWAP);
    // After DIV: [right / left]
    builder.emitOpcode(OpCode.DIV);
    // After PUSH_NUMBER 1: [right / left, 1]
    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(1);
    // After SUB: [right / left - 1]
    builder.emitOpcode(OpCode.SUB);
    // Convert to percentage type
    builder.emitOpcode(OpCode.TO_PERCENTAGE);
  }
}
