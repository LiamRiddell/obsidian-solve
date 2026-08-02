import { InfixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";

/**
 * Matrix indexing/slicing — `a[i]` (column-major single index, matching
 * `MatrixData.data`'s own storage order directly), `a[row, col]` (two-arg
 * point index, both 0-based), or range-based slicing where either/both
 * arguments use an explicit `min:max` bound (`a[0:1, 1:2]`). Registered as
 * an INFIX parselet on LBRACKET — a separate registry slot from
 * `MatrixLiteralParselet`'s PREFIX registration on the same token: `[`
 * opens a literal in prefix position (right after `=`, `(`, an operator,
 * ...) and opens an index in infix (postfix) position, right after any
 * value-producing expression.
 *
 * The `:` inside `[...]` is hand-consumed directly here (`parser.match
 * ("COLON")`), exactly like `packages/lines/parselets/RangeAggregateParselet.ts`'s
 * own `sum(line 1 : line 4)` grammar — NOT via a general registry-wide
 * infix parselet on COLON. That distinction matters: a general COLON
 * operator would also fire for a bare top-level `label: value` line,
 * silently breaking the shipped "labeled-line fallback" feature (see
 * ExpressionEngine.ts's `parseExpression()` doc comment, and
 * `__tests__/engine/LabeledLine.spec.ts`'s "total: 5 + 3" case, which
 * resolves the "total" label ONLY because nothing today gives COLON an
 * infix meaning at the top level). Hand-parsing it here, scoped to
 * exactly this grammar production, gets range-slicing without touching
 * that shared token's meaning anywhere else in the language. A second,
 * independent collision — the Time package's clock-time/laptime/video-
 * timecode normalizer rules fuse ANY bare `NUMBER:NUMBER...` sequence
 * (context-blind, pre-parse) — is handled separately via each of those
 * rules' own `isInsideRangeContext()` guard.
 *
 * A plain point index (no colon anywhere in the brackets) takes the
 * ORIGINAL scalar-result path (`MAT_INDEX1`/`MAT_INDEX2`), with bytecode
 * emission bit-for-bit identical to before range-slicing existed. Slicing
 * (`MAT_SLICE`) is a genuinely different operation — it always returns a
 * sub-Matrix, never a bare scalar, even for a single-cell selection like
 * `a[0:0, 0:0]` — so the two paths stay fully separate rather than
 * unified, matching Calca's own point-vs-range distinction. Which path
 * applies is decided via a one-time lookahead ({@link hasTopLevelColon})
 * BEFORE either argument is parsed, so each argument can be wrapped into a
 * Range (or left as a raw value) immediately as it's parsed, with no need
 * to reorder or patch up the stack afterward — deferring that decision
 * and trying to wrap arguments after the fact does NOT work, since
 * wrapping the last-parsed argument first buries any earlier argument's
 * still-unwrapped value(s) under it, with no way to reach back down.
 */
export class MatrixIndexParselet implements InfixParselet {
  readonly category = "Matrix";
  readonly bindingPower = BindingPower.Postfix;

  parse(parser: Parser, _left: Token, _token: Token, builder: BytecodeBuilder): void {
    const isSlice = this.hasTopLevelColon(parser);

    this.parseIndexArg(parser, builder, isSlice);
    let argCount = 1;
    if (parser.match("COMMA")) {
      this.parseIndexArg(parser, builder, isSlice);
      argCount = 2;
    }
    parser.consume("RBRACKET");

    if (!isSlice) {
      if (argCount === 1) {
        builder.emitOpcode(OpCode.MAT_INDEX1);
      } else {
        builder.emitOpcode(OpCode.MAT_INDEX2);
      }
      return;
    }

    if (argCount !== 2) {
      throw ErrorFactory.parsing(
        "INVALID_MATRIX_SLICE_ARITY",
        `Range-based matrix slicing needs exactly 2 arguments ("a[rowRange, colRange]"), got ${argCount}.`,
        { argCount },
      );
    }

    builder.emitOpcode(OpCode.MAT_SLICE);
  }

  /**
   * Read-only lookahead (no tokens consumed) from the current position —
   * right after the triggering `[` — to whichever `]` matches it, tracking
   * `[`/`(` nesting depth so a colon inside a NESTED bracket/paren (e.g.
   * `a[b[0:1], 2]`'s inner slice, or a function-call argument) is never
   * mistaken for one of THIS bracket's own top-level range separators.
   * Determines the whole bracket's point-vs-slice interpretation upfront,
   * before any argument is actually parsed.
   */
  private hasTopLevelColon(parser: Parser): boolean {
    let depth = 0;
    for (let offset = 0; ; offset++) {
      const t = parser.peekAt(offset);
      if (!t) return false; // unbalanced brackets — the real parse below will throw its own error
      if (t.type === "LBRACKET" || t.type === "LPAREN") {
        depth++;
      } else if (t.type === "RBRACKET" || t.type === "RPAREN") {
        if (depth === 0) return false; // this is OUR closing bracket — nothing found before it
        depth--;
      } else if (t.type === "COLON" && depth === 0) {
        return true;
      }
    }
  }

  /**
   * Parses one index/slice argument: a plain expression, or `expr : expr`
   * for an explicit range. When `isSlice` is true (decided once, upfront,
   * for the WHOLE bracket via {@link hasTopLevelColon}), immediately
   * collapses whatever this argument pushed into a single Range value —
   * `RANGE_NEW` directly for an explicit `min:max` pair already on the
   * stack, or `DUP` + `RANGE_NEW` for a lone point (becoming `Range(v,
   * v)`, a single-cell selection along that dimension). When `isSlice` is
   * false, no wrapping happens at all — the argument's raw value is left
   * exactly as `MAT_INDEX1`/`MAT_INDEX2` already expect.
   */
  private parseIndexArg(parser: Parser, builder: BytecodeBuilder, isSlice: boolean): void {
    parser.parseExpression(0, builder);
    let isRange = false;
    if (parser.match("COLON")) {
      parser.parseExpression(0, builder);
      isRange = true;
    }
    if (isSlice) {
      if (!isRange) {
        builder.emitOpcode(OpCode.DUP);
      }
      builder.emitOpcode(OpCode.RANGE_NEW);
    }
  }
}
