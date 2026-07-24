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
 * Classification happens at the LEXER stage, before the normalizer runs
 * (normalization — phrase fusion, implicit multiply, and package-specific
 * rules — happens later, only on the real evaluation path). A package's
 * lexer-level custom token types (e.g. a custom keyword) are recognized
 * here exactly as evaluation would see them. A package's *normalizer*-fused
 * synthetic tokens (e.g. OSRS's GAME_ITEM, built by fusing several
 * consecutive IDENT tokens against an item-name trie) are NOT — this
 * service still shows the pre-fusion IDENT tokens individually for those.
 * `ISolvePackage.tokenCategories` entries for normalizer-only token types
 * are still valid, correct registrations (queryable via getTokenCategory)
 * — they just won't currently be reachable through this lexer-only
 * classification path. Folding normalization in would require running it
 * per keystroke on the highlighting path too, which needs its own careful
 * design (span recomputation for fused multi-token ranges, in particular)
 * rather than a quick addition here.
 *
 * Lexing alone is NOT sufficient to decide "recognized", though: a run of
 * plain-English words ("My name is ron") lexes into a sequence of
 * individually-valid IDENT tokens with no grammar tying them together —
 * every word "recognized" at the token level, but the line as a whole is
 * not something the engine would ever accept as an expression. Surfacing
 * per-token colors for that case looks like the editor mistook prose for
 * code. So a line's tokens are only surfaced once the line as a whole
 * parses successfully (via `ExpressionEngine.compileExpression` — the same
 * parse pipeline, and the same bytecode cache, real evaluation uses; no
 * separate/duplicated grammar check). A single bare word ("hello", a valid
 * variable reference) or a keyword-only line ("pi") still parses and still
 * highlights — only genuinely ungrammatical text is suppressed.
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

		const lexer = this.engine.getLexer();
		const lexed = lexer.getHighlightTokens(lineText);
		if (lexed.length === 0) {
			this.putCache(lineNumber, lineText, []);
			return [];
		}

		const classification = lexer.classifyLine(lineText);
		const tokens: SemanticToken[] = [];

		if (classification.hasInlineSolve) {
			// A line can mix markdown prose with one or more embedded
			// `s`...`` expressions. Only the text actually inside a
			// well-formed marker is a recognized expression — surrounding
			// prose lexes into individually-valid tokens too (see the class
			// doc comment) but is never something the engine would parse,
			// so it's excluded token-by-token via span membership rather
			// than gating the whole line pass/fail.
			const validSpans = lexer
				.findInlineSolves(lineText)
				.filter(span => this.parsesAsExpression(span.expression))
				.map(span => ({ from: span.start, to: span.end }));
			for (const token of lexed) {
				if (!token.category) continue;
				const from = token.offset;
				const to = token.offset + token.length;
				if (!validSpans.some(s => from >= s.from && to <= s.to)) continue;
				tokens.push({ from, to, category: token.category });
			}
		} else {
			// Blockquote content is stripped of its "> " prefix before being
			// tokenized (see Lexer.getHighlightTokens) — token offsets are
			// already relative to the stripped text, so the parse check must
			// run against that same substring to match.
			const text = lineText.startsWith("> ") && classification.skip
				? lineText.slice(2)
				: lineText;
			if (this.parsesAsExpression(text)) {
				for (const token of lexed) {
					if (!token.category) continue;
					tokens.push({ from: token.offset, to: token.offset + token.length, category: token.category });
				}
			}
		}

		this.putCache(lineNumber, lineText, tokens);
		return tokens;
	}

	/**
	 * Whether the engine's parser actually accepts a piece of text as a
	 * well-formed expression, not merely whether it lexes into individually
	 * recognized token types — see the class doc comment's prose example.
	 * `compileExpression` is compile-only (lex → normalize → parse → cache
	 * bytecode, no VM execution, no network/async side effects) and reuses
	 * the engine's existing bytecode cache, so text that's already been
	 * evaluated (or previously highlight-checked) is a cache hit here too.
	 */
	private parsesAsExpression(text: string): boolean {
		try {
			this.engine!.compileExpression(text);
			return true;
		} catch {
			return false;
		}
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
