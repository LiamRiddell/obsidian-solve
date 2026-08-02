import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { MapParselet } from "./parselets/MapParselet";
import { ReduceParselet } from "./parselets/ReduceParselet";
import { SumParselet } from "./parselets/SumParselet";
import { ProdParselet } from "./parselets/ProdParselet";
import { mapReduceCallNormalizerRule } from "./normalizer/MapReduceCallNormalizerRule";

/**
 * `map`/`reduce`/`sum`/`prod` — Calca-parity collection transforms over a
 * Matrix or a bare Range. See `MapReduceShared.ts` for the shared
 * transform-disambiguation/collection-parsing logic, and `vm/VM.ts`'s
 * `MAP_INVOKE`/`REDUCE_INVOKE` opcode handlers for the runtime semantics.
 *
 * `map`/`reduce`/`sum`/`prod` are NOT bare keywordMap entries — see
 * `MapReduceCallNormalizerRule.ts`, which fuses them into their own token
 * types only when immediately followed by `(`, so `:map = [...]` etc.
 * keep working as ordinary variable names.
 */
export const MAPREDUCE_PACKAGE: IEnginePackage = {
  name: "solve-mapreduce",
  normalizerRules: [mapReduceCallNormalizerRule()],
  prefixParselets: [
    { tokenType: "MAP", parselet: new MapParselet() },
    { tokenType: "REDUCE", parselet: new ReduceParselet() },
    { tokenType: "SUM_FN", parselet: new SumParselet() },
    { tokenType: "PROD_FN", parselet: new ProdParselet() },
  ],
};
