import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";

/**
 * Matrix literal — `[1, 2; 3, 4]` (comma-separated values within a row,
 * semicolon-separated rows). A single row with no semicolons, `[1, 2, 3]`,
 * is a 1xN row-vector Matrix — Calca's own convention, and this engine's
 * primary construction syntax going forward (see
 * `packages/vector/parselets/VectorParselet.ts`'s doc comment for the
 * legacy `vec2(...)`/bare-tuple sugar this supersedes).
 *
 * Cells may be ANY expression, not just literals (`[foo, bar] * 2`), so
 * each cell is parsed via the ordinary `parseExpression()` recursive
 * descent, exactly like a function-call argument list.
 *
 * Confirmed zero grammar collision: `LBRACKET`/`RBRACKET` have no other
 * prefix/infix parselet registered anywhere in this engine — the only
 * other consumer is `datetime/normalizer/DailyNoteLinkNormalizerRule.ts`'s
 * narrow DOUBLE-bracket `[[2024-01-15]]` daily-note-link unwrap, which
 * only ever matches that exact 5-token shape and never single brackets.
 */
export class MatrixLiteralParselet implements PrefixParselet {
  readonly category = "Matrix";

  parse(parser: Parser, _token: Token, builder: BytecodeBuilder): void {
    let rows = 0;
    let cols = -1; // -1 = not yet known (set by the first row)

    // Empty matrix literal `[]` — reject rather than silently emit a 0x0
    // Matrix, which every downstream consumer (arithmetic, indexing,
    // display) would have to special-case for no real benefit.
    if (parser.peek()?.type === "RBRACKET") {
      throw ErrorFactory.parsing(
        "EMPTY_MATRIX_LITERAL",
        "A matrix literal cannot be empty — `[]` has no valid shape.",
        {},
      );
    }

    for (;;) {
      let rowCols = 0;
      parser.parseExpression(0, builder);
      rowCols++;
      while (parser.match("COMMA")) {
        parser.parseExpression(0, builder);
        rowCols++;
      }

      if (cols === -1) {
        cols = rowCols;
      } else if (rowCols !== cols) {
        throw ErrorFactory.parsing(
          "RAGGED_MATRIX_LITERAL",
          `Matrix literal rows must all have the same number of columns — row ${rows + 1} has ${rowCols}, but a previous row has ${cols}.`,
          { expectedCols: cols, actualCols: rowCols, row: rows + 1 },
        );
      }
      rows++;

      if (!parser.match("SEMICOLON")) break;
    }

    parser.consume("RBRACKET");

    // Cells were parsed/pushed in row-major reading order (matching how
    // `[1,2;3,4]` is textually written) — MAT_NEW's own VM handler
    // transposes this into the column-major storage MatrixData actually
    // uses (see vm/MatrixOps.ts's rowMajorToColumnMajor()).
    builder.emitOpcode(OpCode.MAT_NEW);
    builder.emitIndex(rows);
    builder.emitIndex(cols);
  }
}
