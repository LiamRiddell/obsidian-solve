import { describe, expect, test } from "@jest/globals";
import { LexerToken } from "@solve-js/lexer/ExpressionLexer";
import { tokenTypeId } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { knowledgeQueryParselet } from "@solve-js/packages/knowledge/parselets/KnowledgeQueryParselet";

const TEST_FN_IDX = 220;

describe("knowledgeQueryParselet", () => {
	test("compiles the KNOWLEDGE_QUERY token's value directly to PUSH_STRING + CALL_PLUGIN", () => {
		const parselet = knowledgeQueryParselet(TEST_FN_IDX);
		const builder = new BytecodeBuilder();
		const token = new LexerToken(
			"KNOWLEDGE_QUERY", tokenTypeId("KNOWLEDGE_QUERY"),
			"distance to the moon", "distance to the moon", 0, 0, 1, 1,
		);

		// The parser is never touched — the token already carries the full
		// query, extracted at the lexer's rawLinePatterns layer.
		parselet.parse({} as any, token, builder);

		const program = builder.build();
		const opcodes = Array.from(program.opcodes);
		expect(opcodes[0]).toBe(OpCode.PUSH_STRING);
		expect(opcodes[2]).toBe(OpCode.CALL_PLUGIN);
		expect(opcodes[3]).toBe(TEST_FN_IDX);
		expect(opcodes[4]).toBe(1);
		expect(program.strings[0]).toBe("distance to the moon");
	});

	test("category is Knowledge", () => {
		expect(knowledgeQueryParselet(TEST_FN_IDX).category).toBe("Knowledge");
	});
});
