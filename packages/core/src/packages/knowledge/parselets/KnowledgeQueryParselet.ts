import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

/**
 * Prefix parselet for the `KNOWLEDGE_QUERY` token — the token IS the
 * entire query, already extracted from the raw line text (everything
 * before a trailing `= ?`) by the lexer's `rawLinePatterns` hook (see
 * `LexerVocabulary.rawLinePatterns` in `ExpressionLexer.ts`, and
 * `KnowledgePackage.ts`'s `lexerVocabulary` for the pattern that produces
 * it). Structurally identical to `examples/osrs/OsrsParselet.ts`'s
 * `GameItemParselet` (one token in, `PUSH_STRING` + `CALL_PLUGIN` out) —
 * the only thing architecturally unusual about this package is how the
 * token got made, not how it's parsed.
 */
export function knowledgeQueryParselet(pluginFnIdx: number): PrefixParselet {
	return {
		category: "Knowledge",
		parse(_parser: Parser, token: Token, builder: BytecodeBuilder): void {
			builder.emitOpcode(OpCode.PUSH_STRING);
			builder.emitString(token.value);
			builder.emitOpcode(OpCode.CALL_PLUGIN);
			builder.emitIndex(pluginFnIdx);
			builder.emitIndex(1);
		},
	};
}
