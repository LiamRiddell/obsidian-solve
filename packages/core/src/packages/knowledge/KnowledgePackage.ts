import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { allocatePluginFunctionIndex } from "@solve-js/vm/VMBuiltins";
import { createQueryResolver } from "@solve-js/resolvers/QueryResolver";
import { errorValue, stringValue, type Value } from "@solve-js/vm/Value";
import { knowledgeQueryParselet } from "./parselets/KnowledgeQueryParselet";
import type { KnowledgePackageConfig } from "./types";

/**
 * Knowledge-assistant queries — `<any query text> = ?`, e.g.
 * `distance to the moon = ?`. SoulverCore's own version of this feature
 * calls out to Wolfram|Alpha; there is no free equivalent of comparable
 * quality, so — same pluggable-provider approach as `packages/stocks` —
 * a host supplies `answerQuery` via {@link createKnowledgePackage}'s
 * `config` argument. No config -> every `= ?` expression resolves to a
 * clearly-worded `KNOWLEDGE_NOT_CONFIGURED` error `Value`, never a
 * hallucinated/guessed answer.
 *
 * **Not a member of `BUILTIN_PACKAGES`** — unconfigured, this package does
 * nothing useful, exactly like `packages/stocks` and `examples/osrs`.
 *
 * ## Why this package is architecturally different from every other one
 *
 * Every other package in this codebase (including its sibling
 * `weather`/`stocks`) is "structured syntax evaluates to a value" — the
 * grammar is known in advance, and the lexer/parser tokenize it like any
 * other expression. This package's grammar is "arbitrary free text,
 * terminated by a fixed marker, gets shipped to an external function
 * verbatim" — `distance to the moon` is not valid Solve syntax (it would
 * never parse as arithmetic), so it can't be tokenized-then-parsed the
 * normal way at all.
 *
 * The fix lives one layer below the parser: `ExpressionLexer.ts` gained a
 * new, generic extension point, `LexerVocabulary.rawLinePatterns` (see
 * its doc comment there for the full design). A `rawLinePatterns` rule
 * tests the RAW line text — before any per-character tokenization — and
 * if it matches, the whole line becomes ONE synthetic token whose value
 * is the matched capture group, verbatim. This package is that
 * mechanism's reference/motivating use: the pattern below
 * (`/^(.+?)=\s*\?\s*$/`) recognizes a trailing `= ?` (optionally
 * `=?` with no space) and captures everything before it as the query
 * text, so "distance to the moon" is never split into IDENT/keyword
 * tokens or run through the normalizer/parser at all — it reaches
 * `KnowledgeQueryParselet` as one already-formed string.
 *
 * No other Solve syntax uses a bare `= ?` marker (the codebase's other
 * "possibilities" feature, `cm to ?`, is a different token shape — `TO
 * QUESTION`, not `EQUALS QUESTION` — see
 * `packages/uom/normalizer/PossibilitiesNormalizerRule.ts`), so this
 * claims no ambiguity with existing grammar; it only activates for lines
 * a host has opted into via this package in the first place.
 */
export function createKnowledgePackage(config: KnowledgePackageConfig = {}): IEnginePackage {
	const fnIdx = allocatePluginFunctionIndex();

	const { resolver, pluginFunction } = createQueryResolver({
		namespace: "knowledge",
		pluginFunctionIndex: fnIdx,
		staleTimeMs: config.staleTimeMs ?? 5 * 60 * 1000,
		fetchQuery: async (query: string, signal: AbortSignal): Promise<Value> => {
			if (!config.answerQuery) {
				return errorValue(
					"KNOWLEDGE_NOT_CONFIGURED",
					`Knowledge answer provider not configured — see packages/core/src/packages/knowledge/KnowledgePackage.ts's JSDoc for how to supply answerQuery via createKnowledgePackage({ ... }).`,
				);
			}
			const answer = await config.answerQuery(query, signal);
			return stringValue(answer);
		},
	});

	return {
		name: "solve-knowledge",

		lexerVocabulary: {
			rawLinePatterns: [
				{ pattern: /^(.+?)=\s*\?\s*$/, tokenType: "KNOWLEDGE_QUERY" },
			],
		},

		prefixParselets: [
			{ tokenType: "KNOWLEDGE_QUERY", parselet: knowledgeQueryParselet(fnIdx) },
		],

		pluginFunctions: [
			{ index: fnIdx, handler: pluginFunction },
		],

		asyncResolvers: [resolver],
	};
}
