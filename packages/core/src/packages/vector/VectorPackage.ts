import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { VectorParselet } from "./parselets/VectorParselet";
import { FloatParselet } from "./parselets/FloatParselet";

/**
 * Vector literals `vec2(x, y)`/`vec3(x, y, z)`/`vec4(x, y, z, w)` plus float
 * literals — legacy construction sugar kept working after the Calca-parity
 * Matrix rewrite; each just builds a 1xN row-vector `ValueType.Matrix` via
 * `OpCode.MAT_NEW` (see vm/MatrixOps.ts). The bracket literal `[x, y, z]`
 * (packages/matrix/) is the primary, Calca-parity construction syntax going
 * forward.
 */
export const VECTOR_PACKAGE: IEnginePackage = {
  name: "solve-vector",
  prefixParselets: [
    { tokenType: "VEC2", parselet: new VectorParselet(2) },
    { tokenType: "VEC3", parselet: new VectorParselet(3) },
    { tokenType: "VEC4", parselet: new VectorParselet(4) },
    { tokenType: "FLOAT", parselet: new FloatParselet() },
  ],
};
