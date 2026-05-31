import { Token, registerTokenType, tokenTypeId, registerAllTokenTypes } from '@solve-js/lexer/Token';
import { knownUnits } from '@solve-js/lexer/units';
import { getLocale, type ILocale } from '@solve-js/constants/locales';
import { ErrorFactory } from '@solve-js/errors/UnifiedErrorFramework';
import type { TokenLookup, PhraseNode as RegistryPhraseNode } from '@solve-js/lexer/TokenClassRegistry';

// Bootstrap all token types at module load
registerAllTokenTypes();

// ── Markdown line classification (Phase B) ──────────────────────────────

export type MarkdownLineType =
  | 'expression'
  | 'prose'
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

// ── Pre-computed operator token type IDs ──────────────────────────────────
// Cached at module load for the hot path — avoids Map.get() per operator token.
const OP_TYPE_IDS: Record<string, number> = {
  '+': tokenTypeId('PLUS'),     '-': tokenTypeId('MINUS'),
  '*': tokenTypeId('STAR'),     '/': tokenTypeId('SLASH'),
  '^': tokenTypeId('CARET'),    '%': tokenTypeId('PERCENT'),
  '(': tokenTypeId('LPAREN'),   ')': tokenTypeId('RPAREN'),
  '[': tokenTypeId('LBRACKET'), ']': tokenTypeId('RBRACKET'),
  '{': tokenTypeId('LBRACE'),   '}': tokenTypeId('RBRACE'),
  ',': tokenTypeId('COMMA'),    '=': tokenTypeId('EQUALS'),
  ':': tokenTypeId('COLON'),    ';': tokenTypeId('SEMICOLON'),
  '?': tokenTypeId('QUESTION'), '!': tokenTypeId('BANG'),
  '&': tokenTypeId('BIT_AND'),  '|': tokenTypeId('BIT_OR'),
  '~': tokenTypeId('BIT_NOT'),
};

// Pre-computed two-char operator type IDs
const TWO_CHAR_OP_IDS: Record<string, { typeId: number; text: string }> = {
  '==': { typeId: tokenTypeId('EQUALITY'), text: '==' },
  '!=': { typeId: tokenTypeId('NEQ'), text: '!=' },
  '>=': { typeId: tokenTypeId('GTE'), text: '>=' },
  '<=': { typeId: tokenTypeId('LTE'), text: '<=' },
  '<<': { typeId: tokenTypeId('LSHIFT'), text: '<<' },
  '>>': { typeId: tokenTypeId('RSHIFT'), text: '>>' },
};

// ── Monomorphic Token class ───────────────────────────────────────────────
// V8 assigns a single stable HiddenClass because all properties are
// initialized in the constructor and never added/removed afterwards.
// This enables fast property access (inline cache hits) and allows
// allocation in V8's nursery (cheap GC).
// All 9 fields are always set — no optional fields, no different shapes.
export class LexerToken implements Token {
  constructor(
    public type: string,
    public typeId: number,
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

// ── Phrase start words set (built once) ──────────────────────────────────
// Used by tokenizeIdentifier() to detect words that start phrases.
// When such a word is seen, we emit IDENT and let the phrase matcher
// combine it with following words into a phrase token. This prevents
// single-word phrase starts (e.g., "to", "power") from being swallowed
// by keyword lookup.
const PHRASE_START_WORDS = new Set<string>(
  buildPhraseList().map(p => p.phrase.split(' ')[0])
);

// ── Expression gating (L1) ──────────────────────────────────────────────
// Pre-computed Set of character codes that indicate an expression might
// be present. Used by hasExpressionIndicators() to gate prose lines
// before full tokenization.
//
// NOTE: Currently unused — L1 prose gating was removed from classifyFromPositions()
// because it incorrectly skipped keyword-only lines ("pi"), single identifiers
// ("hello"), and short alpha lines. Retained for future re-implementation with
// keyword-awareness and proper test coverage.
const EXPRESSION_INDICATOR_CODES = (() => {
  const set = new Set<number>();
  // Digits 0-9
  for (let i = 48; i <= 57; i++) set.add(i);
  // Operators / punctuation
  // Note: colon (58) is intentionally excluded — it's common in prose
  // (e.g., "Subject: Hello world") and would cause false-positive
  // expression classification. Variable assignment lines like
  // ":myVar = 5" are still caught by '=' and digit indicators.
  const opCodes = [43, 45, 42, 47, 94, 37, 40, 41, 91, 93, 123, 125, 61, 60, 62, 33, 38, 124, 126, 59, 63];
  for (const c of opCodes) set.add(c);
  // Currency
  set.add(36);   // $
  set.add(0x00A3); // £
  set.add(0x20AC); // €
  // Backtick (inline solve)
  set.add(96);   // `
  // Dot (could be decimal)
  set.add(46);   // .
  // Hash (comment — still an expression indicator)
  set.add(35);   // #
  return set;
})();

// ── ExpressionLexer ───────────────────────────────────────────────────────
export class ExpressionLexer {
  private static readonly CHAR_CLASS = buildCharClassTable();
  private static readonly PHRASES = buildPhraseList();

  /**
   * Configured TokenLookup from TokenClassRegistry. When set, replaces
   * the internal keyword map, unit set, phrase trie, and phraseStartWords
   * with registry-built equivalents. Enables data-driven keyword/unit/phrase
   * registration across locale keywords, provider keywords, and plugins.
   *
   * Set at construction time via the constructor parameter. Plugin-registered
   * keywords/units/phrases (via registerPlugin()) are checked alongside
   * the configuredLookup — neither source is bypassed.
   */
  private configuredLookup: TokenLookup | null = null;

  // Instance state
  private input: string = '';
  private pos: number = 0;
  private len: number = 0;

  // Line / column tracking (1-indexed)
  private line: number = 1;
  private lineStartPos: number = 0;

  // Keyword map: lowercase identifier → token type (locale keywords only)
  private keywordMap: Map<string, string>;

  // ── Merged lookup collections (keywordMap + pluginKeywordMap, knownUnits + pluginUnits)
  // Built once at construction and rebuilt on registerPlugin/unregisterPlugin.
  // tokenizeIdentifier() uses these instead of checking multiple sources separately —
  // reduces 4-6 Map/Set lookups per identifier to 1-2 for the common no-plugin case.
  private mergedKeywords: Map<string, string>;
  private mergedUnits: Set<string>;

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

  // Combined phraseStartWords: built-in + plugin phrase first words.
  // Used to detect IDENT tokens that may start a phrase.
  private phraseStartWords: Set<string> = new Set(PHRASE_START_WORDS);

  // Phrase trie: O(word-count) lookup vs O(phrases×words) linear scan.
  // Merges built-in PHRASES with pluginPhrases. Rebuilt on register/unregister.
  private phraseTrie: PhraseTrieNode;

  // Locale for function-identifier lookups
  private localeCode: string;
  private locale: ILocale;

  constructor(localeCode = 'en', lookup?: TokenLookup) {
    this.localeCode = localeCode;
    this.locale = getLocale(localeCode);
    this.configuredLookup = lookup ?? null;
    this.keywordMap = new Map<string, string>();
    for (const [k, v] of Object.entries(this.locale.keywordMap)) {
      this.keywordMap.set(k.toLowerCase(), v);
    }
    this.mergedKeywords = new Map(this.keywordMap);
    this.mergedUnits = new Set(knownUnits);
    this.phraseTrie = ExpressionLexer.buildPhraseTrie(ExpressionLexer.PHRASES, []);
  }

  /**
   * Rebuild mergedKeywords and mergedUnits from base collections + plugin collections.
   * Called at construction and after registerPlugin/unregisterPlugin.
   */
  private rebuildMergedCollections(): void {
    // Keywords: locale (base) + plugin
    this.mergedKeywords = new Map(this.keywordMap);
    for (const [k, v] of this.pluginKeywordMap) {
      if (!this.mergedKeywords.has(k)) {
        this.mergedKeywords.set(k, v);
      }
    }
    // Units: knownUnits (base) + plugin
    this.mergedUnits = new Set(knownUnits);
    for (const u of this.pluginUnits) {
      this.mergedUnits.add(u);
    }
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
      this.rebuildMergedCollections();
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
        // Track the first word of the phrase for phraseStartWords
        this.phraseStartWords.add(lowerPhrase.split(' ')[0]);
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
      this.rebuildMergedCollections();
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
   */
  unregisterPlugin(plugin: LexerPlugin): void {
    if (plugin.keywords) {
      for (const keyword of Object.keys(plugin.keywords)) {
        this.pluginKeywordMap.delete(keyword.toLowerCase());
      }
      this.hasPluginKeywords = this.pluginKeywordMap.size > 0;
      this.rebuildMergedCollections();
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
        // Rebuild phraseStartWords from scratch
        this.phraseStartWords = new Set(PHRASE_START_WORDS);
        for (const p of this.pluginPhrases) {
          this.phraseStartWords.add(p.phrase.split(' ')[0]);
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
      this.rebuildMergedCollections();
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
          yield new LexerToken('NUMBER', tokenTypeId('NUMBER'), this.input, this.input, 0, 0, 1, 1);
          break;

        case CharClass.ALPHA: {
          const input = this.input;
          const identLower = input.toLowerCase();
          // Use pre-merged collections (built-in + plugin) — single lookup each
          if (this.mergedUnits.has(input)) {
            yield new LexerToken('UNIT', tokenTypeId('UNIT'), input, input, 0, 0, 1, 1);
          } else {
            const kwType = this.mergedKeywords.get(identLower);
            if (kwType) {
              yield new LexerToken(kwType, tokenTypeId(kwType), input, input, 0, 0, 1, 1);
            } else {
              yield new LexerToken('IDENT', tokenTypeId('IDENT'), input, input, 0, 0, 1, 1);
            }
          }
          break;
        }

        case CharClass.OPERATOR: {
          const opType = OP_MAP[c0];
          if (opType) {
            yield new LexerToken(opType, tokenTypeId(opType), this.input, this.input, 0, 0, 1, 1);
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
          yield new LexerToken('DOLLAR', tokenTypeId('DOLLAR'), '$', '$', 0, 0, 1, 1);
          break;

        case CharClass.BACKTICK:
          yield new LexerToken('BACKTICK_OPEN', tokenTypeId('BACKTICK_OPEN'), '`', '`', 0, 0, 1, 1);
          break;

        default: {
          // CharClass.SKIP — includes non-ASCII characters (code >= 128)
          if (c0 === 0x00D7) {  // × → STAR
            yield new LexerToken('STAR', tokenTypeId('STAR'), '\u00D7', '\u00D7', 0, 0, 1, 1);
          } else if (c0 === 0x00F7) {  // ÷ → SLASH
            yield new LexerToken('SLASH', tokenTypeId('SLASH'), '\u00F7', '\u00F7', 0, 0, 1, 1);
          } else if (c0 === 0x2260) {  // ≠ → NEQ
            yield new LexerToken('NEQ', tokenTypeId('NEQ'), '\u2260', '\u2260', 0, 0, 1, 1);
          } else if (c0 === 0x00A3) {  // £
            yield new LexerToken('POUND', tokenTypeId('POUND'), '\u00A3', '\u00A3', 0, 0, 1, 1);
          } else if (c0 === 0x20AC) {  // €
            yield new LexerToken('EURO', tokenTypeId('EURO'), '\u20AC', '\u20AC', 0, 0, 1, 1);
          } else if (c0 >= 128) {
            // Unknown unicode — treat as IDENT for forward compatibility
            yield new LexerToken('IDENT', tokenTypeId('IDENT'), this.input, this.input, 0, 0, 1, 1);
          }
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
              yield new LexerToken('DOT', tokenTypeId('DOT'), '.', '.', this.pos, 0, this.line, col);
              this.pos++;
            }
          } else {
            const col = this.pos - this.lineStartPos + 1;
            yield new LexerToken('DOT', tokenTypeId('DOT'), '.', '.', this.pos, 0, this.line, col);
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
          yield new LexerToken('DOLLAR', tokenTypeId('DOLLAR'), '$', '$', this.pos, 0, this.line, col);
          this.pos++;
          break;
        }

        // ── Backtick ` ───────────────────────────────────────────────
        case CharClass.BACKTICK: {
          const col = this.pos - this.lineStartPos + 1;
          yield new LexerToken('BACKTICK_OPEN', tokenTypeId('BACKTICK_OPEN'), '`', '`', this.pos, 0, this.line, col);
          this.pos++;
          break;
        }

        // ── Non-ASCII characters ─────────────────────────────────────
        default: {
          const col = this.pos - this.lineStartPos + 1;
          if (c0 === 0x00D7) {  // × → STAR
            yield new LexerToken('STAR', tokenTypeId('STAR'), '\u00D7', '\u00D7', this.pos, 0, this.line, col);
            this.pos++;
          } else if (c0 === 0x00F7) {  // ÷ → SLASH
            yield new LexerToken('SLASH', tokenTypeId('SLASH'), '\u00F7', '\u00F7', this.pos, 0, this.line, col);
            this.pos++;
          } else if (c0 === 0x2260) {  // ≠ → NEQ
            yield new LexerToken('NEQ', tokenTypeId('NEQ'), '\u2260', '\u2260', this.pos, 0, this.line, col);
            this.pos++;
          } else if (c0 === 0x00A3) {  // £
            yield new LexerToken('POUND', tokenTypeId('POUND'), '\u00A3', '\u00A3', this.pos, 0, this.line, col);
            this.pos++;
          } else if (c0 === 0x20AC) {  // €
            yield new LexerToken('EURO', tokenTypeId('EURO'), '\u20AC', '\u20AC', this.pos, 0, this.line, col);
            this.pos++;
          } else if (c0 >= 128) {
            // Unknown unicode — treat as IDENT for forward compatibility.
            // tokenizeIdentifier() now includes cc >= 128 in its reading loop,
            // so this properly advances past all consecutive Unicode chars.
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
        return new LexerToken('NUMBER', tokenTypeId('NUMBER'), text, text, start, 0, this.line, startCol);
      }
      // ── Binary literal: 0b / 0B ─────────────────────────────────────
      if (next === 0x62 || next === 0x42) {  // 'b' or 'B'
        pos += 2;
        while (pos < len && ((cc = input.charCodeAt(pos)), cc === 48 || cc === 49)) {
          pos++;
        }
        const text = input.slice(start, pos);
        this.pos = pos;
        return new LexerToken('NUMBER', tokenTypeId('NUMBER'), text, text, start, 0, this.line, startCol);
      }
    }

    let hasIntPart = false;

    // ── Integer part ───────────────────────────────────────────────────
    while (pos < len && ((cc = input.charCodeAt(pos)), cc >= 48 && cc <= 57)) {
      hasIntPart = true;
      pos++;
    }

    // ── Thousands separators — coalesce with digits ────────────────────
    while (hasIntPart && pos < len && (input.charCodeAt(pos) === 44 || input.charCodeAt(pos) === 46)) {
      if (pos + 4 <= len) {
        const d1 = input.charCodeAt(pos + 1);
        const d2 = input.charCodeAt(pos + 2);
        const d3 = input.charCodeAt(pos + 3);
        if (
          d1 >= 48 && d1 <= 57 &&
          d2 >= 48 && d2 <= 57 &&
          d3 >= 48 && d3 <= 57
        ) {
          pos += 4;
          hasIntPart = true;
          continue;
        }
      }
      break;
    }

    // ── Decimal part (.xxx) ───────────────────────────────────────────
    let hasDecimal = false;
    if (pos < len && input.charCodeAt(pos) === 46) {
      if (pos + 1 < len) {
        const nextCc = input.charCodeAt(pos + 1);
        if (nextCc >= 48 && nextCc <= 57) {
          hasDecimal = true;
          pos++;
          while (pos < len && ((cc = input.charCodeAt(pos)), cc >= 48 && cc <= 57)) {
            pos++;
          }
        }
      }
    }

    // ── Exponent (e / E [+-]? \n+) ────────────────────────────────────
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
            pos++;
            if (next === 43 || next === 45) pos++;
            while (pos < len && ((cc = input.charCodeAt(pos)), cc >= 48 && cc <= 57)) {
              pos++;
            }
          }
        }
      }
    }

    // ── BigInt suffix check ────────────────────────────────────────────
    if (pos < len && input.charCodeAt(pos) === 110) {  // 'n'
      if (hasIntPart && !hasDecimal && !hasExponent) {
        pos++;
        const text = input.slice(start, pos);
        this.pos = pos;
        return new LexerToken('BIGINT', tokenTypeId('BIGINT'), text, text, start, 0, this.line, startCol);
      }
    }

    // ── Emit NUMBER token ──────────────────────────────────────────────
    const text = input.slice(start, pos);
    this.pos = pos;
    return new LexerToken('NUMBER', tokenTypeId('NUMBER'), text, text, start, 0, this.line, startCol);
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

    // Read [a-zA-Z0-9_]* plus any Unicode (>= 128) including emoji surrogate pairs.
    // Without this, non-ASCII characters cause an infinite loop: the default case
    // calls tokenizeIdentifier(), the while loop doesn't match the Unicode char,
    // pos never advances, and the outer loop re-reads the same char forever.
    while (
      pos < len &&
      ((cc = input.charCodeAt(pos)),
        (cc >= 48 && cc <= 57) ||   // 0-9
        (cc >= 65 && cc <= 90) ||   // A-Z
        (cc >= 97 && cc <= 122) ||  // a-z
        cc === 95 ||                 // _
        cc >= 128)                   // Unicode (accented chars, emoji, etc.)
    ) {
      pos++;
    }

    const identText = input.slice(start, pos);
    const identLower = identText.toLowerCase();

    // ── Inline solve marker: s` (lowercase 's' followed by backtick) ──
    if (identLower === 's' && pos < len && input.charCodeAt(pos) === 96) {
      pos++;
      this.pos = pos;
      const fullText = input.slice(start, pos);
      return new LexerToken('INLINE_SOLVE_START', tokenTypeId('INLINE_SOLVE_START'), fullText, fullText, start, 0, this.line, startCol);
    }

    // ── Unit lookup (case-sensitive, takes priority over phrases/keywords)
    // Uses pre-merged mergedUnits (knownUnits + pluginUnits), avoiding
    // a separate pluginUnits.has() lookup for every identifier.
    const isKnownUnit = this.mergedUnits.has(identText);
    if (isKnownUnit) {
      if (!this.isFollowedByLParen(pos)) {
        this.pos = pos;
        return new LexerToken('UNIT', tokenTypeId('UNIT'), identText, identText, start, 0, this.line, startCol);
      }
    }

    // ── Phrase matching — multi-word patterns (before keyword lookup)
    // Use configuredLookup.phraseTrie when available (cast — structurally identical).
    // Falls back to instance phraseTrie (includes plugin phrases) when the
    // registry-built trie doesn't match — plugin phrases aren't in the lookup.
    const configuredLookup = this.configuredLookup;
    const phraseTrieOverride = (configuredLookup?.phraseTrie ?? null) as unknown as PhraseTrieNode | undefined;
    const phraseResult = this.tryMatchPhrase(input, pos, identLower, identText, phraseTrieOverride);
    if (phraseResult) {
      this.pos = phraseResult.endPos;
      return new LexerToken(
        phraseResult.type,
        tokenTypeId(phraseResult.type),
        phraseResult.text,
        phraseResult.text,
        start,
        0,
        this.line,
        startCol,
      );
    }
    // Fall back to instance phraseTrie (includes plugin phrases) when configuredLookup
    // trie didn't match. Plugin phrases registered via registerPlugin() aren't in
    // the registry-built lookup.
    if (phraseTrieOverride && this.hasPluginPhrases) {
      const fallbackResult = this.tryMatchPhrase(input, pos, identLower, identText);
      if (fallbackResult) {
        this.pos = fallbackResult.endPos;
        return new LexerToken(
          fallbackResult.type,
          tokenTypeId(fallbackResult.type),
          fallbackResult.text,
          fallbackResult.text,
          start,
          0,
          this.line,
          startCol,
        );
      }
    }

    // ── Keyword lookup (case-insensitive) — takes priority over phraseStartWords
    // Keywords must be recognized even if they happen to start phrases, so that
    // "to the" → TO + IDENT (not IDENT + IDENT when "to" is a keyword).
    // Uses pre-merged mergedKeywords (keywordMap + pluginKeywordMap),
    // avoiding a separate pluginKeywordMap.get() for every identifier.
    const localeKwType = this.mergedKeywords.get(identLower);
    if (localeKwType) {
      this.pos = pos;
      return new LexerToken(localeKwType, tokenTypeId(localeKwType), identText, identText, start, 0, this.line, startCol);
    }

    // ── phraseStartWords optimization ─────────────────────────────────
    // Only applies to non-keyword identifiers. Prevents single-word phrase starts
    // (e.g., "power" when "power of" is a phrase) from being swallowed by keyword
    // registration, while still allowing standalone "to" to become a keyword via
    // locale keywordMap above.
    const phraseStartWords = configuredLookup?.phraseStartWords ?? this.phraseStartWords;
    if (phraseStartWords.has(identLower)) {
      this.pos = pos;
      return new LexerToken('IDENT', tokenTypeId('IDENT'), identText, identText, start, 0, this.line, startCol);
    }

    this.pos = pos;
    return new LexerToken('IDENT', tokenTypeId('IDENT'), identText, identText, start, 0, this.line, startCol);
  }

  /**
   * Peek past in-expression whitespace (space, tab) from `pos` to check
   * if the next significant character is '('.
   */
  private isFollowedByLParen(pos: number): boolean {
    const len = this.len;
    let lookPos = pos;
    while (lookPos < len) {
      const cc = this.input.charCodeAt(lookPos);
      if (cc === 40) return true;
      if (cc !== 32 && cc !== 9) break;
      lookPos++;
    }
    return false;
  }

  // ── Phrase matcher (trie-based) ───────────────────────────────────────
  /**
   * After reading a first identifier, try to match a multi-word phrase
   * like "to the power of" or "increase by".
   *
   * @param rootOverride - Optional trie root from TokenLookup.phraseTrie.
   *   When provided, uses the registry-built trie (cast to PhraseTrieNode —
   *   structurally identical to TokenClassRegistry's PhraseNode).
   */
  private tryMatchPhrase(
    input: string,
    pos: number,
    firstWordLower: string,
    firstWordOriginal: string,
    rootOverride?: PhraseTrieNode,
  ): { type: string; text: string; endPos: number } | null {
    const len = this.len;
    const root = rootOverride ?? this.phraseTrie;

    const startNode: PhraseTrieNode | undefined = root.children.get(firstWordLower);
    if (!startNode) return null;

    if (startNode.type && startNode.children.size === 0) {
      return { type: startNode.type, text: firstWordOriginal, endPos: pos };
    }

    const wordsOriginal: string[] = [firstWordOriginal];
    let scanPos = pos;
    let current: PhraseTrieNode = startNode;

    while (scanPos < len) {
      if (input.charCodeAt(scanPos) !== 32) break;
      scanPos++;
      if (scanPos >= len) break;

      const wordStart = scanPos;
      let cc: number;
      while (
        scanPos < len &&
        ((cc = input.charCodeAt(scanPos)),
          (cc >= 65 && cc <= 90) ||
          (cc >= 97 && cc <= 122))
      ) {
        scanPos++;
      }

      if (scanPos === wordStart) break;

      const word = input.slice(wordStart, scanPos);
      const wordLower = word.toLowerCase();

      const next: PhraseTrieNode | undefined = current.children.get(wordLower);
      if (!next) break;

      wordsOriginal.push(word);
      current = next;

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
   * cases << (LSHIFT) and >> (RSHIFT).
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

      // ==, !=, >=, <=
      const secondMap = TWO_CHAR_OPS[c0];
      if (secondMap) {
        const twoCharType = secondMap[c1];
        if (twoCharType) {
          const text = input.slice(pos, pos + 2);
          this.pos = pos + 2;
          return new LexerToken(twoCharType, tokenTypeId(twoCharType), text, text, pos, 0, this.line, col);
        }
      }

      // // comment
      if (c0 === 47 && c1 === 47) {
        let commentPos = pos + 2;
        while (commentPos < len) {
          const cc = input.charCodeAt(commentPos);
          if (cc === 10 || cc === 13) break;
          commentPos++;
        }
        const text = input.slice(pos, commentPos);
        this.pos = commentPos;
        return new LexerToken('COMMENT', tokenTypeId('COMMENT'), text, text, pos, 0, this.line, col);
      }

      // << (LSHIFT) and >> (RSHIFT)
      if (c0 === 60 && c1 === 60) {
        this.pos = pos + 2;
        return new LexerToken('LSHIFT', tokenTypeId('LSHIFT'), '<<', '<<', pos, 0, this.line, col);
      }
      if (c0 === 62 && c1 === 62) {
        this.pos = pos + 2;
        return new LexerToken('RSHIFT', tokenTypeId('RSHIFT'), '>>', '>>', pos, 0, this.line, col);
      }

      // ── Plugin-registered two-char operators ──────────────────────
      if (this.hasPluginOps) {
        const pluginInner = this.pluginOperators.get(c0);
        if (pluginInner) {
          const pluginType = pluginInner.get(c1);
          if (pluginType) {
            const text = input.slice(pos, pos + 2);
            this.pos = pos + 2;
            return new LexerToken(pluginType, tokenTypeId(pluginType), text, text, pos, 0, this.line, col);
          }
        }
      }
    }

    // ── Single-character operator ──────────────────────────────────────
    this.pos = pos + 1;
    const opType = OP_MAP[c0];
    const text = input.charAt(pos);
    return new LexerToken(opType || 'ERROR', tokenTypeId(opType || 'ERROR'), text, text, pos, 0, this.line, col);
  }

  // ── String literal tokenizer ──────────────────────────────────────────
  /**
   * Reads a double-quoted string literal. Supports backslash escapes.
   */
  private tokenizeString(): Token {
    const input = this.input;
    const len = this.len;
    const start = this.pos;
    const startCol = start - this.lineStartPos + 1;
    let pos = start + 1;
    let lineBreaks = 0;

    while (pos < len) {
      const c0 = input.charCodeAt(pos);
      if (c0 === 34) {
        pos++;
        const text = input.slice(start, pos);
        this.pos = pos;
        return new LexerToken('STRING', tokenTypeId('STRING'), text, text, start, lineBreaks, this.line, startCol);
      }
      if (c0 === 92 && pos + 1 < len) {
        pos += 2;
        continue;
      }
      if (c0 === 10) {
        this.line++;
        this.lineStartPos = pos + 1;
        lineBreaks++;
      }
      pos++;
    }

    const text = input.slice(start, pos);
    this.pos = pos;
    return new LexerToken('STRING', tokenTypeId('STRING'), text, text, start, lineBreaks, this.line, startCol);
  }

  // ── Markdown line scanner (Phase B) ───────────────────────────────────

  /**
   * L1 expression gating: quickly determine if a line contains any
   * characters that indicate an expression (digits, operators, currency,
   * backticks, parentheses, etc.).
   *
   * Pure prose lines (e.g., "The quick brown fox jumps over the lazy dog")
   * return false and can be skipped without full tokenization (L2).
   *
   * This is a fast character-by-character scan that stops at the first
   * expression indicator. Called once per line in classifyFromPositions().
   */
  static hasExpressionIndicators(input: string, start: number, end: number): boolean {
    const indicatorCodes = EXPRESSION_INDICATOR_CODES;
    for (let i = start; i < end; i++) {
      const cc = input.charCodeAt(i);
      // Check digits and operators via pre-computed Set (O(1) lookup)
      if (indicatorCodes.has(cc)) return true;
      // Unicode math/currency symbols (≥ 128, not in the 128-byte table)
      if (cc >= 128) {
        // ×, ÷, ≠, £, € — common expression symbols
        if (cc === 0x00D7 || cc === 0x00F7 || cc === 0x2260 ||
            cc === 0x00A3 || cc === 0x20AC) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Classify a line by its character positions within this.input.
   * Reads directly from this.input using start/end boundaries.
   * DOES NOT modify this.pos — purely a read-only classifier.
   */
  private classifyFromPositions(start: number, end: number): LineClassification {
    const len = end;

    if (start >= len) {
      return { type: 'empty', skip: true, hasInlineSolve: false };
    }

    const input = this.input;
    let pos = start;

    while (pos < len) {
      const cc = input.charCodeAt(pos);
      if (cc !== 32 && cc !== 9) break;
      pos++;
    }

    if (pos >= len) {
      return { type: 'empty', skip: true, hasInlineSolve: false };
    }

    const c0 = input.charCodeAt(pos);
    let hasInline: boolean | undefined;

    // ── Heading: #{1,6} ' ' ──────────────────────────────────────────
    if (c0 === 35) {
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
    if (c0 === 62) {
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
    if (c0 === 45 || c0 === 42 || c0 === 95) {
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

    // ── Ordered list: \n+ '. ' ────────────────────────────────────────
    if (c0 >= 48 && c0 <= 57) {
      let digitPos = pos;
      while (digitPos < len && input.charCodeAt(digitPos) >= 48 && input.charCodeAt(digitPos) <= 57) {
        digitPos++;
      }
      if (digitPos < len && input.charCodeAt(digitPos) === 46) {
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
    if (c0 === 124) {
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

    // ── Default: expression or prose line ─────────────────────────────
    if (c0 === 62) {
      let trail = pos + 1;
      while (trail < len && (input.charCodeAt(trail) === 32 || input.charCodeAt(trail) === 9)) trail++;
      if (trail >= len) return { type: 'blockquote', skip: true, hasInlineSolve: false };
    }
    if (c0 === 45 || c0 === 42 || c0 === 43) {
      let trail = pos + 1;
      while (trail < len && (input.charCodeAt(trail) === 32 || input.charCodeAt(trail) === 9)) trail++;
      if (trail >= len) return { type: 'list', skip: false, hasInlineSolve: false };
    }
    if (hasInline === undefined) {
      const idx = input.indexOf('s`', pos);
      hasInline = idx !== -1 && idx < len;
    }

    // Return expression — all non-markdown-structure lines are tokenized.
    // (L1 prose gating removed: it incorrectly skipped keyword-only lines
    // like "pi", single identifiers like "hello", and any line without
    // digits/operators/currency. Can be re-added with keyword-awareness
    // and proper test coverage.)
    return { type: 'expression', skip: false, hasInlineSolve: hasInline };
  }

  /**
   * Classify a single line of markdown text.
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
   */
  findInlineSolves(lineText: string): InlineSolveSpan[] {
    const results: InlineSolveSpan[] = [];
    const len = lineText.length;
    let pos = 0;

    while (pos < len) {
      const sPos = lineText.indexOf('s`', pos);
      if (sPos === -1) break;

      const exprStart = sPos + 2;

      let exprEnd = exprStart;
      while (exprEnd < len) {
        const cc = lineText.charCodeAt(exprEnd);
        if (cc === 92 && exprEnd + 1 < len) {
          exprEnd += 2;
          continue;
        }
        if (cc === 96) break;
        exprEnd++;
      }

      if (exprEnd >= len) {
        exprEnd = len;
      }

      const expression = lineText.slice(exprStart, exprEnd);
      const end = exprEnd < len ? exprEnd + 1 : exprEnd;

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
   */
  private tokenizeComment(): Token {
    const input = this.input;
    const len = this.len;
    const start = this.pos;
    const startCol = start - this.lineStartPos + 1;
    let pos = this.pos;

    if (pos + 1 < len && input.charCodeAt(pos + 1) === 47) {
      pos += 2;
    } else {
      pos++;
    }

    while (pos < len) {
      const c0 = input.charCodeAt(pos);
      if (c0 === 10 || c0 === 13) break;
      pos++;
    }

    const text = input.slice(start, pos);
    this.pos = pos;
    return new LexerToken('COMMENT', tokenTypeId('COMMENT'), text, text, start, 0, this.line, startCol);
  }
}