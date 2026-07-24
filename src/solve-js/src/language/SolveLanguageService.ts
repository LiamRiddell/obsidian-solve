import type { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import type { SolveTokenCategory } from "@solve-js/language/SolveTokenCategory";

/** A single classified span within a line — the entire output contract of the language service. */
export interface SemanticToken {
	from: number;
	to: number;
	category: SolveTokenCategory;
}

/** Bounded cache size — see the eviction-policy note on `SolveLanguageService.cache`. */
const MAX_CACHED_LINES = 2000;

interface CacheEntry {
	text: string;
	tokens: SemanticToken[];
}

/**
 * Editor-agnostic "language server" for solve expressions: turns a line of
 * text into semantic token ranges, using the exact same lexer real
 * evaluation uses (so it only ever classifies what the engine's grammar
 * actually recognizes — never a separate/duplicated tokenizer). No
 * knowledge of CSS, CodeMirror, VS Code, or any other rendering concept
 * lives here — see `language/adapters/` for that.
 *
 * Must be constructed with an already-configured `ExpressionEngine` (one
 * with all currently-relevant packages registered) rather than a bare
 * lexer — reusing an existing engine is both the fast path (no throwaway
 * lexer construction) and the *correct* one: a highlighting-only lexer
 * built independently of the evaluation engine would silently fail to
 * recognize plugin-contributed tokens (e.g. a package's custom keywords)
 * unless it happened to have the identical packages registered.
 */
export class SolveLanguageService {
	private engine: ExpressionEngine | null;

	// Bounded cache keyed by line number ALONE — not `${lineNumber}:${lineText}`
	// as an earlier version of this class did. A line's previous text state is
	// never useful once it changes, so keying on text too was pure waste:
	// every keystroke on a line minted a brand-new, never-reclaimed cache
	// entry (an effective per-keystroke memory leak over a long editing
	// session). Keying on line number alone makes "same line, new text" a
	// cheap overwrite instead.
	//
	// Eviction is oldest-inserted (Map iteration order) when at capacity —
	// mirroring the same bounded-cache pattern ExpressionEngine's own
	// bytecodeCache already uses elsewhere in this codebase. Deliberately
	// NOT an LFU (least-frequently-used) policy: LFU would keep resisting
	// eviction of old, once-popular lines while punishing a line that just
	// scrolled into view (frequency 1) — the opposite of what a "currently
	// visible" cache should prioritize.
	private cache = new Map<number, CacheEntry>();

	constructor(engine?: ExpressionEngine | null) {
		this.engine = engine ?? null;
	}

	/**
	 * Classify every recognized token on one line.
	 *
	 * @param lineText - The raw line text (may be a markdown-structural line
	 *   the engine's classifier skips — that's handled by the underlying
	 *   lexer, which returns no tokens for those).
	 * @param lineNumber - 1-based line number, used purely as a cache key.
	 */
	getSemanticTokens(lineText: string, lineNumber: number): SemanticToken[] {
		const cached = this.cache.get(lineNumber);
		if (cached && cached.text === lineText) {
			return cached.tokens;
		}

		if (!this.engine) {
			// No engine available (e.g. a consumer that hasn't wired one up yet)
			// — no highlighting, not an error.
			return [];
		}

		const lexed = this.engine.getLexer().getHighlightTokens(lineText);
		const tokens: SemanticToken[] = [];
		for (const token of lexed) {
			if (!token.category) continue;
			tokens.push({ from: token.offset, to: token.offset + token.length, category: token.category });
		}

		this.putCache(lineNumber, lineText, tokens);
		return tokens;
	}

	private putCache(lineNumber: number, text: string, tokens: SemanticToken[]): void {
		if (!this.cache.has(lineNumber) && this.cache.size >= MAX_CACHED_LINES) {
			const oldestKey = this.cache.keys().next().value;
			if (oldestKey !== undefined) this.cache.delete(oldestKey);
		}
		this.cache.set(lineNumber, { text, tokens });
	}

	/**
	 * Evict specific lines (e.g. the lines actually touched by a CodeMirror
	 * change set) instead of the whole cache — the surgical counterpart to
	 * {@link invalidateCache}, letting a single-line edit stay cheap even in
	 * a large document: every other cached line is untouched and still hits
	 * on the next call.
	 */
	invalidateLines(lineNumbers: Iterable<number>): void {
		for (const lineNumber of lineNumbers) {
			this.cache.delete(lineNumber);
		}
	}

	/**
	 * Full cache clear. Reserved for cases with no meaningful "which lines
	 * changed" (e.g. the document was swapped wholesale, or a package was
	 * registered/unregistered mid-session, changing what categories exist).
	 * Prefer {@link invalidateLines} for ordinary edits.
	 */
	invalidateCache(): void {
		this.cache.clear();
	}
}
