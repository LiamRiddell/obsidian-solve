import { InfixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";

/**
 * "N% on what is X" / "N% off what is X" — solve for the base value given
 * a percentage INCREASE/DECREASE result, e.g. "5% on what is 210" -> 200
 * (200 * 1.05 = 210), "5% off what is 190" -> 200 (200 * 0.95 = 190).
 * The sibling of `OfWhatIsParselet` (plain "N% of what is X", no +/-1
 * offset) — see that file's doc comment for the base SWAP+DIV technique
 * this builds on. Both forms come from Numpad's documented syntax
 * reference (`5% on what is $210` / `5% off what is $190`).
 *
 * `sign` is +1 for "on" (X / (1 + percent)) or -1 for "off" (X / (1 -
 * percent)). By the time this infix parselet runs, the left-hand percent
 * decimal is already on the stack — see the two bytecode sequences below,
 * each independently derived to land the operands in the right order for
 * a plain (non-reversed) `SUB`/`DIV`, since `BytecodeBuilder` is
 * append-only and there's no way to "undo" the already-emitted percent
 * value's stack position other than via explicit `SWAP`s.
 */
export class OnOffWhatIsParselet implements InfixParselet {
	readonly category = "Percentage";
	readonly bindingPower = BindingPower.Product;
  constructor(private readonly sign: 1 | -1) {}

  parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(1);
    if (this.sign === 1) {
      // stack: [percent, 1] -> ADD (commutative) -> [1 + percent]
      builder.emitOpcode(OpCode.ADD);
    } else {
      // stack: [percent, 1] -> SWAP -> [1, percent] -> SUB -> [1 - percent]
      builder.emitOpcode(OpCode.SWAP);
      builder.emitOpcode(OpCode.SUB);
    }
    parser.parseExpression(this.bindingPower, builder);
    // stack: [(1±percent), X] -> SWAP -> [X, (1±percent)] -> DIV -> X / (1±percent)
    builder.emitOpcode(OpCode.SWAP);
    builder.emitOpcode(OpCode.DIV);
  }
}
