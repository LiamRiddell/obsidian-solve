import { InfixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";

/**
 * `<date> is a weekend` / `<date> is a workday` / `<date> is a weekday`
 * -> Boolean.
 *
 * A POSTFIX operator — an `InfixParselet` that parses no right operand, so
 * the already-emitted left-hand date is the only thing on the stack when
 * the plugin call runs. Structurally identical to `ToTimestampParselet`,
 * which is the same shape (`<date> to timestamp`) and uses the same
 * binding power.
 *
 * Written as a postfix rather than a prefix `is <date> a weekend` because
 * the prefix form would need "is" as a bare keyword — and "is" is far too
 * common a word to claim globally, the same objection that makes every
 * other phrase in this package fuse its full text.
 */
export class DayTypePredicateParselet implements InfixParselet {
  readonly category = "Date/Time";
  readonly bindingPower = BindingPower.Conditional;

  constructor(private readonly functionIndex: number) {}

  parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
    builder.emitOpcode(OpCode.CALL_PLUGIN);
    builder.emitIndex(this.functionIndex);
    builder.emitIndex(1);
  }
}
