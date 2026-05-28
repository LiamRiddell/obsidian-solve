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

// Pre-compute phrase list — these are the multi-word expressions that
// the existing MarkdownLexer handles as compound tokens.
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
    }

    if (plugin.units) {
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
    }

    if (plugin.phrases) {
      for (const entry of plugin.phrases) {
        const lowerPhrase = entry.phrase.toLowerCase();
        const idx = this.pluginPhrases.findIndex(p => p.phrase === lowerPhrase);
        if (idx !== -1) {
          this.pluginPhrases.splice(idx, 1);
        }
      }
    }

    if (plugin.units) {
      for (const unit of plugin.units) {
        this.pluginUnits.delete(unit);
      }
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
   * Tokenize an expression string into an array of Tokens.
   *
   * Optimizations:
   *  - CHAR_CLASS jump table (Uint8Array) → switch on small integers
   *  - Direct character-code dispatch (c0 cached pattern)
   *  - Mathematical digit parsing (integer math, not slice+parseFloat)
   *  - Inline operator tokenizer with two-char peek-ahead
   *  - Whitespace eliminated in-lexer (never emitted)
   *  - 0-char and 1-char fast paths
   */
  tokenizeAll(mode: 'expression' | 'markdown' = 'expression'): Token[] {
    const len = this.len;

    // ── 0-char fast path ────────────────────────────────────────────────
    if (len === 0) return [];

    // ── 1-char fast path ────────────────────────────────────────────────
    if (len === 1) {
      const result: Token[] = [];
      const c0 = this.input.charCodeAt(0);
      const cc = ExpressionLexer.CHAR_CLASS[c0] ?? CharClass.SKIP;

      if (cc === CharClass.DIGIT || cc === CharClass.DOT) {
        result.push(new LexerToken('NUMBER', this.input, this.input, 0, 0, 1, 1));
      } else if (cc === CharClass.ALPHA) {
        const input = this.input;
        const identLower = input.toLowerCase();
        // Unit lookup (case-sensitive, takes priority over keywords)
        // Check both built-in units and plugin-registered units
        if (knownUnits.has(input) || this.pluginUnits.has(input)) {
          result.push(new LexerToken('UNIT', input, input, 0, 0, 1, 1));
        }
        // Inline solve check: lone 's' without backtick is not inline solve
        // (only 's`' with backtick triggers INLINE_SOLVE_START, but 1-char
        // input can't have a backtick, so this is always IDENT/UNIT/keyword)
        else {
          const kwType = this.keywordMap.get(identLower);
          if (kwType) {
            result.push(new LexerToken(kwType, input, input, 0, 0, 1, 1));
          } else {
            // Check plugin keywords (not checked by the locale keywordMap lookup)
            const pluginKwType = this.pluginKeywordMap.get(identLower);
            result.push(new LexerToken(pluginKwType || 'IDENT', input, input, 0, 0, 1, 1));
          }
        }
      } else if (c0 === 36) {
        result.push(new LexerToken('DOLLAR', '$', '$', 0, 0, 1, 1));
      } else {
        const opType = OP_MAP[c0];
        if (opType) {
          result.push(new LexerToken(opType, this.input, this.input, 0, 0, 1, 1));
        }
      }
      return result;
    }

    const result: Token[] = [];
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
          result.push(this.tokenizeNumber());
          break;

        // ── Alpha / underscore — identifier or keyword ────────────────
        case CharClass.ALPHA:
          result.push(this.tokenizeIdentifier());
          break;

        // ── Dot — could be decimal (.5) or DOT token ─────────────────
        case CharClass.DOT:
          if (this.pos + 1 < len) {
            const nextCc = ExpressionLexer.CHAR_CLASS[input.charCodeAt(this.pos + 1)] ?? CharClass.SKIP;
            if (nextCc === CharClass.DIGIT) {
              result.push(this.tokenizeNumber());
            } else {
              const col = this.pos - this.lineStartPos + 1;
              result.push(new LexerToken('DOT', '.', '.', this.pos, 0, this.line, col));
              this.pos++;
            }
          } else {
            const col = this.pos - this.lineStartPos + 1;
            result.push(new LexerToken('DOT', '.', '.', this.pos, 0, this.line, col));
            this.pos++;
          }
          break;

        // ── Operator / punctuation ────────────────────────────────────
        case CharClass.OPERATOR:
          result.push(this.tokenizeOperator());
          break;

        // ── String literal ────────────────────────────────────────────
        case CharClass.QUOTE:
          result.push(this.tokenizeString());
          break;

        // ── Comment (# or //) ─────────────────────────────────────────
        case CharClass.HASH:
          result.push(this.tokenizeComment());
          break;

        // ── Dollar sign $ ─────────────────────────────────────────────
        case CharClass.DOLLAR: {
          const col = this.pos - this.lineStartPos + 1;
          result.push(new LexerToken('DOLLAR', '$', '$', this.pos, 0, this.line, col));
          this.pos++;
          break;
        }

        // ── Backtick ` ───────────────────────────────────────────────
        case CharClass.BACKTICK: {
          const col = this.pos - this.lineStartPos + 1;
          result.push(new LexerToken('BACKTICK_OPEN', '`', '`', this.pos, 0, this.line, col));
          this.pos++;
          break;
        }

        // ── Non-ASCII characters ─────────────────────────────────────
        default: {
          const col = this.pos - this.lineStartPos + 1;
          if (c0 === 0x00D7) {  // × → STAR
            result.push(new LexerToken('STAR', '\u00D7', '\u00D7', this.pos, 0, this.line, col));
          } else if (c0 === 0x00F7) {  // ÷ → SLASH
            result.push(new LexerToken('SLASH', '\u00F7', '\u00F7', this.pos, 0, this.line, col));
          } else if (c0 === 0x2260) {  // ≠ → NEQ
            result.push(new LexerToken('NEQ', '\u2260', '\u2260', this.pos, 0, this.line, col));
          } else if (c0 === 0x00A3) {  // £
            result.push(new LexerToken('POUND', '\u00A3', '\u00A3', this.pos, 0, this.line, col));
          } else if (c0 === 0x20AC) {  // €
            result.push(new LexerToken('EURO', '\u20AC', '\u20AC', this.pos, 0, this.line, col));
          } else if (c0 >= 128) {
            // Unknown unicode — treat as IDENT for forward compatibility
            // (future: Greek letters for math, accented variable names)
            result.push(this.tokenizeIdentifier());
          } else {
            // Unknown ASCII — silently skip
            this.pos++;
          }
          break;
        }
      }
    }

    return result;
  }

  // ── Iterator protocol ──────────────────────────────────────────────────
  // Supports for...of usage: `for (const t of lexer)`
  [Symbol.iterator](): Iterator<Token> {
    return this.tokenizeAll()[Symbol.iterator]();
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
    // 1) Built-in units
    if (knownUnits.has(identText)) {
      this.pos = pos;
      return new LexerToken('UNIT', identText, identText, start, 0, this.line, startCol);
    }
    // 2) Plugin-registered units
    if (this.pluginUnits.has(identText)) {
      this.pos = pos;
      return new LexerToken('UNIT', identText, identText, start, 0, this.line, startCol);
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
    const pluginKwType = this.pluginKeywordMap.get(identLower);
    if (pluginKwType) {
      this.pos = pos;
      return new LexerToken(pluginKwType, identText, identText, start, 0, this.line, startCol);
    }

    this.pos = pos;
    return new LexerToken('IDENT', identText, identText, start, 0, this.line, startCol);
  }

  // ── Phrase matcher ────────────────────────────────────────────────────
  /**
   * After reading a first identifier, try to match a multi-word phrase
   * like "to the power of" or "increase by".
   *
   * Returns the matched phrase info if successful, null otherwise.
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

    // Collect candidate words
    const wordsLower: string[] = [firstWordLower];
    const wordsOriginal: string[] = [firstWordOriginal];
    let scanPos = pos;

    // Read additional words separated by single spaces
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

      const word = input.slice(wordStart, scanPos);
      wordsLower.push(word.toLowerCase());
      wordsOriginal.push(word);

      // Build candidate and check against phrase list
      const candidate = wordsLower.join(' ');

      // Check built-in phrases first (take priority)
      for (let i = 0; i < ExpressionLexer.PHRASES.length; i++) {
        const phrase = ExpressionLexer.PHRASES[i];
        if (phrase.phrase === candidate) {
          return {
            type: phrase.type,
            text: wordsOriginal.join(' '),
            endPos: scanPos,
          };
        }
      }

      // Check plugin-registered phrases
      for (let i = 0; i < this.pluginPhrases.length; i++) {
        const phrase = this.pluginPhrases[i];
        if (phrase.phrase === candidate) {
          return {
            type: phrase.type,
            text: wordsOriginal.join(' '),
            endPos: scanPos,
          };
        }
      }

      // Check if this prefix can still lead to any built-in phrase
      let viablePrefix = false;
      for (let i = 0; i < ExpressionLexer.PHRASES.length; i++) {
        if (ExpressionLexer.PHRASES[i].phrase.startsWith(candidate + ' ')) {
          viablePrefix = true;
          break;
        }
      }

      // Also check plugin phrases for viable prefix
      if (!viablePrefix) {
        for (let i = 0; i < this.pluginPhrases.length; i++) {
          if (this.pluginPhrases[i].phrase.startsWith(candidate + ' ')) {
            viablePrefix = true;
            break;
          }
        }
      }

      if (!viablePrefix) break;
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
   * Classify a single line of markdown text using character-by-character
   * scanning. Determines whether the line is a markdown structural element
   * (heading, list, blockquote, code fence, etc.) or an evaluable expression.
   *
   * Replaces the regex-based heuristics in `isEmptyLine()` with a single-pass
   * state machine that classifies the line by examining the first non-whitespace
   * characters. Also detects inline solve markers (`s`...``).
   *
   * **Classification rules (in priority order):**
   * 1. Empty/whitespace-only → empty
   * 2. `#{1,6} ` → heading (always skip)
   * 3. `#...` not matching heading → comment (always skip)
   * 4. `> ` → blockquote (always skip)
   * 5. ` ``` ` or `~~~` → code fence (always skip)
   * 6. `$$` → math fence (always skip)
   * 7. `---`, `***`, `___` (3+ same char, nothing else) → horizontal rule (skip)
   * 8. `- `, `* `, `+ ` → unordered list item (always evaluate)
   * 9. `\d+\. ` → ordered list item (always evaluate)
   * 10. `|` → table row or table separator
   * 11. `[[` or `![[` → wikilink/embed (standalone, skip)
   * 12. `//` → comment (always skip)
   * 13. Everything else → expression line
   *
   * **Skip rules:** Headings, blockquotes, comments, code/math fences, HRs,
   * wikilinks/embeds, and table separators are always skipped. Lists (ordered
   * and unordered) and expression lines are always evaluated.
   *
   * @param lineText The raw line text (without trailing newline).
   * @returns A LineClassification indicating type, skip status, and inline solve presence.
   */
  classifyLine(lineText: string): LineClassification {
    const len = lineText.length;

    // ── 0-length fast path ────────────────────────────────────────────
    if (len === 0) {
      return { type: 'empty', skip: true, hasInlineSolve: false };
    }

    let pos = 0;

    // ── Skip leading whitespace ─────────────────────────────────────────
    while (pos < len) {
      const cc = lineText.charCodeAt(pos);
      if (cc !== 32 && cc !== 9) break;
      pos++;
    }

    if (pos >= len) {
      return { type: 'empty', skip: true, hasInlineSolve: false };
    }

    const c0 = lineText.charCodeAt(pos);
    // hasInline is computed lazily — only for branch types that need it.
    // Computing indexOf('s`') before early-return checks wastes ~15-20% of
    // classifyLine time on heading/blockquote/HR-heavy documents.
    let hasInline: boolean | undefined;

    // ── Heading / Comment: #{1,6} ' ' or #... ─────────────────────
    // Headings are always skipped — they're structural markdown, not expressions.
    // Lines starting with # that don't match the heading pattern are comments.
    if (c0 === 35) {  // #
      let hashCount = 1;
      while (pos + hashCount < len && lineText.charCodeAt(pos + hashCount) === 35) {
        hashCount++;
      }
      if (hashCount <= 6 && pos + hashCount < len && lineText.charCodeAt(pos + hashCount) === 32) {
        // Standard heading marker #{1,6} ' ' — always skip
        return { type: 'heading', skip: true, hasInlineSolve: false };
      }
      // Not a heading pattern — treat as comment, always skip
      return { type: 'heading', skip: true, hasInlineSolve: false };
    }

    // ── Blockquote: > ' ' ────────────────────────────────────────────
    // Blockquotes are always skipped — they're structural markdown.
    // Line number tracking is handled by the caller (evaluateLines).
    if (c0 === 62) {  // >
      if (pos + 1 < len && lineText.charCodeAt(pos + 1) === 32) {
        return { type: 'blockquote', skip: true, hasInlineSolve: false };
      }
    }

    // ── Code fence: ``` or ~~~ ────────────────────────────────────────
    if (c0 === 96 && pos + 2 < len && lineText.charCodeAt(pos + 1) === 96 && lineText.charCodeAt(pos + 2) === 96) {
      return { type: 'code_fence', skip: true, hasInlineSolve: false };
    }
    if (c0 === 126 && pos + 2 < len && lineText.charCodeAt(pos + 1) === 126 && lineText.charCodeAt(pos + 2) === 126) {
      return { type: 'code_fence', skip: true, hasInlineSolve: false };
    }

    // ── Math fence: $$ ────────────────────────────────────────────────
    if (c0 === 36 && pos + 1 < len && lineText.charCodeAt(pos + 1) === 36) {
      return { type: 'math_fence', skip: true, hasInlineSolve: false };
    }

    // ── Horizontal rule: ---, ***, ___ (3+ same char, then only whitespace)
    if (c0 === 45 || c0 === 42 || c0 === 95) {  // -, *, _
      let count = 1;
      while (pos + count < len && lineText.charCodeAt(pos + count) === c0) {
        count++;
      }
      if (count >= 3) {
        // Verify nothing but whitespace follows
        let trailPos = pos + count;
        while (trailPos < len && (lineText.charCodeAt(trailPos) === 32 || lineText.charCodeAt(trailPos) === 9)) {
          trailPos++;
        }
        if (trailPos >= len) {
          return { type: 'hr', skip: true, hasInlineSolve: false };
        }
      }
    }

    // ── Unordered list: - ' ', * ' ', + ' ' ──────────────────────────
    // List items are always evaluated (even bare ones) — the content after
    // the marker may contain expressions.
    if ((c0 === 45 || c0 === 42 || c0 === 43) && pos + 1 < len && lineText.charCodeAt(pos + 1) === 32) {
      if (hasInline === undefined) hasInline = lineText.indexOf('s`', pos) !== -1;
      return { type: 'list', skip: false, hasInlineSolve: hasInline };
    }

    // ── Ordered list: \d+ '. ' ────────────────────────────────────────
    // Ordered list items are always evaluated — the content may contain expressions.
    if (c0 >= 48 && c0 <= 57) {  // 0-9
      let digitPos = pos;
      while (digitPos < len && lineText.charCodeAt(digitPos) >= 48 && lineText.charCodeAt(digitPos) <= 57) {
        digitPos++;
      }
      if (digitPos < len && lineText.charCodeAt(digitPos) === 46) {  // .
        if (digitPos + 1 < len && lineText.charCodeAt(digitPos + 1) === 32) {
          if (hasInline === undefined) hasInline = lineText.indexOf('s`', pos) !== -1;
          return { type: 'list', skip: false, hasInlineSolve: hasInline };
        }
      }
    }

    // ── Table / table separator: | ────────────────────────────────────
    if (c0 === 124) {  // |
      // Detect table separator: |--| or |:--:| etc.
      // Use character-by-character scan instead of regex to avoid
      // intermediate string allocation (lineText.slice) and regex overhead.
      let tPos = pos + 1;
      while (tPos < len) {
        const tc = lineText.charCodeAt(tPos);
        if (tc !== 45 && tc !== 58 && tc !== 124 && tc !== 32 && tc !== 9 && tc !== 13) break;
        tPos++;
      }
      if (tPos >= len) {
        return { type: 'table_separator', skip: true, hasInlineSolve: false };
      }
      // Table data row — fall through to expression classification
    }

    // ── Wikilink / embed: [[ or ![[ ───────────────────────────────────
    // Must verify the line is ONLY a wikilink (only whitespace follows `]]`).
    // Lines like "[[page]] 1 + 2" are expression lines, not wikilinks.
    if (c0 === 91 && pos + 1 < len && lineText.charCodeAt(pos + 1) === 91) {
      const closePos = lineText.indexOf(']]', pos + 2);
      if (closePos !== -1) {
        let trailPos = closePos + 2;
        while (trailPos < len && (lineText.charCodeAt(trailPos) === 32 || lineText.charCodeAt(trailPos) === 9)) {
          trailPos++;
        }
        if (trailPos >= len) {
          return { type: 'wikilink', skip: true, hasInlineSolve: false };
        }
      }
    }
    if (c0 === 33 && pos + 2 < len && lineText.charCodeAt(pos + 1) === 91 && lineText.charCodeAt(pos + 2) === 91) {
      const closePos = lineText.indexOf(']]', pos + 3);
      if (closePos !== -1) {
        let trailPos = closePos + 2;
        while (trailPos < len && (lineText.charCodeAt(trailPos) === 32 || lineText.charCodeAt(trailPos) === 9)) {
          trailPos++;
        }
        if (trailPos >= len) {
          return { type: 'wikilink', skip: true, hasInlineSolve: false };
        }
      }
    }

    // ── Comment: // ──────────────────────────────────────────────────
    if (c0 === 47 && pos + 1 < len && lineText.charCodeAt(pos + 1) === 47) {
      return { type: 'comment', skip: true, hasInlineSolve: false };
    }

    // ── Default: expression line ──────────────────────────────────────
    // Bare blockquote marker > (no space) — always skip
    if (c0 === 62) {  // > — bare blockquote without space
      let trail = pos + 1;
      while (trail < len && (lineText.charCodeAt(trail) === 32 || lineText.charCodeAt(trail) === 9)) trail++;
      if (trail >= len) return { type: 'blockquote', skip: true, hasInlineSolve: false };
    }
    // Bare list markers - * + (no space) — always evaluate (they're valid operators)
    if (c0 === 45 || c0 === 42 || c0 === 43) {  // - * +
      let trail = pos + 1;
      while (trail < len && (lineText.charCodeAt(trail) === 32 || lineText.charCodeAt(trail) === 9)) trail++;
      if (trail >= len) return { type: 'list', skip: false, hasInlineSolve: false };
    }
    if (hasInline === undefined) hasInline = lineText.indexOf('s`', pos) !== -1;
    return { type: 'expression', skip: false, hasInlineSolve: hasInline };
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
