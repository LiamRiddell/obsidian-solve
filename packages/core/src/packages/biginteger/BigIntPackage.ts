import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { BigIntNumberParselet } from "./parselets/BigIntNumberParselet";

export const BIGINT_PACKAGE: IEnginePackage = {
  name: "solve-bigint",
  prefixParselets: [
    { tokenType: "BIGINT", parselet: new BigIntNumberParselet() },
  ],
};
