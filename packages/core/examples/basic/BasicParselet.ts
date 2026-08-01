import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { allocatePluginFunctionIndex } from "@solve-js/vm/VMBuiltins";
import { stripQuotes } from "@solve-js/utilities/Strings";

/**
 * Every package that dispatches custom logic via CALL_PLUGIN needs its own
 * unique index — never hardcode a number, always call
 * {@link allocatePluginFunctionIndex}. See `IEnginePackage.pluginFunctions`.
 */
export const REVERSE_PLUGIN_FN_IDX: number = allocatePluginFunctionIndex();

/**
 * Prefix parselet for the `reverse` keyword — the whole example in one
 * parselet. Supports the single function-call form `reverse("text")`:
 * consumes `(`, a quoted string, and `)`, then emits bytecode that pushes
 * the unquoted string and calls this package's plugin function with it.
 */
export class ReverseKeywordParselet implements PrefixParselet {
  readonly category = "Basic Example";

  parse(parser: Parser, _token: Token, builder: BytecodeBuilder): void {
    parser.consume("LPAREN");
    const stringToken = parser.consume(); // the STRING token
    parser.consume("RPAREN");

    const text = stripQuotes(stringToken.value);

    builder.emitOpcode(OpCode.PUSH_STRING);
    builder.emitString(text);
    builder.emitOpcode(OpCode.CALL_PLUGIN);
    builder.emitIndex(REVERSE_PLUGIN_FN_IDX);
    builder.emitIndex(1); // argCount
  }
}
