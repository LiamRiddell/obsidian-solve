import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { PREV_FN_IDX } from "../LinesPluginFunctions";

/**
 * `prev` -- the immediately-preceding line's cached result (Numi). Bare
 * keyword (see LinesPackage.ts's doc comment for the collision-risk
 * reasoning) resolving entirely at RUNTIME via `context.lineIndex` --
 * there's nothing to push onto the stack at parse time, the handler reads
 * "which line am I on" from the `LineExecutionContext` `CALL_PLUGIN`
 * threads through (see `vm/VM.ts`'s `LineExecutionContext`).
 */
export class PrevParselet implements PrefixParselet {
  readonly category = "Lines";

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    builder.emitOpcode(OpCode.CALL_PLUGIN);
    builder.emitIndex(PREV_FN_IDX);
    builder.emitIndex(0);
  }
}
