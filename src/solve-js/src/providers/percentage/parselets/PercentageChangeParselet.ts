import { InfixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";
import { isKnownUnit } from "@solve-js/lexer/units";

export class PercentageChangeParselet implements InfixParselet {
	readonly category = "Percentage";
	readonly bindingPower = BindingPower.Conditional;

  parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
    // Check if the left operand is a UNIT token
    // If so, this is a UoM conversion, not a percentage change
    if (left.type === "UNIT") {
      // This is a UoM conversion, not a percentage change
      // Don't parse the right operand as a percentage change
      // Instead, let the UoM parselet handle it
      return;
    }

    // "TO" serves two grammars: percentage change (`800 to 1000`) and unit
    // conversion (`<uom-expr> to <unit>`). The `left.type === "UNIT"` guard
    // above only catches the literal-number-then-unit case (handled inline
    // by UomLiteralParselet before the Pratt loop ever reaches here) — it
    // misses a bare variable/expression on the left (`:total to USD`,
    // `:heightCm to m`), because a variable's runtime type (Uom or plain
    // Number) isn't knowable from its token type at parse time.
    //
    // What IS knowable at parse time is whether the RIGHT-hand token names
    // a real unit or ISO 4217 currency code — a percentage-change target is
    // always numeric, so if the word after "to" is a recognized unit name,
    // this must be a conversion, not a percentage change. Mirrors InParselet
    // (same UOM_CONVERT_IN opcode), which has no such ambiguity to resolve
    // because "in" has no percentage-change meaning.
    //
    // Target token type is usually UNIT or IDENT and gets verified against
    // isKnownUnit. "in" (inches) is a valid unit name that collides with
    // the IN keyword — it lexes as type IN, never UNIT/IDENT, and is
    // deliberately absent from knownUnits (see units.ts) because adding it
    // there confuses the lexer's keyword-vs-unit priority for the "in"
    // OPERATOR itself. UomLiteralParselet/ConvertParselet already special-
    // case token type IN by trusting its literal text unconditionally
    // ("3 ft in in"); do the same here so `:x to in` doesn't fall through
    // and try to parse the IN keyword as a percentage-change operand
    // (which has no prefix parselet and throws).
    const nextToken = parser.peek();
    if (
      nextToken &&
      (
        ((nextToken.type === "UNIT" || nextToken.type === "IDENT") && isKnownUnit(nextToken.value)) ||
        nextToken.type === "IN"
      )
    ) {
      parser.consume();
      builder.emitOpcode(OpCode.PUSH_STRING);
      builder.emitString(nextToken.value);
      builder.emitOpcode(OpCode.UOM_CONVERT_IN);
      return;
    }

    // Parse the right operand (target value)
    parser.parseExpression(this.bindingPower, builder);
    
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
