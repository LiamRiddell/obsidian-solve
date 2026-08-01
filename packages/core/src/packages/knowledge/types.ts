/**
 * Configuration for {@link createKnowledgePackage} — see
 * `KnowledgePackage.ts`'s module doc for the "bring your own answer
 * engine" rationale (same pluggable-provider approach as `packages/stocks`).
 */
export interface KnowledgePackageConfig {
	/**
	 * Answer a free-text query verbatim (e.g. "distance to the moon",
	 * captured from `distance to the moon = ?`) and return a plain-text
	 * answer string. Required for `<query> = ?` to return real data — when
	 * omitted, that expression resolves to an honest `KNOWLEDGE_NOT_CONFIGURED`
	 * error `Value`, never a hallucinated/guessed answer.
	 */
	answerQuery?: (query: string, signal: AbortSignal) => Promise<string>;

	/**
	 * TanStack Query staleTime for answered queries, in ms. Default 5
	 * minutes (matches `createQueryResolver`'s own default) — most
	 * knowledge-style facts ("distance to the moon") don't change
	 * meaningfully within a session, but a short-ish default avoids
	 * treating a genuinely time-sensitive answer (e.g. "population of
	 * Tokyo = ?") as permanently fixed.
	 */
	staleTimeMs?: number;
}
