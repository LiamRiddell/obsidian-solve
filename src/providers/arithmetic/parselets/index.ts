export { NumberParselet } from "./NumberParselet";
export { PrefixOpParselet } from "./PrefixOpParselet";
export { BinaryOpParselet } from "./BinaryOpParselet";
export { GroupParselet } from "./GroupParselet";
export { ConstantParselet } from "./ConstantParselet";

import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { BindingPower } from "@/engine/parser/BindingPower";
import { OpCode } from "@/engine/parser/OpCode";
import { NumberParselet } from "./NumberParselet";
import { PrefixOpParselet } from "./PrefixOpParselet";
import { BinaryOpParselet } from "./BinaryOpParselet";
import { GroupParselet } from "./GroupParselet";
import { ConstantParselet } from "./ConstantParselet";

export function registerArithmeticParselets(registry: ParseletRegistry): void {
  registry.registerPrefix("NUMBER", new NumberParselet());
  registry.registerPrefix("LPAREN", new GroupParselet());
  registry.registerPrefix("PI", new ConstantParselet());
  registry.registerPrefix("E", new ConstantParselet());
  registry.registerPrefix("PLUS", new PrefixOpParselet(OpCode.POS));
  registry.registerPrefix("MINUS", new PrefixOpParselet(OpCode.NEG));

  registry.registerInfix("PLUS", new BinaryOpParselet(BindingPower.Sum, OpCode.ADD));
  registry.registerInfix("MINUS", new BinaryOpParselet(BindingPower.Sum, OpCode.SUB));
  registry.registerInfix("STAR", new BinaryOpParselet(BindingPower.Product, OpCode.MUL));
  registry.registerInfix("SLASH", new BinaryOpParselet(BindingPower.Product, OpCode.DIV));
  registry.registerInfix("MOD", new BinaryOpParselet(BindingPower.Product, OpCode.MOD));
  registry.registerInfix("CARET", new BinaryOpParselet(BindingPower.Exponent, OpCode.EXP));
}