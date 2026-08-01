import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { BigIntNumberParselet } from "./parselets/BigIntNumberParselet";

/** Arbitrary-precision integer literals (suffixed, e.g. `123n`) that overflow a normal `number` without losing precision. */
export const BIGINT_PACKAGE: IEnginePackage = {
  name: "solve-bigint",
  prefixParselets: [
    { tokenType: "BIGINT", parselet: new BigIntNumberParselet() },
  ],
};
