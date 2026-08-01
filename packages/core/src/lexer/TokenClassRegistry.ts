/**
 * TokenClass — Plugin-extensible keyword registration for the Lexer.
 *
 * Providers call `registry.register(tokenClass)` to teach the lexer about
 * their keywords. The registry merges locale keywords, provider keywords,
 * phrase mappings, and unit names into an optimized TokenLookup structure
 * consumed by the Lexer.
 *
 * @example
 * registry.register({
 *   tokenType: 'CARET',
 *   keywords: {},
 *   phrases: { 'to the power of': true, 'power of': true },
 *   priority: 10,
 *   description: 'Exponentiation operators (x^y)',
 * });
 */
export interface TokenClass {
  /** The token type string produced by the lexer (e.g., "FUNC", "PI", "CARET").
   *  Must match a token type that a ParseletRegistry has a parselet for. */
  tokenType: string;

  /** Single-word keywords (case-insensitive). The lexer lowercases input
   *  before lookup, so these should be lowercase. Example:
   *  { sqrt: true, abs: true, sin: true, cos: true } for tokenType "FUNC" */
  keywords: Record<string, boolean>;

  /** Multi-word phrases (case-insensitive). Matched by the built-in PhraseMatcher
   *  via the phrase trie. Example:
   *  { "to the power of": true, "power of": true } for tokenType "CARET" */
  phrases?: Record<string, boolean>;

  /** Priority for conflict resolution. When two TokenClasses register
   *  the same keyword, the higher-priority class wins. Locale keywords
   *  have priority 0 (set via setLocale). Providers should use
   *  priority >= 10 to override locale defaults. Default: 0 */
  priority?: number;

  /** Human-readable description for debugging and introspection */
  description?: string;
}

// ── Phrase Trie ──────────────────────────────────────────────────────────────

/** Trie node for multi-word phrase matching. */
export interface PhraseNode {
  /** Complete phrase token type (null = intermediate node) */
  type?: string;
  children: Map<string, PhraseNode>;
}

// ── TokenLookup — Optimized lookup structure for the Lexer ──────────────────

/**
 * The optimized lookup structure built by TokenClassRegistry.build().
 * Consumed by the Lexer for O(1) keyword → token type lookups and
 * O(word-count) phrase matching.
 */
export interface TokenLookup {
  /** Lowercase keyword → token type. O(1) Map lookup. */
  keywordToType: Map<string, string>;

  /** Phrase trie for multi-word matching. Root node with children maps.
   *  Null if no phrases registered. */
  phraseTrie: PhraseNode | null;

  /** Set of lowercase first-words of all registered phrases.
   *  Used by the lexer to emit IDENT (not a phrase keyword) for words
   *  that start multi-word phrases, deferring to the PhraseMatcher.
   *
   *  Example: "to" is in phraseStartWords because "to the power of" is a phrase.
   *  When the lexer sees "to", it emits IDENT and lets the phrase matcher
   *  combine "to the power of" into a single CARET token.
   *
   *  This prevents plugins from accidentally overriding phrase-start words.
   */
  phraseStartWords: Set<string>;

  /** Case-sensitive unit names for UNIT fallback after keyword lookup fails. */
  unitNames: Set<string>;
}

// ── TokenClassRegistry ───────────────────────────────────────────────────────

/**
 * Central registry for keyword→token-type mappings.
 *
 * Providers register TokenClasses; locales provide keyword maps;
 * units provide a name set. `build()` merges all sources into an
 * optimized TokenLookup consumed by the Lexer.
 *
 * Merge order (later overrides earlier):
 *   1. Locale keywords (priority 0)
 *   2. Provider keywords (sorted by priority ascending — higher priority wins)
 *
 * Unit names are stored separately (checked AFTER keyword lookup fails).
 * Phrases are stored in a trie for O(phrase-length) matching.
 */
export class TokenClassRegistry {
  private classes: TokenClass[] = [];
  private localeKeywordMap: Record<string, string> | null = null;
  private localePhraseMap: Record<string, string> | null = null;
  private unitNames: Set<string> | null = null;

  /**
   * Register a provider's TokenClass. Must be called BEFORE build().
   * Can be called multiple times to add more entries.
   *
   * Built-in token types CANNOT be overridden — throws a EngineError
   * if the TokenClass attempts to register a keyword that conflicts
   * with an already-registered token type.
   */
  register(tokenClass: TokenClass): void {
    this.classes.push(tokenClass);
  }

  /**
   * Unregister all TokenClasses for a given token type.
   * Useful for plugin unload. Requires rebuild() to take effect.
   */
  unregister(tokenType: string): void {
    this.classes = this.classes.filter(c => c.tokenType !== tokenType);
  }

  /**
   * Set the locale's keyword→type map and optional phrase map.
   * Called on locale change. Priority 0 (cannot override providers with higher priority).
   */
  setLocale(keywordMap: Record<string, string>, phraseMap?: Record<string, string>): void {
    this.localeKeywordMap = keywordMap;
    this.localePhraseMap = phraseMap ?? null;
  }

  /**
   * Set the unit name set. Called when unit list changes.
   * Units are stored separately (checked AFTER keyword lookup fails).
   */
  setUnits(unitNames: Set<string>): void {
    this.unitNames = unitNames;
  }

  /**
   * Build the optimized TokenLookup from all registered sources.
   *
   * Merge order (later overrides earlier):
   *   1. Locale keywords (priority 0)
   *   2. Provider classes (sorted by priority ascending)
   *
   * Returns a frozen TokenLookup that the Lexer consumes.
   * Call build() again after register()/setLocale()/setUnits() changes.
   */
  build(): TokenLookup {
    const keywordToType = new Map<string, string>();

    // Layer 1: Locale keywords (priority 0 — lowest)
    if (this.localeKeywordMap) {
      for (const [keyword, tokenType] of Object.entries(this.localeKeywordMap)) {
        keywordToType.set(keyword.toLowerCase(), tokenType);
      }
    }

    // Layer 2: Provider keywords (sorted by priority ascending — higher wins)
    const sorted = [...this.classes].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    for (const tc of sorted) {
      for (const keyword of Object.keys(tc.keywords)) {
        keywordToType.set(keyword.toLowerCase(), tc.tokenType);
      }
    }

    // Build phrase trie from locale + provider phrases
    const phraseTrie = this.buildPhraseTrie();

    // Build phraseStartWords set (first word of every phrase)
    const phraseStartWords = this.buildPhraseStartWords();

    return {
      keywordToType,
      phraseTrie,
      phraseStartWords,
      unitNames: this.unitNames ?? new Set(),
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private buildPhraseTrie(): PhraseNode | null {
    const root: PhraseNode = { children: new Map() };

    // Layer 1: Locale phrases
    if (this.localePhraseMap) {
      for (const [phrase, tokenType] of Object.entries(this.localePhraseMap)) {
        this.insertPhrase(root, phrase.toLowerCase(), tokenType);
      }
    }

    // Layer 2: Provider phrases
    for (const tc of this.classes) {
      if (!tc.phrases) continue;
      for (const phrase of Object.keys(tc.phrases)) {
        this.insertPhrase(root, phrase.toLowerCase(), tc.tokenType);
      }
    }

    return root.children.size > 0 ? root : null;
  }

  private insertPhrase(root: PhraseNode, phrase: string, tokenType: string): void {
    const words = phrase.split(' ');
    let node = root;
    for (const word of words) {
      if (!node.children.has(word)) {
        node.children.set(word, { children: new Map() });
      }
      node = node.children.get(word)!;
    }
    // Only set type if not already set — first-registered (locale) wins
    if (!node.type) {
      node.type = tokenType;
    }
  }

  private buildPhraseStartWords(): Set<string> {
    const startWords = new Set<string>();

    // Locale phrase first words
    if (this.localePhraseMap) {
      for (const phrase of Object.keys(this.localePhraseMap)) {
        const first = phrase.split(' ')[0].toLowerCase();
        startWords.add(first);
      }
    }

    // Provider phrase first words
    for (const tc of this.classes) {
      if (!tc.phrases) continue;
      for (const phrase of Object.keys(tc.phrases)) {
        const first = phrase.split(' ')[0].toLowerCase();
        startWords.add(first);
      }
    }

    return startWords;
  }
}