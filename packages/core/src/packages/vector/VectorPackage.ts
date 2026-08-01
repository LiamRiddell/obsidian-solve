import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { VectorParselet } from "./parselets/VectorParselet";
import { FloatParselet } from "./parselets/FloatParselet";

export const VECTOR_PACKAGE: IEnginePackage = {
  name: "solve-vector",
  prefixParselets: [
    { tokenType: "VEC2", parselet: new VectorParselet(2) },
    { tokenType: "VEC3", parselet: new VectorParselet(3) },
    { tokenType: "VEC4", parselet: new VectorParselet(4) },
    { tokenType: "FLOAT", parselet: new FloatParselet() },
  ],
};
