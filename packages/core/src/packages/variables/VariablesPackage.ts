import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { VariableParselet } from "./parselets/VariableParselet";
import { IdentifierParselet } from "./parselets/IdentifierParselet";
import { GlobalVariableParselet } from "./parselets/GlobalVariableParselet";
import { GlobalVariableAsyncResolver } from "@solve-js/vm/GlobalVariableAsyncResolver";

/** Variable read/write: `:name = expr` to define, `name` to read, plus `global :name` for a document-spanning variable backed by the {@link GlobalVariableStore} instead of local VM scope. */
export const VARIABLES_PACKAGE: IEnginePackage = {
  name: "solve-variables",
  // Resolves `global :name` reads that aren't yet known to any currently-
  // loaded document — shows Pending and re-resolves automatically the
  // instant some document declares it, via the same async pipeline
  // the currency package uses for currency rates.
  asyncResolvers: [new GlobalVariableAsyncResolver()],
  prefixParselets: [
    { tokenType: "COLON", parselet: new VariableParselet() },
    { tokenType: "IDENT", parselet: new IdentifierParselet() },
    // UNIT tokens in prefix position (standalone or after operators) are
    // resolved as variable references via LOAD_VAR, same as IDENT tokens.
    // This handles cases like `a + b` where "b" is classified as UNIT
    // because it collides with a known unit (e.g., "b" = bits).
    { tokenType: "UNIT", parselet: new IdentifierParselet() },
    // `global :name` (read) / `global :name = expr` (write) — a document-
    // spanning variable backed by GlobalVariableStore instead of this VM's
    // own local scope.
    { tokenType: "GLOBAL", parselet: new GlobalVariableParselet() },
  ],
};
