import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { MatrixLiteralParselet } from "./parselets/MatrixLiteralParselet";
import { MatrixIndexParselet } from "./parselets/MatrixIndexParselet";

/**
 * Matrix literals `[1, 2; 3, 4]` and indexing `a[i]`/`a[row, col]` —
 * Calca-parity general matrix support (a vector is just a 1xN or Nx1
 * matrix). See `vm/Value.ts`'s `MatrixData` and `vm/MatrixOps.ts`'s shared
 * column-major storage helpers.
 *
 * `LBRACKET` is registered in BOTH prefix and infix slots — separate
 * registry lookups keyed on parse position, not a collision: a literal
 * opens in prefix position (right after `=`, `(`, an operator, ...) and an
 * index opens in infix/postfix position, right after any value-producing
 * expression.
 */
export const MATRIX_PACKAGE: IEnginePackage = {
  name: "solve-matrix",
  prefixParselets: [
    { tokenType: "LBRACKET", parselet: new MatrixLiteralParselet() },
  ],
  infixParselets: [
    { tokenType: "LBRACKET", parselet: new MatrixIndexParselet() },
  ],
};
