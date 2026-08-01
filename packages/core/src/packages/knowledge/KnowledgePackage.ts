import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { allocatePluginFunctionIndex } from "@solve-js/vm/VMBuiltins";
import { createQueryResolver } from "@solve-js/resolvers/QueryResolver";
import { errorValue, stringValue, type Value } from "@solve-js/vm/Value";
import { knowledgeQueryParselet } from "./parselets/KnowledgeQueryParselet";
import type { KnowledgePackageConfig } from "./types";

/**
 * Knowledge-assistant queries — open-ended questions answered by a
 * host-supplied provider. Two supported surface forms, both producing the
 * exact same `KNOWLEDGE_QUERY` token/behavior (see the two
 * `rawLinePatterns` entries below):
 *
 * - **`search: <query>` / `ask: <query>` / `google: <query>`** (preferred,
 *   added this iteration) — a clear, self-documenting leading verb, e.g.
 *   `search: distance to the moon`. Reads like an instruction, not a
 *   cryptic punctuation puzzle.
 * - **`<query> = ?`** (the original form, kept for Calca-style
 *   compatibility — see `OTHER_APPS_FEATURE_AUDIT.md`'s Calca section),
 *   e.g. `distance to the moon = ?`. Less discoverable (a bare trailing
 *   `= ?` doesn't read as "ask a question" the way a leading verb does),
 *   but harmless to keep alongside the clearer form — this package has no
 *   opinion about which one a host's users end up preferring.
 *
 * SoulverCore's own version of this feature calls out to Wolfram|Alpha;
 * there is no free equivalent of comparable quality, so — same
 * pluggable-provider approach as `packages/stocks` — a host supplies
 * `answerQuery` via {@link createKnowledgePackage}'s `config` argument. No
 * config -> every query resolves to a clearly-worded
 * `KNOWLEDGE_NOT_CONFIGURED` error `Value`, never a hallucinated/guessed
 * answer.
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
 * terminated (or introduced) by a fixed marker, gets shipped to an
 * external function verbatim" — `distance to the moon` is not valid Solve
 * syntax (it would never parse as arithmetic), so it can't be
 * tokenized-then-parsed the normal way at all.
 *
 * The fix lives one layer below the parser: `ExpressionLexer.ts` gained a
 * new, generic extension point, `LexerVocabulary.rawLinePatterns` (see
 * its doc comment there for the full design). A `rawLinePatterns` rule
 * tests the RAW line text — before any per-character tokenization — and
 * if it matches, the whole line becomes ONE synthetic token whose value
 * is the matched capture group, verbatim. This package is that
 * mechanism's reference/motivating use.
 *
 * **Why `search:`/`ask:`/`google:` require a literal trailing colon, not
 * just a following space**: without it, `search 5` (a line reading the
 * plain variable `search` — legitimately assignable via `:search = 5`,
 * since these are ordinary lowercase words, not reserved — followed by
 * what would otherwise be implicit-multiply-adjacent text) would be
 * silently hijacked into a knowledge query for `"5"` instead of failing
 * or reading the variable. Requiring `:` immediately after the keyword
 * (`search:`, not `search `) is not valid syntax ANYWHERE else in this
 * grammar, so it introduces zero ambiguity with a real `:name = value`
 * variable of the same name — see the regression test guarding this
 * exact scenario.
 *
 * No existing Solve syntax uses a bare `= ?` marker either (the
 * codebase's other "possibilities" feature, `cm to ?`, is a different
 * token shape — `TO QUESTION`, not `EQUALS QUESTION` — see
 * `packages/uom/normalizer/PossibilitiesNormalizerRule.ts`), so neither
 * form claims any ambiguity with existing grammar; both only activate for
 * lines a host has opted into via this package in the first place.
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
				// Preferred: a clear leading verb + mandatory colon (see this
				// file's own doc comment for why the colon isn't optional).
				{ pattern: /^(?:search|ask|google)\s*:\s*(.+)$/i, tokenType: "KNOWLEDGE_QUERY" },
				// Original Calca-style trailing marker, kept for compatibility.
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
