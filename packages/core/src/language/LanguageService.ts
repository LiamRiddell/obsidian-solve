import type { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import type { TokenCategory } from "@solve-js/language/TokenCategory";
import { getTokenCategory } from "@solve-js/language/TokenCategoryMap";
import { knownUnits } from "@solve-js/lexer/units";
import { getMeasure } from "@solve-js/uom/UomConverter";

/** A single classified span within a line — the entire output contract of the language service. */
export interface SemanticToken {
	from: number;
	to: number;
	category: TokenCategory;
}

/** A single completion candidate — the entire output contract of `getCompletions()`. */
export interface CompletionItem {
	label: string;
	/** Reuses the highlighting taxonomy — one adapter can serve both features. */
	category: TokenCategory;
	/** e.g. a unit's measure ("length"), or the category name for keywords/functions. */
	detail?: string;
}

/** Completion results are capped — a document-wide candidate pool has no reason to return more than this. */
const MAX_COMPLETIONS = 50;

/** Tier ordering for completion results: user-authored variables first, then grammar, then units. */
const CATEGORY_TIER: Partial<Record<TokenCategory, number>> = {
	variable: 0,
	function: 1,
	keyword: 1,
	operator: 1,
	comparison: 1,
	bitwise: 1,
	datetime: 1,
	vector: 1,
	unit: 2,
};

/** Bounded cache size — see the eviction-policy note on `LanguageService.cache`. */
const MAX_CACHED_LINES = 2000;

interface CacheEntry {
	text: string;
	tokens: SemanticToken[];
	// When set, `tokens` is a single bare-identifier token whose validity
	// depends on document-wide DAG state (see the bare-word gate in
	// getSemanticTokens), not just this line's own text — so it can't be
	// cached as a plain pass/fail result the way every other line can. The
	// lex+parse work that produced `tokens` is still cached normally; only
	// the DAG membership check is re-run on every lookup (cache hit or
	// miss alike), since it's cheap (a Set lookup) and the alternative —
	// caching the gated result — would go stale the moment some OTHER
	// line's edit changes what variables exist, with nothing to trigger a
	// re-check of this untouched line.
	bareWordCandidate?: string;
}

export interface LanguageServiceOptions {
	/**
	 * Overrides how the service discovers "variable names known in this
	 * document" — used to legitimize a lone bare identifier line (see
	 * `getSemanticTokens`'s single-token gate) and variable-name
	 * completions (`getCompletions`). Defaults to reading
	 * `engine.getDag().getSnapshot()`, which works for any consumer
	 * sharing one `ExpressionEngine` between evaluation and the language
	 * service (the real Obsidian editor).
	 *
	 * Required for consumers whose language service is backed by a
	 * *different*, non-evaluating engine than the one that actually runs
	 * the document (the playground's dedicated lexing-only engine, whose
	 * own DAG is always empty) — pass a function reading the real
	 * evaluation engine's DAG snapshot instead.
	 */
	variableNameSource?: () => Iterable<string>;
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
 * `IEnginePackage.tokenCategories` entries for normalizer-only token types
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
 * highlights — only genuinely ungrammatical text is suppressed, unless it's
 * a known variable elsewhere in the document (see `variableNameSource`).
 *
 * `getCompletions()` is the other half of this "language server": unlike
 * `getSemanticTokens()`, it's explicitly for *incomplete*, mid-typing text
 * — it deliberately does NOT gate on parse validity (a half-typed
 * expression almost never parses), using simple prefix matching instead.
 *
 * Must be constructed with an already-configured `ExpressionEngine` (one
 * with all currently-relevant packages registered) rather than a bare
 * lexer — reusing an existing engine is both the fast path (no throwaway
 * lexer construction) and the *correct* one: a highlighting-only lexer
 * built independently of the evaluation engine would silently fail to
 * recognize plugin-contributed tokens (e.g. a package's custom keywords)
 * unless it happened to have the identical packages registered.
 */
export class LanguageService {
	private engine: ExpressionEngine | null;
	private variableNameSource: () => Iterable<string>;

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

	// Keyword/unit/package-contributed completion candidates don't depend
	// on any particular line — built lazily on first getCompletions() call
	// and reused after that, since a package registration is the only thing
	// that could ever change this list mid-session (see invalidateCache()).
	// Variable-name candidates are NOT part of this — they're read fresh on
	// every call from variableNameSource(), since those genuinely change on
	// every edit.
	private staticCompletionCandidates: CompletionItem[] | null = null;

	constructor(engine?: ExpressionEngine | null, options?: LanguageServiceOptions) {
		this.engine = engine ?? null;
		this.variableNameSource = options?.variableNameSource ?? (() => this.defaultVariableNames());
	}

	private defaultVariableNames(): Iterable<string> {
		if (!this.engine) return [];
		const snapshot = this.engine.getDag().getSnapshot();
		const names = new Set<string>(Object.keys(snapshot.consumers));
		for (const written of Object.values(snapshot.writes)) {
			for (const name of written) names.add(name);
		}
		return names;
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
			if (cached.bareWordCandidate !== undefined) {
				return this.isKnownVariable(cached.bareWordCandidate) ? cached.tokens : [];
			}
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

		// A lone bare word ("hello") is exactly as ambiguous as a run of
		// prose ("My name is dave") — it happens to parse as a
		// single-identifier variable-reference expression, but that's true
		// of literally any English word, so on its own it isn't "recognized"
		// in any meaningful sense. Sigil-marked variables (":x", "$x") are
		// unaffected — those lex to TWO tokens (sigil + ident), never
		// hitting this single-token check. Keywords ("pi") are unaffected
		// too — their category is "keyword", not "variable". Only surface
		// it once it's an actual known variable elsewhere in the document —
		// checked live (see the `bareWordCandidate` cache field), not baked
		// into the cached result, since another line's edit can make this
		// check flip without this line's own text ever changing.
		if (tokens.length === 1 && tokens[0].category === "variable") {
			const name = lineText.slice(tokens[0].from, tokens[0].to);
			this.putCache(lineNumber, lineText, tokens, name);
			return this.isKnownVariable(name) ? tokens : [];
		}

		this.putCache(lineNumber, lineText, tokens);
		return tokens;
	}

	/**
	 * Completion candidates for the identifier prefix immediately before
	 * `cursorOffset` on `lineText`. Deliberately simple prefix matching, not
	 * parser-driven "what's grammatically valid here" prediction — a
	 * half-typed expression almost never parses, so gating on parse
	 * validity (the way `getSemanticTokens` does) would suppress
	 * completions almost always. This is the safest, fastest option that
	 * still delivers real value.
	 *
	 * Candidates come from three sources: keywords (which already include
	 * function names — see `ExpressionLexer.getKeywords()`'s doc comment)
	 * and units, both static per engine configuration and cached lazily;
	 * package-contributed items (`IEnginePackage.completionItems`), same
	 * cache; and variable names, read fresh from `variableNameSource()` on
	 * every call since those change on every edit.
	 */
	getCompletions(lineText: string, cursorOffset: number): CompletionItem[] {
		const prefixMatch = /[A-Za-z0-9_]+$/.exec(lineText.slice(0, cursorOffset));
		if (!prefixMatch) return [];
		const prefix = prefixMatch[0].toLowerCase();

		if (!this.engine) return [];

		const candidates = this.getStaticCompletionCandidates();
		const variableCandidates: CompletionItem[] = [];
		for (const name of this.variableNameSource()) {
			variableCandidates.push({ label: name, category: "variable" });
		}

		const matches: CompletionItem[] = [];
		for (const item of variableCandidates) {
			if (item.label.toLowerCase().startsWith(prefix)) matches.push(item);
		}
		for (const item of candidates) {
			if (item.label.toLowerCase().startsWith(prefix)) matches.push(item);
		}

		matches.sort((a, b) => {
			const tierDiff = (CATEGORY_TIER[a.category] ?? 3) - (CATEGORY_TIER[b.category] ?? 3);
			if (tierDiff !== 0) return tierDiff;
			return a.label.localeCompare(b.label);
		});

		return matches.slice(0, MAX_COMPLETIONS);
	}

	/** Lazily builds and caches the keyword/unit/package-item candidate list — see `staticCompletionCandidates`. */
	private getStaticCompletionCandidates(): CompletionItem[] {
		if (this.staticCompletionCandidates) return this.staticCompletionCandidates;

		const items: CompletionItem[] = [];
		for (const [word, tokenType] of Object.entries(this.engine!.getLexer().getKeywords())) {
			const category = getTokenCategory(tokenType);
			if (!category) continue;
			items.push({ label: word, category });
		}
		for (const unit of knownUnits) {
			items.push({ label: unit, category: "unit", detail: getMeasure(unit) });
		}
		items.push(...this.engine!.getPackageCompletionItems());

		this.staticCompletionCandidates = items;
		return items;
	}

	private isKnownVariable(name: string): boolean {
		for (const known of this.variableNameSource()) {
			if (known === name) return true;
		}
		return false;
	}

	/**
	 * Whether the engine's parser actually accepts a piece of text as a
	 * well-formed expression, not merely whether it lexes into individually
	 * recognized token types — see the class doc comment's prose example.
	 * `tryCompileExpression` is compile-only (lex → normalize → parse →
	 * cache bytecode, no VM execution, no network/async side effects) and
	 * reuses the engine's existing bytecode cache, so text that's already
	 * been evaluated (or previously highlight-checked) is a cache hit here
	 * too.
	 *
	 * Deliberately calls the non-throwing `tryCompileExpression` rather than
	 * try/catching `compileExpression` — this runs on every visible line on
	 * every keystroke, and the common case for a real markdown document is
	 * lines that DON'T parse (prose), not lines that do. Throwing there would
	 * mean constructing a EngineError (with V8 stack-trace capture) for the
	 * common case instead of the rare one.
	 */
	private parsesAsExpression(text: string): boolean {
		return this.engine!.tryCompileExpression(text);
	}

	private putCache(lineNumber: number, text: string, tokens: SemanticToken[], bareWordCandidate?: string): void {
		if (!this.cache.has(lineNumber) && this.cache.size >= MAX_CACHED_LINES) {
			const oldestKey = this.cache.keys().next().value;
			if (oldestKey !== undefined) this.cache.delete(oldestKey);
		}
		this.cache.set(lineNumber, { text, tokens, bareWordCandidate });
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
	 * Prefer {@link invalidateLines} for ordinary edits. Also rebuilds the
	 * lazily-cached keyword/unit/package-item completion candidates on next
	 * use — the only thing that can change that list mid-session.
	 */
	invalidateCache(): void {
		this.cache.clear();
		this.staticCompletionCandidates = null;
	}
}
