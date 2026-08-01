import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { FunctionCallParselet } from "./parselets/FunctionCallParselet";

/** Built-in function call syntax, e.g. `sqrt(2)`, `sin(pi)` — dispatches recognized function names to CALL_BUILTIN opcodes. */
export const FUNCTION_PACKAGE: IEnginePackage = {
  name: "solve-function",
  prefixParselets: [
    { tokenType: "FUNC", parselet: new FunctionCallParselet() },
  ],
};
