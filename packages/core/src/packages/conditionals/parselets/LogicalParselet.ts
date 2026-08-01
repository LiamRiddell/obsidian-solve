import { InfixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

/**
 * `or`, `&&`, `||` — logical OR/AND, producing a `ValueType.Boolean`
 * result (see `OpCode.LOGICAL_AND`/`LOGICAL_OR` in `vm/VM.ts`; both
 * operands are coerced via `isTruthy()`, so plain numeric operands work
 * too, e.g. `x and y > 0`).
 *
 * The word "and" is deliberately NOT handled here — it already lexes as
 * `PLUS` (a locale word-synonym for arithmetic "+", `en.ts`: `and:
 * "PLUS"`), which is a Tier-1 hardcoded infix operator
 * (`parser/BindingPower.ts`'s `BUILTIN_INFIX_BP`) that never reaches this
 * registry-based parselet at all. `OpCode.ADD`'s own VM handler special-
 * cases `Boolean && Boolean` operands instead — see the comment there.
 */
export class LogicalParselet implements InfixParselet {
	readonly category = "Conditionals";

	constructor(private readonly opcode: OpCode, readonly bindingPower: number) {}

  parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(this.bindingPower, builder);
    builder.emitOpcode(this.opcode);
  }
}
