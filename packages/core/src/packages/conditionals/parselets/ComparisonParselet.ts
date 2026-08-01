import { InfixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";

/**
 * `==`, `!=`, `<`, `>`, `<=`, `>=` — comparison operators, producing a
 * `ValueType.Boolean` result. The VM opcodes (`EQ`/`NEQ`/`LT`/`LTE`/`GT`/
 * `GTE`, `OpCode` 40-45) already existed and were fully implemented
 * (including UoM-aware equality) before this package — only the
 * lexer/parser front end was missing (confirmed via full-repo grep this
 * session: no parselet claimed these tokens). One parameterized class
 * covers all six; the constructor picks which opcode to emit.
 */
export class ComparisonParselet implements InfixParselet {
	readonly category = "Conditionals";
	readonly bindingPower = BindingPower.Conditional;

	constructor(private readonly opcode: OpCode) {}

  parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(this.bindingPower, builder);
    builder.emitOpcode(this.opcode);
  }
}
