import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { FunctionCallParselet } from "./parselets/FunctionCallParselet";

export const FUNCTION_PACKAGE: IEnginePackage = {
  name: "solve-function",
  prefixParselets: [
    { tokenType: "FUNC", parselet: new FunctionCallParselet() },
  ],
};
