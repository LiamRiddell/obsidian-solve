import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { LINE_REF_FN_IDX } from "../LinesPluginFunctions";

/**
 * `line1` / `line 1` -- an arbitrary line's cached result by 1-based line
 * number (Notes Calculator, NumPad). Fused into a single `LINE_REF` token
 * by `LineRefNormalizerRule.ts`, carrying the parsed line number as
 * `token.value`.
 *
 * The line number is pushed via `PUSH_NUMBER`/`emitNumber()` (the
 * `Float64Array` constant pool) -- deliberately NOT `emitIndex()`, which
 * writes a single raw byte (0-255) directly into the opcode stream and
 * would silently break for any document past 255 lines.
 */
export class LineRefParselet implements PrefixParselet {
  readonly category = "Lines";

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    const lineNumber = parseInt(token.value, 10);
    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(lineNumber);
    builder.emitOpcode(OpCode.CALL_PLUGIN);
    builder.emitIndex(LINE_REF_FN_IDX);
    builder.emitIndex(1);
  }
}
