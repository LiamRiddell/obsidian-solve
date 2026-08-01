import { InfixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";

/**
 * "N% of what is X" — solves `N% * base = X` for `base` (base = X / N%),
 * the inverse of the plain "N% of X" multiplication `OfParselet` already
 * handles. Numi's syntax reference names this exact form; this codebase
 * had no "solve for the unknown" percentage grammar before it.
 *
 * By the time this infix parselet runs, the left-hand percent value (as a
 * plain decimal, e.g. 0.05 for "5%") is ALREADY on the bytecode stack —
 * that's how Pratt-parser infix continuation works, the left operand's
 * bytecode is emitted before the infix trigger token is even consumed.
 * `BytecodeBuilder` is append-only (no rewriting earlier instructions), so
 * getting `X / percent` instead of the wrong `percent / X` needs an
 * explicit SWAP between parsing X and dividing, not just emitting DIV
 * directly — see OpCode.SWAP's VM.ts case for the exact stack-swap
 * semantics this relies on.
 */
export class OfWhatIsParselet implements InfixParselet {
	readonly category = "Percentage";
	readonly bindingPower = BindingPower.Product;

  parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(this.bindingPower, builder);
    builder.emitOpcode(OpCode.SWAP);
    builder.emitOpcode(OpCode.DIV);
  }
}
