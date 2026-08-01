export { ComparisonParselet } from "./ComparisonParselet";
export { LogicalParselet } from "./LogicalParselet";
export { BooleanLiteralParselet } from "./BooleanLiteralParselet";
export { IfThenElseParselet } from "./IfThenElseParselet";

import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";
import { ComparisonParselet } from "./ComparisonParselet";
import { LogicalParselet } from "./LogicalParselet";
import { BooleanLiteralParselet } from "./BooleanLiteralParselet";
import { IfThenElseParselet } from "./IfThenElseParselet";

export function registerConditionalsParselets(registry: ParseletRegistry): void {
  registry.registerPrefix("TRUE", new BooleanLiteralParselet(true));
  registry.registerPrefix("FALSE", new BooleanLiteralParselet(false));
  registry.registerPrefix("IF", new IfThenElseParselet());

  registry.registerInfix("EQUALITY", new ComparisonParselet(OpCode.EQ));
  registry.registerInfix("NEQ", new ComparisonParselet(OpCode.NEQ));
  registry.registerInfix("LT", new ComparisonParselet(OpCode.LT));
  registry.registerInfix("GT", new ComparisonParselet(OpCode.GT));
  registry.registerInfix("LTE", new ComparisonParselet(OpCode.LTE));
  registry.registerInfix("GTE", new ComparisonParselet(OpCode.GTE));
  registry.registerInfix("OR", new LogicalParselet(OpCode.LOGICAL_OR, BindingPower.LogicalOr));
  registry.registerInfix("LOGICAL_AND", new LogicalParselet(OpCode.LOGICAL_AND, BindingPower.LogicalAnd));
  registry.registerInfix("LOGICAL_OR", new LogicalParselet(OpCode.LOGICAL_OR, BindingPower.LogicalOr));
}
