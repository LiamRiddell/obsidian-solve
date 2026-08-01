import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { UomLiteralParselet } from "./parselets/UomLiteralParselet";
import { ConvertParselet } from "./parselets/ConvertParselet";

export const UOM_PACKAGE: IEnginePackage = {
  name: "solve-uom",
  prefixParselets: [
    { tokenType: "CONVERT", parselet: new ConvertParselet() },
  ],
  infixParselets: [
    { tokenType: "UNIT", parselet: new UomLiteralParselet() },
  ],
};
