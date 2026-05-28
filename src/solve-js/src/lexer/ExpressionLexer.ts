import { Token } from '@solve-js/lexer/Token';
import { knownUnits } from '@solve-js/lexer/units';
import { getLocale, type ILocale } from '@solve-js/constants/locales';
import { ErrorFactory } from '@solve-js/errors/UnifiedErrorFramework';

// ── Markdown line classification (Phase B) ──────────────────────────────

export type MarkdownLineType =
  | 'expression'
  | 'heading'
  | 'blockquote'
  | 'list'
  | 'code_fence'
  | 'math_fence'
  | 'table'
  | 'table_separator'
  | 'hr'
  | 'wikilink'
  | 'comment'
  | 'empty';

export interface LineClassification {
  /** The type of this markdown line */
  type: MarkdownLineType;
  /** Whether this line should be skipped (no expression evaluation) */
  skip: boolean;
  /** Whether the line contains inline solve markers (`s`...``) */
  hasInlineSolve: boolean;
}

/** Inline solve position with precise coordinates */
export interface InlineSolveSpan {
  /** Character offset of the `s`` marker */
  start: number;
  /** Character offset past the closing `` ` `` */
  end: number;
  /** The expression text between the backticks */
  expression: string;
  /** 1-based column of the `s`` marker */
  columnNumber: number;
}

/**
 * Result from a single line processed by scanDocument().
 * Combines line classification, tokenized tokens, and inline solve spans
 * into a single structure — eliminating the need for separate classifyLine(),
 * findInlineSolves(), and per-line Lexer.reset() calls.
 */
export interface ScanLineResult {
  /** The raw line text (without trailing newline). */
  text: string;
  /** 1-based line number within the document. */
  lineNumber: number;
  /** Character offset of the line start within the document. */
  startOffset: number;
  /** Character offset of the line end (before newline). */
  endOffset: number;
  /** The line classification. */
  classification: LineClassification;
  /** Tokenized tokens (empty array if line is skipped). */
  tokens: Token[];
  /** Inline solve spans found in this line (empty if none). */
  inlineSolves: InlineSolveSpan[];
}

// ── Character class constants ─────────────────────────────────────────────
// Used as the result of the CHAR_CLASS lookup table. V8 compiles the
// outer switch on these small integer constants into a jump table.
const enum CharClass {
  SKIP       = 0,  // Invalid / control / unicode fallback
  WHITESPACE = 1,  // space, tab, \n, \r
  DIGIT      = 2,  // 0-9
  ALPHA      = 3,  // a-z, A-Z, _
  DOT        = 4,  // . (could be decimal point or DOT token)
  OPERATOR   = 5,  // + - * / ^ % ( ) [ ] { } , : ; = ? & | ~ ! < >
  QUOTE      = 6,  // "
  HASH       = 7,  // # (comment)
  DOLLAR     = 8,  // $
  POUND      = 9,  // £ (U+00A3)
  EURO       = 10, // € (U+20AC)
  BACKTICK   = 11, // `
}

// ── Static character class table (built once at module load) ──────────────
function buildCharClassTable(): Uint8Array {
  const table = new Uint8Array(128);

  // Digits 0-9
  for (let i = 48; i <= 57; i++) table[i] = CharClass.DIGIT;

  // Uppercase A-Z
  for (let i = 65; i <= 90; i++) table[i] = CharClass.ALPHA;

  // Lowercase a-z
  for (let i = 97; i <= 122; i++) table[i] = CharClass.ALPHA;

  // Underscore
  table[95] = CharClass.ALPHA;

  // Dot
  table[46] = CharClass.DOT;

  // Whitespace
  table[32] = CharClass.WHITESPACE;  // space
  table[9]  = CharClass.WHITESPACE;  // tab
  table[10] = CharClass.WHITESPACE;  // \n
  table[13] = CharClass.WHITESPACE;  // \r

  // Operators / punctuation
  table[33] = CharClass.OPERATOR;  // !
  table[37] = CharClass.OPERATOR;  // %
  table[38] = CharClass.OPERATOR;  // &
  table[40] = CharClass.OPERATOR;  // (
  table[41] = CharClass.OPERATOR;  // )
  table[42] = CharClass.OPERATOR;  // *
  table[43] = CharClass.OPERATOR;  // +
  table[44] = CharClass.OPERATOR;  // ,
  table[45] = CharClass.OPERATOR;  // -
  table[47] = CharClass.OPERATOR;  // /
  table[58] = CharClass.OPERATOR;  // :
  table[59] = CharClass.OPERATOR;  // ;
  table[60] = CharClass.OPERATOR;  // <
  table[61] = CharClass.OPERATOR;  // =
  table[62] = CharClass.OPERATOR;  // >
  table[63] = CharClass.OPERATOR;  // ?
  table[91] = CharClass.OPERATOR;  // [
  table[93] = CharClass.OPERATOR;  // ]
  table[94] = CharClass.OPERATOR;  // ^
  table[123] = CharClass.OPERATOR; // {
  table[124] = CharClass.OPERATOR; // |
  table[125] = CharClass.OPERATOR; // }
  table[126] = CharClass.OPERATOR; // ~

  // Other
  table[34] = CharClass.QUOTE;    // "
  table[35] = CharClass.HASH;     // #
  table[36] = CharClass.DOLLAR;   // $
  table[96] = CharClass.BACKTICK; // `

  return table;
}

// ── Monomorphic Token class ───────────────────────────────────────────────
// V8 assigns a single stable HiddenClass because all properties are
// initialized in the constructor and never added/removed afterwards.
// This enables fast property access (inline cache hits) and allows
// allocation in V8's nursery (cheap GC).
// ── Monomorphic Token class ───────────────────────────────────────────────
export class LexerToken implements Token {
  constructor(
    public type: string,
    public value: string,
    public text: string,
    public offset: number,
    public lineBreaks: number,
    public line: number,
    public col: number,
  ) {}
}

// ── Two-character operator lookup ─────────────────────────────────────────
// Maps first-char → (second-char → token type). Used for operators like
// ==, !=, >=, <=, **, <<, >>.
interface TwoCharOpMap {
  [firstChar: number]: { [secondChar: number]: string };
}
const TWO_CHAR_OPS: TwoCharOpMap = {
  61: { 61: 'EQUALITY' },  // ==
  33: { 61: 'NEQ' },       // !=
  62: { 61: 'GTE' },       // >=
  60: { 61: 'LTE' },       // <=
  // Note: ** is NOT a single token — the existing moo lexer emits two
  // separate STAR tokens, and the parser consumes them that way.
  // 42: { 42: 'EXPONENT' },  // ** — disabled for moo compatibility
};
// Note: LSHIFT (<<) and RSHIFT (>>) are handled separately because
// 60 is also used for LTE, so we check LTE first then LSHIFT.

// ── Single-character operator lookup ──────────────────────────────────────
const OP_MAP: Record<number, string> = {
  43: 'PLUS',     // +
  45: 'MINUS',    // -
  42: 'STAR',     // *
  47: 'SLASH',    // /
  94: 'CARET',    // ^
  37: 'PERCENT',  // %
  40: 'LPAREN',   // (
  41: 'RPAREN',   // )
  91: 'LBRACKET', // [
  93: 'RBRACKET', // ]
  123: 'LBRACE',  // {
  125: 'RBRACE',  // }
  44: 'COMMA',    // ,
  58: 'COLON',    // :
  59: 'SEMICOLON',// ;
  61: 'EQUALS',   // =
  63: 'QUESTION', // ?
  33: 'BANG',     // !
  38: 'BIT_AND',  // &
  124: 'BIT_OR',  // |
  126: 'BIT_NOT', // ~
};

// ── Phrase entry — multi-word token pattern ──────────────────────────────
export interface PhraseEntry {
  /** The full phrase as a lowercase string */
  phrase: string;
  /** The token type to emit when matched */
  type: string;
}

// ── Phrase Trie ────────────────────────────────────────────────────────
// Each node in the trie represents a word boundary. The root's children
// are the first words of all phrases. A `type` field indicates a complete
// phrase. Traversal is O(word-count) instead of O(phrases×words).
interface PhraseTrieNode {
  type?: string;
  children: Map<string, PhraseTrieNode>;
}

/**
 * Plugin interface for extending the ExpressionLexer with custom tokens.
 *
 * Plugins can register:
 * - `keywords`: Map identifier strings to custom token types (checked after locale keywords).
 * - `operators`: Map multi-character operator sequences to custom token types.
 * - `phrases`: Map multi-word patterns (e.g., "price of") to custom token types.
 * - `units`: Register additional unit identifiers (checked alongside built-in units).
 *
 * All registrations are additive — built-in patterns still work.
 */
export interface LexerPlugin {
  /**
   * Keyword → tokenType mappings. Each key is a lowercase identifier that,
   * when encountered, will emit the specified token type instead of IDENT.
   * These are checked AFTER the locale's built-in keywordMap, so locale
   * keywords take priority.
   */
  keywords?: Record<string, string>;

  /**
   * Multi-character operator → tokenType mappings. Each key is the exact
   * character sequence (e.g., "::", "->", "=>") and the value is the token
   * type to emit. Two-character operators take priority during matching.
   * Built-in operators (==, !=, >=, <=, <<, >>) always take priority.
   */
  operators?: Record<string, string>;

  /**
   * Multi-word phrase patterns. Each entry is a { phrase, type } pair where
   * `phrase` is the lowercase multi-word phrase (e.g., "price of") and
   * `type` is the token type to emit when matched. Greedy matching:
   * the longest matching phrase wins. Built-in phrases take priority.
   */
  phrases?: PhraseEntry[];

  /**
   * Additional unit identifiers to recognize (e.g., "gp", "osrs", "tile").
   * These are checked alongside the built-in `knownUnits` set.
   */
  units?: string[];
}

// Pre-compute phrase list — these are the multi-word expressions
// handled as compound tokens (e.g., "to the power of", "increase by").
function buildPhraseList(): PhraseEntry[] {
  return [
    { phrase: 'to the power of', type: 'CARET' }, // 5 words: to the power of
    { phrase: 'power of', type: 'CARET' },         // 2 words: power of
    { phrase: 'increase by', type: 'INCREASE_BY' },// 2 words: increase by
    { phrase: 'decrease by', type: 'DECREASE_BY' },// 2 words: decrease by
    { phrase: 'times by', type: 'TIMES_BY' },      // 2 words: times by
    { phrase: 'multiply by', type: 'MULTIPLY_BY' },// 2 words: multiply by
    { phrase: 'divide by', type: 'DIVIDE_BY' },    // 2 words: divide by
  ];
}

// ── ExpressionLexer ───────────────────────────────────────────────────────
export class ExpressionLexer {
  private static readonly CHAR_CLASS = buildCharClassTable();
  private static readonly PHRASES = buildPhraseList();

  // Instance state
  private input: string = '';
  private pos: number = 0;
  private len: number = 0;

  // Line / column tracking (1-indexed)
  private line: number = 1;
  private lineStartPos: number = 0;

  // Keyword map: lowercase identifier → token type
  private keywordMap: Map<string, string>;

  // Plugin-extensible keyword map (merged with locale keywordMap)
  private pluginKeywordMap: Map<string, string> = new Map();

  // Plugin-extensible two-char operators: firstChar → (secondChar → tokenType)
  private pluginOperators: Map<number, Map<number, string>> = new Map();

  // Plugin-extensible phrases (merged with built-in PHRASES)
  private pluginPhrases: PhraseEntry[] = [];

  // Plugin-extensible units (merged with knownUnits)
  private pluginUnits: Set<string> = new Set();

  // Fast-path guards: skip plugin lookups entirely when no plugins registered
  // V8 can predict these as always-false in the no-plugin case, eliminating
  // the branch and associated hash-map access from the hot path.
  private hasPluginUnits = false;
  private hasPluginKeywords = false;
  private hasPluginOps = false;
  private hasPluginPhrases = false;

  // Phrase trie: O(word-count) lookup vs O(phrases×words) linear scan.
  // Merges built-in PHRASES with pluginPhrases. Rebuilt on register/unregister.
  private phraseTrie: PhraseTrieNode;

  // Locale for function-identifier lookups
  private localeCode: string;
  private locale: ILocale;

  constructor(localeCode = 'en') {
    this.localeCode = localeCode;
    this.locale = getLocale(localeCode);
    this.keywordMap = new Map<string, string>();
    for (const [k, v] of Object.entries(this.locale.keywordMap)) {
      this.keywordMap.set(k.toLowerCase(), v);
    }
    this.phraseTrie = ExpressionLexer.buildPhraseTrie(ExpressionLexer.PHRASES, []);
  }

  /**
   * Build a word-level trie from built-in + plugin phrases.
   * O(total-words) construction. Used at init and on plugin register/unregister.
   *
   * NOTE: Uses const + narrowing (existing) instead of let child: PhraseTrieNode | undefined
   * because TypeScript's control flow analysis cannot properly track recursive types
   * through mutable variable reassignment.
   */
  private static buildPhraseTrie(
    builtins: PhraseEntry[],
    plugins: PhraseEntry[],
  ): PhraseTrieNode {
    const root: PhraseTrieNode = { children: new Map() };
    const all = builtins.concat(plugins);
    for (const entry of all) {
      const words = entry.phrase.split(' ');
      let node: PhraseTrieNode = root;
      for (const word of words) {
        const existing = node.children.get(word);
        if (existing) {
          node = existing;
        } else {
          const newNode: PhraseTrieNode = { children: new Map() };
          node.children.set(word, newNode);
          node = newNode;
        }
      }
      // Only set type if not already set — built-ins (processed first) take priority
      if (!node.type) {
        node.type = entry.type;
      }
    }
    return root;
  }

  /**
   * Register a plugin to extend the lexer with custom tokens.
   *
   * All registrations are additive — built-in patterns still work.
   * Keywords, operators, phrases, and units from the plugin are merged
   * with existing ones. Calling multiple times adds more entries.
   *
   * Built-in tokens CANNOT be overridden. Throws a SolveError if the
   * plugin attempts to register a keyword, operator, phrase, or unit
   * that conflicts with a built-in one.
   */
  registerPlugin(plugin: LexerPlugin): void {
    if (plugin.keywords) {
      this.hasPluginKeywords = true;
      for (const [keyword, tokenType] of Object.entries(plugin.keywords)) {
        const lower = keyword.toLowerCase();
        // Guard: prevent overriding built-in locale keywords
        if (this.keywordMap.has(lower)) {
          throw ErrorFactory.config(
            'PLUGIN_KEYWORD_COLLISION',
            `Plugin keyword "${keyword}" conflicts with built-in keyword ` +
            `(type: ${this.keywordMap.get(lower)}). Built-in keywords cannot be overridden.`,
            { keyword, builtinType: this.keywordMap.get(lower) }
          );
        }
        this.pluginKeywordMap.set(lower, tokenType);
      }
    }

    if (plugin.operators) {
      this.hasPluginOps = true;
      for (const [chars, tokenType] of Object.entries(plugin.operators)) {
        // Only support 2-char operators for the fast path
        if (chars.length === 2) {
          const first = chars.charCodeAt(0);
          const second = chars.charCodeAt(1);

          // Guard: prevent overriding built-in two-char operators (==, !=, >=, <=)
          const builtInSecondMap = TWO_CHAR_OPS[first];
          if (builtInSecondMap && builtInSecondMap[second] !== undefined) {
            throw ErrorFactory.config(
              'PLUGIN_OPERATOR_COLLISION',
              `Plugin operator "${chars}" conflicts with built-in operator ` +
              `(type: ${builtInSecondMap[second]}). Built-in operators cannot be overridden.`,
              { operator: chars, builtinType: builtInSecondMap[second] }
            );
          }
          // Guard: prevent overriding LSHIFT (<<) and RSHIFT (>>)
          if (first === 60 && second === 60) {
            throw ErrorFactory.config(
              'PLUGIN_OPERATOR_COLLISION',
              `Plugin operator "${chars}" conflicts with built-in operator ` +
              `(type: LSHIFT). Built-in operators cannot be overridden.`,
              { operator: chars, builtinType: 'LSHIFT' }
            );
          }
          if (first === 62 && second === 62) {
            throw ErrorFactory.config(
              'PLUGIN_OPERATOR_COLLISION',
              `Plugin operator "${chars}" conflicts with built-in operator ` +
              `(type: RSHIFT). Built-in operators cannot be overridden.`,
              { operator: chars, builtinType: 'RSHIFT' }
            );
          }
          // Guard: prevent overriding comment sequences (//)
          // In expression mode, // goes through tokenizeOperator() (since /
          // is CharClass.OPERATOR). In markdown mode, classifyLine() skips
          // lines starting with //. Allowing plugins to override // would
          // break comment handling in both modes.
          if (first === 47 && second === 47) {
            throw ErrorFactory.config(
              'PLUGIN_OPERATOR_COLLISION',
              `Plugin operator "${chars}" conflicts with built-in comment sequence. ` +
              `Comment sequences cannot be overridden.`,
              { operator: chars, builtinType: 'COMMENT' }
            );
          }

          let inner = this.pluginOperators.get(first);
          if (!inner) {
            inner = new Map();
            this.pluginOperators.set(first, inner);
          }
          inner.set(second, tokenType);
        }
        // Note: >2 char operators could be supported in future via
        // a separate trie-based lookup if needed.
      }
    }

    if (plugin.phrases) {
      this.hasPluginPhrases = true;
      for (const entry of plugin.phrases) {
        const lowerPhrase = entry.phrase.toLowerCase();
        // Guard: prevent overriding built-in phrases
        for (let i = 0; i < ExpressionLexer.PHRASES.length; i++) {
          if (ExpressionLexer.PHRASES[i].phrase === lowerPhrase) {
            throw ErrorFactory.config(
              'PLUGIN_PHRASE_COLLISION',
              `Plugin phrase "${entry.phrase}" conflicts with built-in phrase ` +
              `(type: ${ExpressionLexer.PHRASES[i].type}). Built-in phrases cannot be overridden.`,
              { phrase: entry.phrase, builtinType: ExpressionLexer.PHRASES[i].type }
            );
          }
        }
        this.pluginPhrases.push({
          phrase: lowerPhrase,
          type: entry.type,
        });
      }
      // Rebuild phrase trie to include new plugin phrases
      this.phraseTrie = ExpressionLexer.buildPhraseTrie(ExpressionLexer.PHRASES, this.pluginPhrases);
    }

    if (plugin.units) {
      this.hasPluginUnits = true;
      for (const unit of plugin.units) {
        // Guard: prevent overriding built-in units
        if (knownUnits.has(unit)) {
          throw ErrorFactory.config(
            'PLUGIN_UNIT_COLLISION',
            `Plugin unit "${unit}" conflicts with a built-in unit. ` +
            `Built-in units cannot be overridden.`,
            { unit }
          );
        }
        this.pluginUnits.add(unit);
      }
    }
  }

  /**
   * Unregister a plugin, removing its custom tokens from the lexer.
   *
   * This is the inverse of registerPlugin(). All keywords, operators,
   * phrases, and units registered by the plugin are removed. After
   * unregistration, those tokens will revert to their default behavior
   * (e.g., keywords become IDENT, operators become ERROR).
   *
   * Calling unregisterPlugin with a plugin that was never registered
   * is safe — it simply has no effect.
   *
   * @param plugin - The same plugin object passed to registerPlugin().
   */
  unregisterPlugin(plugin: LexerPlugin): void {
    if (plugin.keywords) {
      for (const keyword of Object.keys(plugin.keywords)) {
        this.pluginKeywordMap.delete(keyword.toLowerCase());
      }
      this.hasPluginKeywords = this.pluginKeywordMap.size > 0;
    }

    if (plugin.operators) {
      for (const chars of Object.keys(plugin.operators)) {
        if (chars.length === 2) {
          const first = chars.charCodeAt(0);
          const second = chars.charCodeAt(1);
          const inner = this.pluginOperators.get(first);
          if (inner) {
            inner.delete(second);
            if (inner.size === 0) {
              this.pluginOperators.delete(first);
            }
          }
        }
      }
      this.hasPluginOps = this.pluginOperators.size > 0;
    }

    if (plugin.phrases) {
      for (const entry of plugin.phrases) {
        const lowerPhrase = entry.phrase.toLowerCase();
        const idx = this.pluginPhrases.findIndex(p => p.phrase === lowerPhrase);
        if (idx !== -1) {
          this.pluginPhrases.splice(idx, 1);
        }
      }
      this.hasPluginPhrases = this.pluginPhrases.length > 0;
      // Rebuild phrase trie without the removed plugin phrases
      this.phraseTrie = ExpressionLexer.buildPhraseTrie(ExpressionLexer.PHRASES, this.pluginPhrases);
    }

    if (plugin.units) {
      for (const unit of plugin.units) {
        this.pluginUnits.delete(unit);
      }
      this.hasPluginUnits = this.pluginUnits.size > 0;
    }
  }

  reset(input: string): void {
    this.input = input;
    this.pos = 0;
    this.len = input.length;
    this.line = 1;
    this.lineStartPos = 0;
  }

  /**
   * Scan a full document text in a single pass, classifying each line and
   * tokenizing non-skipped lines.
   *
   * Replaces the separate classifyLine() + findInlineSolves() + per-line
   * reset() + tokenizeAll() pattern with a single character-by-character
   * walk through the entire document. Key benefits:
   *
   * - **Single reset()**: `this.pos`, `this.len`, `this.line`, and
   *   `this.lineStartPos` are set once for the whole document, not per-line.
   * - **Single classification**: classifyLine() runs once per line inline;
   *   skipped lines are jumped over without tokenization.
   * - **Shared tokenization**: Non-skipped lines are tokenized using the
   *   existing state machine, yielding Token[] without per-line reset().
   * - **Inline solve detection**: findInlineSolves() is called only for
   *   lines that classifyLine() marks as having inline solves.
   *
   * Tokenization is scoped to each line by temporarily restricting
   * `this.len` to the line end position, so the [Symbol.iterator]
   * generator naturally stops at the line boundary. After tokenization,
   * `this.len` is restored and `this.pos` advances past the newline.
   *
   * @param text The full document text (with newlines).
   * @returns Array of ScanLineResult, one per line, in document order.
   */
  scanDocument(text: string): ScanLineResult[] {
    this.input = text;
    this.pos = 0;
    this.len = text.length;
    this.line = 1;
    this.lineStartPos = 0;

    const results: ScanLineResult[] = [];
    const input = this.input;
    const docLen = this.len;

    while (this.pos < docLen) {
      const lineStart = this.pos;

      // ── Find end of current line (newline boundary) ───────────────
      let lineEnd = this.pos;
      while (lineEnd < docLen) {
        const cc = input.charCodeAt(lineEnd);
        if (cc === 10 || cc === 13) break;  // \n or \r
        lineEnd++;
      }

      const lineNumber = this.line;

      // ── Classify the line ─────────────────────────────────────────
      // Uses classifyFromPositions() to read from this.input directly —
      // avoids allocating a substring and keeps classification reads
      // within the same memory region as tokenization.
      const classification = this.classifyFromPositions(lineStart, lineEnd);

      // ── Tokenize non-skipped lines ────────────────────────────────
      let tokens: Token[] = [];
      if (!classification.skip) {
        // Scope tokenization to just this line by temporarily restricting len.
        // The [Symbol.iterator]() generator captures `this.len` at call time,
        // so creating the iterator AFTER setting this.len = lineEnd ensures
        // tokenization stops at the line boundary. After tokenization,
        // this.pos will be at lineEnd (the newline position).
        const savedLen = this.len;
        this.len = lineEnd;
        tokens = Array.from(this);
        this.len = savedLen;
        // this.pos is now at lineEnd — advance past newline below
      }

      // ── Slice line text for result and inline solves ────────────
      // Classification already happened via classifyFromPositions()
      // which reads from this.input directly. The slice here is still
      // needed for ScanLineResult.text and findInlineSolves().
      const lineText = input.slice(lineStart, lineEnd);

      // ── Detect inline solves (only for lines that may have them) ─
      let inlineSolves: InlineSolveSpan[] = [];
      if (classification.hasInlineSolve) {
        inlineSolves = this.findInlineSolves(lineText);
      }

      results.push({
        text: lineText,
        lineNumber,
        startOffset: lineStart,
        endOffset: lineEnd,
        classification,
        tokens,
        inlineSolves,
      });

      // ── Advance past newline ─────────────────────────────────────
      this.pos = lineEnd;
      if (this.pos < docLen) {
        const nlChar = input.charCodeAt(this.pos);
        if (nlChar === 13) {  // \r
          this.pos++;
          if (this.pos < docLen && input.charCodeAt(this.pos) === 10) {
            this.pos++;  // skip \n in \r\n
          }
        } else if (nlChar === 10) {  // \n
          this.pos++;
        }
      }
      this.line++;
      this.lineStartPos = this.pos;
    }

    return results;
  }

  /**
   * Tokenize an expression string into an array of Tokens.
   *
   * Delegates to the lazy [Symbol.iterator]() generator and collects all
   * yielded tokens via Array.from(). For memory-sensitive use cases, prefer
   * iterating the lexer directly with for...of to avoid array allocation.
   *
   * Optimizations:
   *  - CHAR_CLASS jump table (Uint8Array) → switch on small integers
   *  - Direct character-code dispatch (c0 cached pattern)
   *  - Mathematical digit parsing (integer math, not slice+parseFloat)
   *  - Inline operator tokenizer with two-char peek-ahead
   *  - Whitespace eliminated in-lexer (never emitted)
   *  - 0-char and 1-char fast paths
   */
  tokenizeAll(): Token[] {
    return Array.from(this);
  }

  // ── Lazy iterator ─────────────────────────────────────────────────────
  /**
   * Lazy token-by-token generator. Yields each token without allocating an
   * intermediate Token[] array. Supports for...of and spread usage.
   *
   * Usage:
   *   for (const t of lexer) { ... }  // lazy, no array allocation
   *   const tokens = [...lexer];       // materializes via spread
   *   const tokens = lexer.tokenizeAll(); // materializes via Array.from()
   *
   * IMPORTANT: This generator captures `this.len` ONCE at creation time
   * (const len = this.len). `scanDocument()` relies on this behavior to
   * scope tokenization to a single line by temporarily restricting
   * `this.len` to the line end position before creating the iterator.
   * Do NOT refactor to re-read `this.len` mid-loop without also updating
   * `scanDocument()`.
   */
  *[Symbol.iterator](): Generator<Token, void, undefined> {
    const len = this.len;

    // ── 0-char fast path ────────────────────────────────────────────────
    if (len === 0) return;

    // ── 1-char fast path ────────────────────────────────────────────────
    if (len === 1) {
      const c0 = this.input.charCodeAt(0);
      const cc = ExpressionLexer.CHAR_CLASS[c0] ?? CharClass.SKIP;

      switch (cc) {
        case CharClass.DIGIT:
        case CharClass.DOT:
          yield new LexerToken('NUMBER', this.input, this.input, 0, 0, 1, 1);
          break;

        case CharClass.ALPHA: {
          const input = this.input;
          const identLower = input.toLowerCase();
          if (knownUnits.has(input) || (this.hasPluginUnits && this.pluginUnits.has(input))) {
            yield new LexerToken('UNIT', input, input, 0, 0, 1, 1);
          } else {
            const kwType = this.keywordMap.get(identLower);
            if (kwType) {
              yield new LexerToken(kwType, input, input, 0, 0, 1, 1);
            } else if (this.hasPluginKeywords) {
              const pluginKwType = this.pluginKeywordMap.get(identLower);
              yield new LexerToken(pluginKwType || 'IDENT', input, input, 0, 0, 1, 1);
            } else {
              yield new LexerToken('IDENT', input, input, 0, 0, 1, 1);
            }
          }
          break;
        }

        case CharClass.OPERATOR: {
          const opType = OP_MAP[c0];
          if (opType) {
            yield new LexerToken(opType, this.input, this.input, 0, 0, 1, 1);
          }
          break;
        }

        case CharClass.QUOTE:
          // Delegate to tokenizeString for correctness (handles unterminated)
          this.pos = 0;
          yield this.tokenizeString();
          break;

        case CharClass.HASH:
          // Delegate to tokenizeComment for correctness
          this.pos = 0;
          yield this.tokenizeComment();
          break;

        case CharClass.DOLLAR:
          yield new LexerToken('DOLLAR', '$', '$', 0, 0, 1, 1);
          break;

        case CharClass.BACKTICK:
          yield new LexerToken('BACKTICK_OPEN', '`', '`', 0, 0, 1, 1);
          break;

        default: {
          // CharClass.SKIP — includes non-ASCII characters (code >= 128)
          if (c0 === 0x00D7) {  // × → STAR
            yield new LexerToken('STAR', '\u00D7', '\u00D7', 0, 0, 1, 1);
          } else if (c0 === 0x00F7) {  // ÷ → SLASH
            yield new LexerToken('SLASH', '\u00F7', '\u00F7', 0, 0, 1, 1);
          } else if (c0 === 0x2260) {  // ≠ → NEQ
            yield new LexerToken('NEQ', '\u2260', '\u2260', 0, 0, 1, 1);
          } else if (c0 === 0x00A3) {  // £
            yield new LexerToken('POUND', '\u00A3', '\u00A3', 0, 0, 1, 1);
          } else if (c0 === 0x20AC) {  // €
            yield new LexerToken('EURO', '\u20AC', '\u20AC', 0, 0, 1, 1);
          } else if (c0 >= 128) {
            // Unknown unicode — treat as IDENT for forward compatibility
            // (future: Greek letters for math, accented variable names)
            yield new LexerToken('IDENT', this.input, this.input, 0, 0, 1, 1);
          }
          // Unknown ASCII (< 128, SKIP) — silently skipped (same as main loop)
          break;
        }
      }
      return;
    }

    const input = this.input;

    // ── Main tokenization loop ──────────────────────────────────────────
    while (this.pos < len) {
      const c0 = input.charCodeAt(this.pos);
      const cc = ExpressionLexer.CHAR_CLASS[c0] ?? CharClass.SKIP;

      switch (cc) {
        // ── Whitespace — skip entirely, track newlines ────────────────
        case CharClass.WHITESPACE:
          this.pos++;
          if (c0 === 10) {  // \n
            this.line++;
            this.lineStartPos = this.pos;
          } else if (c0 === 13) {  // \r
            this.line++;
            if (this.pos < len && input.charCodeAt(this.pos) === 10) {
              this.pos++;  // skip \n in \r\n
            }
            this.lineStartPos = this.pos;
          }
          break;

        // ── Digit — inline number tokenizer ───────────────────────────
        case CharClass.DIGIT:
          yield this.tokenizeNumber();
          break;

        // ── Alpha / underscore — identifier or keyword ────────────────
        case CharClass.ALPHA:
          yield this.tokenizeIdentifier();
          break;

        // ── Dot — could be decimal (.5) or DOT token ─────────────────
        case CharClass.DOT:
          if (this.pos + 1 < len) {
            const nextCc = ExpressionLexer.CHAR_CLASS[input.charCodeAt(this.pos + 1)] ?? CharClass.SKIP;
            if (nextCc === CharClass.DIGIT) {
              yield this.tokenizeNumber();
            } else {
              const col = this.pos - this.lineStartPos + 1;
              yield new LexerToken('DOT', '.', '.', this.pos, 0, this.line, col);
              this.pos++;
            }
          } else {
            const col = this.pos - this.lineStartPos + 1;
            yield new LexerToken('DOT', '.', '.', this.pos, 0, this.line, col);
            this.pos++;
          }
          break;

        // ── Operator / punctuation ────────────────────────────────────
        case CharClass.OPERATOR:
          yield this.tokenizeOperator();
          break;

        // ── String literal ────────────────────────────────────────────
        case CharClass.QUOTE:
          yield this.tokenizeString();
          break;

        // ── Comment (# or //) ─────────────────────────────────────────
        case CharClass.HASH:
          yield this.tokenizeComment();
          break;

        // ── Dollar sign $ ─────────────────────────────────────────────
        case CharClass.DOLLAR: {
          const col = this.pos - this.lineStartPos + 1;
          yield new LexerToken('DOLLAR', '$', '$', this.pos, 0, this.line, col);
          this.pos++;
          break;
        }

        // ── Backtick ` ───────────────────────────────────────────────
        case CharClass.BACKTICK: {
          const col = this.pos - this.lineStartPos + 1;
          yield new LexerToken('BACKTICK_OPEN', '`', '`', this.pos, 0, this.line, col);
          this.pos++;
          break;
        }

        // ── Non-ASCII characters ─────────────────────────────────────
        default: {
          const col = this.pos - this.lineStartPos + 1;
          if (c0 === 0x00D7) {  // × → STAR
            yield new LexerToken('STAR', '\u00D7', '\u00D7', this.pos, 0, this.line, col);
            this.pos++;
          } else if (c0 === 0x00F7) {  // ÷ → SLASH
            yield new LexerToken('SLASH', '\u00F7', '\u00F7', this.pos, 0, this.line, col);
            this.pos++;
          } else if (c0 === 0x2260) {  // ≠ → NEQ
            yield new LexerToken('NEQ', '\u2260', '\u2260', this.pos, 0, this.line, col);
            this.pos++;
          } else if (c0 === 0x00A3) {  // £
            yield new LexerToken('POUND', '\u00A3', '\u00A3', this.pos, 0, this.line, col);
            this.pos++;
          } else if (c0 === 0x20AC) {  // €
            yield new LexerToken('EURO', '\u20AC', '\u20AC', this.pos, 0, this.line, col);
            this.pos++;
          } else if (c0 >= 128) {
            // Unknown unicode — treat as IDENT for forward compatibility
            // (future: Greek letters for math, accented variable names)
            yield this.tokenizeIdentifier();
          } else {
            // Unknown ASCII — silently skip
            this.pos++;
          }
          break;
        }
      }
    }
  }

  // ── Inline number tokenizer ────────────────────────────────────────────
  /**
   * Character-by-character number parsing.
   *
   * Supports: integers, floats, scientific notation (1.5e10, 1.5e-10),
   * hex (0xFF), binary (0b1010), BigInt suffix (123n), thousands
   * separators (1,234 or 1.234.567).
   *
   * Returns a LexerToken and advances `this.pos` past the number.
   */
  private tokenizeNumber(): Token {
    const input = this.input;
    const len = this.len;
    let pos = this.pos;
    const start = pos;
    const startCol = pos - this.lineStartPos + 1;
    let cc: number;

    // ── Hex literal: 0x / 0X ───────────────────────────────────────────
    if (input.charCodeAt(pos) === 48 && pos + 1 < len) {
      const next = input.charCodeAt(pos + 1);
      if (next === 0x78 || next === 0x58) {  // 'x' or 'X'
        pos += 2;
        while (
          pos < len &&
          ((cc = input.charCodeAt(pos)),
            (cc >= 48 && cc <= 57) || (cc >= 65 && cc <= 70) || (cc >= 97 && cc <= 102))
        ) {
          pos++;
        }
        const text = input.slice(start, pos);
        this.pos = pos;
        return new LexerToken('NUMBER', text, text, start, 0, this.line, startCol);
      }
      // ── Binary literal: 0b / 0B ─────────────────────────────────────
      if (next === 0x62 || next === 0x42) {  // 'b' or 'B'
        pos += 2;
        while (pos < len && ((cc = input.charCodeAt(pos)), cc === 48 || cc === 49)) {
          pos++;
        }
        const text = input.slice(start, pos);
        this.pos = pos;
        return new LexerToken('NUMBER', text, text, start, 0, this.line, startCol);
      }
    }

    let hasIntPart = false;

    // ── Integer part ───────────────────────────────────────────────────
    while (pos < len && ((cc = input.charCodeAt(pos)), cc >= 48 && cc <= 57)) {
      hasIntPart = true;
      pos++;
    }

    // ── Thousands separators — coalesce with digits ────────────────────
    // Pattern: \d{1,3}(?:[.,]\d{3})+  e.g., "1,234" or "1.234.567"
    // Gated on hasIntPart: prevents leading-dot floats (.1234) from being
    // incorrectly consumed as thousands separators.
    while (hasIntPart && pos < len && (input.charCodeAt(pos) === 44 || input.charCodeAt(pos) === 46)) {
      // Verify 3 digits follow
      if (pos + 4 <= len) {
        const d1 = input.charCodeAt(pos + 1);
        const d2 = input.charCodeAt(pos + 2);
        const d3 = input.charCodeAt(pos + 3);
        if (
          d1 >= 48 && d1 <= 57 &&
          d2 >= 48 && d2 <= 57 &&
          d3 >= 48 && d3 <= 57
        ) {
          pos += 4;  // skip separator + 3 digits
          hasIntPart = true;
          continue;
        }
      }
      break;  // not a thousands separator — break out
    }

    // ── Decimal part (.xxx) ───────────────────────────────────────────
    let hasDecimal = false;
    if (pos < len && input.charCodeAt(pos) === 46) {
      if (pos + 1 < len) {
        const nextCc = input.charCodeAt(pos + 1);
        if (nextCc >= 48 && nextCc <= 57) {
          hasDecimal = true;
          pos++;  // skip dot
          while (pos < len && ((cc = input.charCodeAt(pos)), cc >= 48 && cc <= 57)) {
            pos++;
          }
        }
      }
    }

    // ── Exponent (e / E [+-]? \d+) ────────────────────────────────────
    let hasExponent = false;
    if (pos < len) {
      const ec = input.charCodeAt(pos);
      if (ec === 0x65 || ec === 0x45) {  // 'e' or 'E'
        if (pos + 1 < len) {
          const next = input.charCodeAt(pos + 1);
          if (
            (next >= 48 && next <= 57) ||
            next === 43 || next === 45  // + or -
          ) {
            hasExponent = true;
            pos++;  // skip e/E
            if (next === 43 || next === 45) pos++;  // skip sign
            while (pos < len && ((cc = input.charCodeAt(pos)), cc >= 48 && cc <= 57)) {
              pos++;
            }
          }
        }
      }
    }

    // ── BigInt suffix check ────────────────────────────────────────────
    // Only applies to integer literals (no decimal, no exponent).
    if (pos < len && input.charCodeAt(pos) === 110) {  // 'n'
      if (hasIntPart && !hasDecimal && !hasExponent) {
        pos++;
        const text = input.slice(start, pos);
        this.pos = pos;
        return new LexerToken('BIGINT', text, text, start, 0, this.line, startCol);
      }
    }

    // ── Emit NUMBER token ──────────────────────────────────────────────
    const text = input.slice(start, pos);
    this.pos = pos;
    return new LexerToken('NUMBER', text, text, start, 0, this.line, startCol);
  }

  // ── Inline identifier / keyword tokenizer ──────────────────────────────
  /**
   * Reads [a-zA-Z_][a-zA-Z0-9_]* and resolves to:
   *   - A unit type (via knownUnits, case-sensitive)
   *   - A phrase type (multi-word patterns like "to the power of")
   *   - A keyword type (via locale keywordMap, case-insensitive)
   *   - IDENT if none of the above
   *
   * Advances `this.pos` past the identifier or phrase.
   */
  private tokenizeIdentifier(): Token {
    const input = this.input;
    const len = this.len;
    let pos = this.pos;
    const start = pos;
    const startCol = pos - this.lineStartPos + 1;
    let cc: number;

    // Read [a-zA-Z0-9_]*
    while (
      pos < len &&
      ((cc = input.charCodeAt(pos)),
        (cc >= 48 && cc <= 57) ||   // 0-9
        (cc >= 65 && cc <= 90) ||   // A-Z
        (cc >= 97 && cc <= 122) ||  // a-z
        cc === 95)                   // _
    ) {
      pos++;
    }

    const identText = input.slice(start, pos);
    const identLower = identText.toLowerCase();

    // ── Inline solve marker: s` (lowercase 's' followed by backtick) ──
    // Matches the moo rule INLINE_SOLVE_START: { match: /s`/, push: "inline_solve" }
    if (identLower === 's' && pos < len && input.charCodeAt(pos) === 96) {
      pos++;  // consume backtick
      this.pos = pos;
      const fullText = input.slice(start, pos);  // "s`"
      return new LexerToken('INLINE_SOLVE_START', fullText, fullText, start, 0, this.line, startCol);
    }

    // ── Unit lookup (case-sensitive, takes priority over phrases/keywords)
    //
    // Contextual LPAREN lookahead: when a known unit is followed by '('
    // (possibly with whitespace), treat it as a potential function call
    // instead of a unit. This resolves conflicts where an identifier is
    // both a unit (e.g., "min" = minute) and a function (min(3,7) = Math.min).
    // Without this lookahead, min(3,7) tokens as UNIT + LPAREN + ... and
    // the function parselet (registered for FUNC) never matches.
    //
    // IMPORTANT: peek past whitespace only; do NOT consume characters.
    // this.pos must remain at the identifier boundary so the caller's
    // token stream stays in sync.
    //
    // 1) Built-in units
    if (knownUnits.has(identText)) {
      if (!this.isFollowedByLParen(pos)) {
        this.pos = pos;
        return new LexerToken('UNIT', identText, identText, start, 0, this.line, startCol);
      }
      // Fall through: unit followed by '(' → treat as keyword/IDENT
    }
    // 2) Plugin-registered units (skipped when hasPluginUnits=false)
    if (this.hasPluginUnits && this.pluginUnits.has(identText)) {
      if (!this.isFollowedByLParen(pos)) {
        this.pos = pos;
        return new LexerToken('UNIT', identText, identText, start, 0, this.line, startCol);
      }
      // Fall through: unit followed by '(' → treat as keyword/IDENT
    }

    // ── Phrase matching — multi-word patterns (before keyword lookup)
    // This must run before keyword lookup, otherwise phrases like
    // "increase by", "divide by", "to the power of" are unreachable
    // because the first word is always caught as a keyword.
    const phraseResult = this.tryMatchPhrase(input, pos, identLower, identText);
    if (phraseResult) {
      this.pos = phraseResult.endPos;
      return new LexerToken(
        phraseResult.type,
        phraseResult.text,
        phraseResult.text,
        start,
        0,
        this.line,
        startCol,
      );
    }

    // ── Keyword lookup (case-insensitive) ─────────────────────────────
    // 1) Built-in locale keywords take highest priority
    const localeKwType = this.keywordMap.get(identLower);
    if (localeKwType) {
      this.pos = pos;
      return new LexerToken(localeKwType, identText, identText, start, 0, this.line, startCol);
    }

    // 2) Plugin-registered keywords (checked after locale) — a plugin's
    //    keyword can override the default IDENT behavior.
    //    Guarded by hasPluginKeywords: in the no-plugin case, V8 predicts
    //    this branch as never-taken and skips the Map lookup entirely.
    if (this.hasPluginKeywords) {
      const pluginKwType = this.pluginKeywordMap.get(identLower);
      if (pluginKwType) {
        this.pos = pos;
        return new LexerToken(pluginKwType, identText, identText, start, 0, this.line, startCol);
      }
    }

    this.pos = pos;
    return new LexerToken('IDENT', identText, identText, start, 0, this.line, startCol);
  }

  /**
   * Peek past in-expression whitespace (space, tab) from `pos` to check
   * if the next significant character is '('. Used by tokenizeIdentifier()
   * for contextual UNIT-vs-FUNC disambiguation (e.g., "min" is a unit but
   * "min(3,7)" is a function call).
   *
   * Only spaces (32) and tabs (9) are skipped — newlines/CR are
   * intentionally NOT skipped since expressions don't span lines in Solve.
   *
   * Does NOT consume characters — purely a lookahead. Returns false
   * if any non-whitespace, non-'(' character appears before '('.
   *
   * NOTE: The 1-char fast path in [Symbol.iterator]() (around line ~726)
   * has its own unit check WITHOUT this lookahead. Currently harmless
   * since no single-char units conflict with function names, but future
   * single-char unit+function additions would need lookahead there too.
   */
  private isFollowedByLParen(pos: number): boolean {
    const len = this.len;
    let lookPos = pos;
    while (lookPos < len) {
      const cc = this.input.charCodeAt(lookPos);
      if (cc === 40) return true;         // '('
      if (cc !== 32 && cc !== 9) break;   // not whitespace
      lookPos++;
    }
    return false;
  }

  // ── Phrase matcher (trie-based) ───────────────────────────────────────
  /**
   * After reading a first identifier, try to match a multi-word phrase
   * like "to the power of" or "increase by".
   *
   * Uses a word-level trie for O(word-count) lookup instead of the previous
   * O(phrases×words) linear scan. The trie merges built-in and plugin
   * phrases and is rebuilt on register/unregister.
   *
   * Built-in phrases take priority: if both a built-in and plugin phrase
   * share the same trie path, the built-in type (set first) wins.
   *
   * @param firstWordLower - The first word already read (lowercased)
   * @param firstWordOriginal - The first word in original case
   */
  private tryMatchPhrase(
    input: string,
    pos: number,
    firstWordLower: string,
    firstWordOriginal: string,
  ): { type: string; text: string; endPos: number } | null {
    const len = this.len;

    // Start at the first word's trie node
    const startNode: PhraseTrieNode | undefined = this.phraseTrie.children.get(firstWordLower);
    if (!startNode) return null;

    // Check if the first word alone is a complete phrase (single-word phrase)
    // This handles the edge case where a plugin registers a one-word phrase.
    // Must check children.size to avoid matching a prefix of a longer phrase
    // (e.g., matching "power" when "power of" also exists).
    if (startNode.type && startNode.children.size === 0) {
      return { type: startNode.type, text: firstWordOriginal, endPos: pos };
    }

    const wordsOriginal: string[] = [firstWordOriginal];
    let scanPos = pos;
    let current: PhraseTrieNode = startNode;

    // Read additional words separated by single spaces, traversing the trie
    while (scanPos < len) {
      // Must be exactly one space between words
      if (input.charCodeAt(scanPos) !== 32) break;
      scanPos++;
      if (scanPos >= len) break;

      // Read the next word (letters only for phrases)
      const wordStart = scanPos;
      let cc: number;
      while (
        scanPos < len &&
        ((cc = input.charCodeAt(scanPos)),
          (cc >= 65 && cc <= 90) ||   // A-Z
          (cc >= 97 && cc <= 122))    // a-z
      ) {
        scanPos++;
      }

      if (scanPos === wordStart) break;  // no word found

      // Lowercase the word for trie lookup (original case preserved for text)
      const word = input.slice(wordStart, scanPos);
      const wordLower = word.toLowerCase();

      const next: PhraseTrieNode | undefined = current.children.get(wordLower);
      if (!next) break;  // No phrase continues with this word

      wordsOriginal.push(word);
      current = next;

      // If this node is a complete phrase, we have a match
      // Return immediately — built-in phrases are ordered first in the trie
      // so they take priority over plugin phrases at the same path.
      if (current.type) {
        return {
          type: current.type,
          text: wordsOriginal.join(' '),
          endPos: scanPos,
        };
      }
    }

    return null;
  }

  // ── Inline operator tokenizer ─────────────────────────────────────────
  /**
   * Reads an operator/punctuation token.
   * Handles two-char operators (==, !=, >=, <=, **) and the special
   * cases << (LSHIFT) and >> (RSHIFT) which share first-char with LTE/GTE.
   *
   * Advances `this.pos` past the operator.
   */
  private tokenizeOperator(): Token {
    const input = this.input;
    const pos = this.pos;
    const col = pos - this.lineStartPos + 1;
    const c0 = input.charCodeAt(pos);
    const len = this.len;

    // ── Two-character operators ────────────────────────────────────────
    if (pos + 1 < len) {
      const c1 = input.charCodeAt(pos + 1);

      // ==, !=, >=, <=, ** — exact two-char lookup
      const secondMap = TWO_CHAR_OPS[c0];
      if (secondMap) {
        const twoCharType = secondMap[c1];
        if (twoCharType) {
          const text = input.slice(pos, pos + 2);
          this.pos = pos + 2;
          return new LexerToken(twoCharType, text, text, pos, 0, this.line, col);
        }
      }

      // // comment — consume both slashes and read to end of line.
      // This must be checked BEFORE << (LSHIFT) and >> (RSHIFT) because
      // the second slash is not an operator, it's part of a comment sequence.
      // Handled inline (not via tokenizeComment) because tokenizeComment
      // unconditionally skips one more character for #-style comments.
      if (c0 === 47 && c1 === 47) {  // //
        let commentPos = pos + 2;
        while (commentPos < len) {
          const cc = input.charCodeAt(commentPos);
          if (cc === 10 || cc === 13) break;
          commentPos++;
        }
        const text = input.slice(pos, commentPos);
        this.pos = commentPos;
        return new LexerToken('COMMENT', text, text, pos, 0, this.line, col);
      }

      // << (LSHIFT) and >> (RSHIFT) — first char matches LTE/GTE first char
      if (c0 === 60 && c1 === 60) {  // <<
        this.pos = pos + 2;
        const text = '<<';
        return new LexerToken('LSHIFT', text, text, pos, 0, this.line, col);
      }
      if (c0 === 62 && c1 === 62) {  // >>
        this.pos = pos + 2;
        const text = '>>';
        return new LexerToken('RSHIFT', text, text, pos, 0, this.line, col);
      }

      // ── Plugin-registered two-char operators ──────────────────────
      // Checked after built-in operators so built-ins take priority.
      // Guarded by hasPluginOps: skips Map lookups entirely when no plugins.
      if (this.hasPluginOps) {
        const pluginInner = this.pluginOperators.get(c0);
        if (pluginInner) {
          const pluginType = pluginInner.get(c1);
          if (pluginType) {
            const text = input.slice(pos, pos + 2);
            this.pos = pos + 2;
            return new LexerToken(pluginType, text, text, pos, 0, this.line, col);
          }
        }
      }
    }

    // ── Single-character operator ──────────────────────────────────────
    this.pos = pos + 1;
    const opType = OP_MAP[c0];
    const text = input.charAt(pos);
    return new LexerToken(opType || 'ERROR', text, text, pos, 0, this.line, col);
  }

  // ── String literal tokenizer ──────────────────────────────────────────
  /**
   * Reads a double-quoted string literal. Supports backslash escapes.
   * Advances `this.pos` past the closing quote.
   */
  private tokenizeString(): Token {
    const input = this.input;
    const len = this.len;
    const start = this.pos;
    const startCol = start - this.lineStartPos + 1;
    let pos = start + 1;  // skip opening "
    let lineBreaks = 0;

    while (pos < len) {
      const c0 = input.charCodeAt(pos);
      if (c0 === 34) {  // closing "
        pos++;
        const text = input.slice(start, pos);
        this.pos = pos;
        return new LexerToken('STRING', text, text, start, lineBreaks, this.line, startCol);
      }
      if (c0 === 92 && pos + 1 < len) {  // backslash escape
        pos += 2;  // skip \ + escaped char
        continue;
      }
      if (c0 === 10) {  // \n
        this.line++;
        this.lineStartPos = pos + 1;
        lineBreaks++;
      }
      pos++;
    }

    // Unterminated string — emit what we have
    const text = input.slice(start, pos);
    this.pos = pos;
    return new LexerToken('STRING', text, text, start, lineBreaks, this.line, startCol);
  }

  // ── Markdown line scanner (Phase B) ───────────────────────────────────

  /**
   * Classify a line by its character positions within this.input.
   *
   * Reads directly from this.input using start/end boundaries — avoids
   * allocating a substring (input.slice(start, end)) for classification.
   * Used by scanDocument() which already has the full document in
   * this.input; this keeps both classification and tokenization reads
   * within the same memory region for better CPU cache locality.
   *
   * DOES NOT modify this.pos — purely a read-only classifier.
   *
   * @param start Character offset of the line start within this.input.
   * @param end Character offset of the line end (before newline).
   */
  private classifyFromPositions(start: number, end: number): LineClassification {
    const len = end;

    // ── 0-length fast path ────────────────────────────────────────────
    if (start >= len) {
      return { type: 'empty', skip: true, hasInlineSolve: false };
    }

    const input = this.input;
    let pos = start;

    // ── Skip leading whitespace ─────────────────────────────────────────
    while (pos < len) {
      const cc = input.charCodeAt(pos);
      if (cc !== 32 && cc !== 9) break;
      pos++;
    }

    if (pos >= len) {
      return { type: 'empty', skip: true, hasInlineSolve: false };
    }

    const c0 = input.charCodeAt(pos);
    // hasInline is computed lazily — only for branch types that need it.
    // Uses input.indexOf() bounded by end to avoid scanning past the line.
    let hasInline: boolean | undefined;

    // ── Heading / Comment: #{1,6} ' ' or #... ─────────────────────
    if (c0 === 35) {  // #
      let hashCount = 1;
      while (pos + hashCount < len && input.charCodeAt(pos + hashCount) === 35) {
        hashCount++;
      }
      if (hashCount <= 6 && pos + hashCount < len && input.charCodeAt(pos + hashCount) === 32) {
        return { type: 'heading', skip: true, hasInlineSolve: false };
      }
      return { type: 'heading', skip: true, hasInlineSolve: false };
    }

    // ── Blockquote: > ' ' ────────────────────────────────────────────
    if (c0 === 62) {  // >
      if (pos + 1 < len && input.charCodeAt(pos + 1) === 32) {
        return { type: 'blockquote', skip: true, hasInlineSolve: false };
      }
    }

    // ── Code fence: ``` or ~~~ ────────────────────────────────────────
    if (c0 === 96 && pos + 2 < len && input.charCodeAt(pos + 1) === 96 && input.charCodeAt(pos + 2) === 96) {
      return { type: 'code_fence', skip: true, hasInlineSolve: false };
    }
    if (c0 === 126 && pos + 2 < len && input.charCodeAt(pos + 1) === 126 && input.charCodeAt(pos + 2) === 126) {
      return { type: 'code_fence', skip: true, hasInlineSolve: false };
    }

    // ── Math fence: $$ ────────────────────────────────────────────────
    if (c0 === 36 && pos + 1 < len && input.charCodeAt(pos + 1) === 36) {
      return { type: 'math_fence', skip: true, hasInlineSolve: false };
    }

    // ── Horizontal rule: ---, ***, ___ (3+ same char, then only whitespace)
    if (c0 === 45 || c0 === 42 || c0 === 95) {  // -, *, _
      let count = 1;
      while (pos + count < len && input.charCodeAt(pos + count) === c0) {
        count++;
      }
      if (count >= 3) {
        let trailPos = pos + count;
        while (trailPos < len && (input.charCodeAt(trailPos) === 32 || input.charCodeAt(trailPos) === 9)) {
          trailPos++;
        }
        if (trailPos >= len) {
          return { type: 'hr', skip: true, hasInlineSolve: false };
        }
      }
    }

    // ── Unordered list: - ' ', * ' ', + ' ' ──────────────────────────
    if ((c0 === 45 || c0 === 42 || c0 === 43) && pos + 1 < len && input.charCodeAt(pos + 1) === 32) {
      if (hasInline === undefined) {
        const idx = input.indexOf('s`', pos);
        hasInline = idx !== -1 && idx < len;
      }
      return { type: 'list', skip: false, hasInlineSolve: hasInline };
    }

    // ── Ordered list: \d+ '. ' ────────────────────────────────────────
    if (c0 >= 48 && c0 <= 57) {  // 0-9
      let digitPos = pos;
      while (digitPos < len && input.charCodeAt(digitPos) >= 48 && input.charCodeAt(digitPos) <= 57) {
        digitPos++;
      }
      if (digitPos < len && input.charCodeAt(digitPos) === 46) {  // .
        if (digitPos + 1 < len && input.charCodeAt(digitPos + 1) === 32) {
          if (hasInline === undefined) {
            const idx = input.indexOf('s`', pos);
            hasInline = idx !== -1 && idx < len;
          }
          return { type: 'list', skip: false, hasInlineSolve: hasInline };
        }
      }
    }

    // ── Table / table separator: | ────────────────────────────────────
    if (c0 === 124) {  // |
      let tPos = pos + 1;
      while (tPos < len) {
        const tc = input.charCodeAt(tPos);
        if (tc !== 45 && tc !== 58 && tc !== 124 && tc !== 32 && tc !== 9 && tc !== 13) break;
        tPos++;
      }
      if (tPos >= len) {
        return { type: 'table_separator', skip: true, hasInlineSolve: false };
      }
    }

    // ── Wikilink / embed: [[ or ![[ ───────────────────────────────────
    if (c0 === 91 && pos + 1 < len && input.charCodeAt(pos + 1) === 91) {
      const closePos = input.indexOf(']]', pos + 2);
      if (closePos !== -1 && closePos < len) {
        let trailPos = closePos + 2;
        while (trailPos < len && (input.charCodeAt(trailPos) === 32 || input.charCodeAt(trailPos) === 9)) {
          trailPos++;
        }
        if (trailPos >= len) {
          return { type: 'wikilink', skip: true, hasInlineSolve: false };
        }
      }
    }
    if (c0 === 33 && pos + 2 < len && input.charCodeAt(pos + 1) === 91 && input.charCodeAt(pos + 2) === 91) {
      const closePos = input.indexOf(']]', pos + 3);
      if (closePos !== -1 && closePos < len) {
        let trailPos = closePos + 2;
        while (trailPos < len && (input.charCodeAt(trailPos) === 32 || input.charCodeAt(trailPos) === 9)) {
          trailPos++;
        }
        if (trailPos >= len) {
          return { type: 'wikilink', skip: true, hasInlineSolve: false };
        }
      }
    }

    // ── Comment: // ──────────────────────────────────────────────────
    if (c0 === 47 && pos + 1 < len && input.charCodeAt(pos + 1) === 47) {
      return { type: 'comment', skip: true, hasInlineSolve: false };
    }

    // ── Default: expression line ──────────────────────────────────────
    if (c0 === 62) {  // > — bare blockquote without space
      let trail = pos + 1;
      while (trail < len && (input.charCodeAt(trail) === 32 || input.charCodeAt(trail) === 9)) trail++;
      if (trail >= len) return { type: 'blockquote', skip: true, hasInlineSolve: false };
    }
    if (c0 === 45 || c0 === 42 || c0 === 43) {  // - * +
      let trail = pos + 1;
      while (trail < len && (input.charCodeAt(trail) === 32 || input.charCodeAt(trail) === 9)) trail++;
      if (trail >= len) return { type: 'list', skip: false, hasInlineSolve: false };
    }
    if (hasInline === undefined) {
      const idx = input.indexOf('s`', pos);
      hasInline = idx !== -1 && idx < len;
    }
    return { type: 'expression', skip: false, hasInlineSolve: hasInline };
  }

  /**
   * Classify a single line of markdown text.
   *
   * Thin wrapper around classifyFromPositions() for external callers that
   * have a standalone line string. Internal callers (scanDocument) should
   * use classifyFromPositions() directly to avoid string allocation and
   * keep classification + tokenization reads within the same memory region.
   *
   * @param lineText The raw line text (without trailing newline).
   */
  classifyLine(lineText: string): LineClassification {
    const savedInput = this.input;
    const savedLen = this.len;
    const savedPos = this.pos;
    this.input = lineText;
    this.len = lineText.length;
    this.pos = 0;
    const result = this.classifyFromPositions(0, lineText.length);
    this.input = savedInput;
    this.len = savedLen;
    this.pos = savedPos;
    return result;
  }

  /**
   * Find all inline solve markers in a line with precise coordinate mapping.
   *
   * Scans character-by-character for the pattern `s`...`` (lowercase 's'
   * followed by backtick, expression content, closing backtick). Supports
   * escaped backticks within the expression via backslash escapes.
   *
   * Replaces the regex-based `findInlineSolvesInLine()` with a single-pass
   * scanner that is ~2-3× faster for typical lines (no regex compilation,
   * no backtracking).
   *
   * @param lineText The raw line text.
   * @returns Array of inline solve spans with expression text and coordinates.
   */
  findInlineSolves(lineText: string): InlineSolveSpan[] {
    const results: InlineSolveSpan[] = [];
    const len = lineText.length;
    let pos = 0;

    while (pos < len) {
      // Look for lowercase 's' followed by backtick
      const sPos = lineText.indexOf('s`', pos);
      if (sPos === -1) break;

      const exprStart = sPos + 2;  // past 's`'

      // Scan for closing backtick, handling escaped backticks
      let exprEnd = exprStart;
      while (exprEnd < len) {
        const cc = lineText.charCodeAt(exprEnd);
        if (cc === 92 && exprEnd + 1 < len) {  // backslash escape
          exprEnd += 2;  // skip \ + escaped char
          continue;
        }
        if (cc === 96) {  // closing backtick
          break;
        }
        exprEnd++;
      }

      if (exprEnd >= len) {
        // Unterminated inline solve — include rest of line as expression
        exprEnd = len;
      }

      const expression = lineText.slice(exprStart, exprEnd);
      const end = exprEnd < len ? exprEnd + 1 : exprEnd;  // include closing backtick if present

      results.push({
        start: sPos,
        end,
        expression,
        columnNumber: sPos + 1,
      });

      pos = end;
    }

    return results;
  }

  // ── Comment tokenizer ─────────────────────────────────────────────────
  /**
   * Reads a comment: # to end of line, or // to end of line.
   * Advances `this.pos` to the newline (or end of input).
   */
  private tokenizeComment(): Token {
    const input = this.input;
    const len = this.len;
    const start = this.pos;
    const startCol = start - this.lineStartPos + 1;
    let pos = this.pos;

    // Check for // comment
    if (pos + 1 < len && input.charCodeAt(pos + 1) === 47) {
      pos += 2;  // skip //
    } else {
      pos++;  // skip # (single-line comment)
    }

    // Read to end of line
    while (pos < len) {
      const c0 = input.charCodeAt(pos);
      if (c0 === 10 || c0 === 13) break;
      pos++;
    }

    const text = input.slice(start, pos);
    this.pos = pos;
    return new LexerToken('COMMENT', text, text, start, 0, this.line, startCol);
  }
}
