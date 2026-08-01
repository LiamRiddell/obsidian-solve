export { VariadicAggregateParselet } from "./VariadicAggregateParselet";
export { largerSmallerParselet } from "./LargerSmallerParselet";
export { halfParselet } from "./HalfParselet";
export { midpointParselet } from "./MidpointParselet";
export { randomNumberParselet } from "./RandomNumberParselet";
export { ClampParselet } from "./ClampParselet";
export { ProportionParselet } from "./ProportionParselet";

import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { VariadicAggregateParselet } from "./VariadicAggregateParselet";
import { largerSmallerParselet } from "./LargerSmallerParselet";
import { halfParselet } from "./HalfParselet";
import { midpointParselet } from "./MidpointParselet";
import { randomNumberParselet } from "./RandomNumberParselet";
import { ClampParselet } from "./ClampParselet";
import { ProportionParselet } from "./ProportionParselet";

// CALL_BUILTIN indices — see VMBuiltins.ts for the handler implementations.
const AVERAGE = 42, MEDIAN = 43, TOTAL = 44, COUNT = 45;
const MIN = 9, MAX = 10;

export function registerMathPhrasesParselets(registry: ParseletRegistry): void {
  registry.registerPrefix("AVERAGE_OF", new VariadicAggregateParselet(AVERAGE));
  registry.registerPrefix("MEDIAN_OF", new VariadicAggregateParselet(MEDIAN));
  registry.registerPrefix("TOTAL_OF", new VariadicAggregateParselet(TOTAL));
  registry.registerPrefix("COUNT_OF", new VariadicAggregateParselet(COUNT));

  registry.registerPrefix("LARGER_OF", largerSmallerParselet(MAX));
  registry.registerPrefix("SMALLER_OF", largerSmallerParselet(MIN));

  registry.registerPrefix("HALF_OF", halfParselet);
  registry.registerPrefix("MIDPOINT_BETWEEN", midpointParselet);
  registry.registerPrefix("RANDOM_NUMBER", randomNumberParselet);
  registry.registerPrefix("CLAMP", new ClampParselet());

  registry.registerInfix("IS_TO", new ProportionParselet());
}
