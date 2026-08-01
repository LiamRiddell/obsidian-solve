import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { Token, tokenTypeId, TokenTypes } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import { DiagnosticPipeline, DiagnosticEventType, type DiagnosticEvent } from "@solve-js/diagnostics";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower, buildBindingPowerTable } from "@solve-js/parser/BindingPower";
import { getLocale } from "@solve-js/constants/locales";

/**
 * Matches a CHAINED thousands-grouped integer using "." as the group
 * separator (e.g. "1.234.567"), independent of locale. Kept in sync with
 * the identical constant in NumberParselet.ts (not imported from there —
 * that file transitively re-imports PrecedenceParser via Parser.ts's
 * `export { PrecedenceParser as Parser }`, so importing the other
 * direction would create a circular dependency for the sake of one
 * regex literal). See NumberParselet.ts's copy for the full explanation.
 */
const CHAINED_DOT_THOUSANDS_GROUPS = /^\d{1,3}(\.\d{3}){2,}$/;

/**
 * ── Hybrid Precedence Climbing Parser ─────────────────────────────────────────
 *
 * Two-tier dispatch strategy:
 *
 *   Tier 1 (Fast Path): Inline switch on token.typeId for built-in operators.
 *     - Prefix: NUMBER, IDENT, LPAREN, MINUS, PLUS, STRING
 *     - Infix:  checked via static BP_TABLE (Uint8Array indexed by typeId)
 *     - No Map.get(), no parselet function call overhead for ~95% of tokens
 *
 *   Tier 2 (Plugin Path): ParseletRegistry fallback for custom/plugin tokens.
 *     - Prefix: Map.get(tokenTypeId) for PrefixParselet
 *     - Infix:  Map.get(tokenTypeId) for InfixParselet
 *     - Full flexibility for custom syntax
 *
 * The parser emits directly to a BytecodeBuilder — no AST intermediate.
 * Implements the same public API as the legacy Parser class so existing
 * parselets continue to work without modification.
 */
export class PrecedenceParser {
  private tokens: Token[] = [];
  private current = 0;
  private depth = 0;
  private maxDepth: number;

  /** Cached registry reference — avoids property chain in hot loop */
  private registry: ParseletRegistry;

  /** BytecodeBuilder — set before each parseExpression call */
  private builder!: BytecodeBuilder;

  /** Diagnostic pipeline for parselet-matched events */
  private diagnosticPipeline: DiagnosticPipeline | undefined;
  private currentExpression: string = "";
  private localeCode: string;

  /**
   * Static binding power table — built once at module load, shared across all instances.
   * Index = tokenTypeId, value = binding power (0 = not a built-in infix).
   */
  static readonly BP_TABLE: Uint8Array = buildBindingPowerTable();

  // ── Pre-computed token type IDs for inline dispatch ────────────────────────
  // Prefix built-ins
  private static readonly NUMBER_ID   = tokenTypeId(TokenTypes.NUMBER);
  private static readonly BIGINT_ID   = tokenTypeId(TokenTypes.BIGINT);
  private static readonly STRING_ID   = tokenTypeId(TokenTypes.STRING);
  private static readonly IDENT_ID    = tokenTypeId(TokenTypes.IDENT);
  private static readonly LPAREN_ID   = tokenTypeId(TokenTypes.LPAREN);
  private static readonly RPAREN_ID   = tokenTypeId(TokenTypes.RPAREN);
  private static readonly MINUS_ID    = tokenTypeId(TokenTypes.MINUS);
  private static readonly PLUS_ID     = tokenTypeId(TokenTypes.PLUS);
  private static readonly KEYWORD_ID  = tokenTypeId(TokenTypes.KEYWORD);

  // Infix built-ins (Tier 1 — full inline emission)
  private static readonly STAR_ID     = tokenTypeId(TokenTypes.STAR);
  private static readonly SLASH_ID    = tokenTypeId(TokenTypes.SLASH);
  private static readonly MOD_ID      = tokenTypeId(TokenTypes.MOD);
  private static readonly CARET_ID    = tokenTypeId(TokenTypes.CARET);
  private static readonly LSHIFT_ID   = tokenTypeId(TokenTypes.LSHIFT);
  private static readonly RSHIFT_ID   = tokenTypeId(TokenTypes.RSHIFT);
  private static readonly BIT_AND_ID  = tokenTypeId(TokenTypes.BIT_AND);
  private static readonly BIT_OR_ID   = tokenTypeId(TokenTypes.BIT_OR);
  private static readonly BIT_XOR_ID  = tokenTypeId(TokenTypes.BIT_XOR);
  private static readonly PERCENT_ID  = tokenTypeId(TokenTypes.PERCENT);
  private static readonly OF_ID       = tokenTypeId(TokenTypes.OF);

  /**
   * Inline opcode map for Tier 1 infix operators.
   * tokenTypeId → OpCode. PERCENT and CARET are handled specially (not in this map).
   */
  private static readonly INFIX_OPCODE: Record<number, OpCode> = {
    [tokenTypeId(TokenTypes.PLUS)]:    OpCode.ADD,
    [tokenTypeId(TokenTypes.MINUS)]:   OpCode.SUB,
    [tokenTypeId(TokenTypes.STAR)]:    OpCode.MUL,
    [tokenTypeId(TokenTypes.SLASH)]:   OpCode.DIV,
    [tokenTypeId(TokenTypes.MOD)]:     OpCode.MOD,
    [tokenTypeId(TokenTypes.CARET)]:   OpCode.EXP,
    [tokenTypeId(TokenTypes.LSHIFT)]:  OpCode.LSHIFT,
    [tokenTypeId(TokenTypes.RSHIFT)]:  OpCode.RSHIFT,
    [tokenTypeId(TokenTypes.BIT_AND)]: OpCode.BIT_AND,
    [tokenTypeId(TokenTypes.BIT_OR)]:  OpCode.BIT_OR,
    [tokenTypeId(TokenTypes.BIT_XOR)]: OpCode.BIT_XOR,
    [tokenTypeId(TokenTypes.OF)]:      OpCode.MUL,
  };

  constructor(parseletRegistry: ParseletRegistry, maxDepth = 50, localeCode = "en") {
    this.registry = parseletRegistry;
    this.maxDepth = maxDepth;
    this.localeCode = localeCode;
  }

  /** Get locale code for NumberParselet to normalize separators */
  getLocaleCode(): string {
    return this.localeCode;
  }

  /**
   * Set the diagnostic pipeline for parselet matching events.
   * Cleared after each non-cached parse to avoid holding refs.
   */
  setDiagnosticPipeline(pipeline: DiagnosticPipeline | undefined, expression: string): void {
    this.diagnosticPipeline = pipeline;
    this.currentExpression = expression ?? "";
  }

  /**
   * Load tokens for parsing. Identical to Parser.load().
   *
   * @param hasParens - if false, skips the O(n) paren balance scan (~90% of expressions)
   */
  load(tokens: Token[], hasParens?: boolean): void {
    if (hasParens === false) {
      this.tokens = tokens;
      this.current = 0;
      this.depth = 0;
      return;
    }
    // Paren scan: count balance to skip array copy for balanced expressions.
    const LPAREN_ID = tokenTypeId(TokenTypes.LPAREN);
    const RPAREN_ID = tokenTypeId(TokenTypes.RPAREN);
    let openCount = 0;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].typeId === LPAREN_ID) openCount++;
      else if (tokens[i].typeId === RPAREN_ID) openCount--;
    }
    this.tokens = openCount === 0 ? tokens : this.balanceParens(tokens, openCount);
    this.current = 0;
    this.depth = 0;
  }

  /**
   * Auto-balance unmatched parentheses.
   */
  private balanceParens(tokens: Token[], openCount: number): Token[] {
    const result = tokens.slice();
    if (openCount > 0) {
      const RPAREN_ID = tokenTypeId(TokenTypes.RPAREN);
      for (let i = 0; i < openCount; i++) {
        const lastToken = tokens[tokens.length - 1];
        result.push({
          type: TokenTypes.RPAREN,
          typeId: RPAREN_ID,
          value: ")",
          text: ")",
          offset: lastToken ? lastToken.offset + lastToken.text.length : 0,
          lineBreaks: 0,
          line: lastToken ? lastToken.line : 1,
          col: lastToken ? lastToken.col + lastToken.text.length : 1,
        } as Token);
      }
    } else if (openCount < 0) {
      const LPAREN_ID = tokenTypeId(TokenTypes.LPAREN);
      for (let i = 0; i < -openCount; i++) {
        result.unshift({
          type: TokenTypes.LPAREN,
          typeId: LPAREN_ID,
          value: "(",
          text: "(",
          offset: 0,
          lineBreaks: 0,
          line: 1,
          col: 1,
        } as Token);
      }
    }
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Main entry point: precedence climbing parse expression
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Parse a full expression starting at the current token position.
   *
   * @param minBp - minimum binding power (precedence climbing threshold).
   *   For left-associative operators, the recursive call uses `bp + 1`.
   *   For right-associative operators (^), it uses `bp`.
   * @param _builder - accepted for parselet API compatibility; always uses `this.builder`.
   */
  parseExpression(minBp: number = 0, _builder?: BytecodeBuilder): void {
    // Accept builder via parameter for backward compatibility with the old Parser API.
    // The ExpressionEngine always calls setBuilder() before parseExpression(),
    // but tests and parselets pass builder as a parameter.
    if (_builder) {
      this.builder = _builder;
    }
    this.depth++;
    if (this.depth > this.maxDepth) {
      this.depth--;
      throw ErrorFactory.parsing(
        "NESTING_DEPTH_EXCEEDED",
        `Parse nesting depth ${this.depth} exceeds maximum of ${this.maxDepth}`,
        { maxDepth: this.maxDepth, currentDepth: this.depth }
      );
    }

    const token = this.consume();
    if (!token) {
      this.depth--;
      throw ErrorFactory.parsing("UNEXPECTED_END", "Unexpected end of expression");
    }

    // ── Prefix ──────────────────────────────────────────────────────────────
    this.parsePrefix(token);

    // ── Infix loop (precedence climbing with inline Tier 1 dispatch) ──────────
    const tokens = this.tokens;
    const len = tokens.length;
    const bpTable = PrecedenceParser.BP_TABLE;
    const registry = this.registry;
    const builder = this.builder;
    let idx = this.current;

    while (idx < len) {
      const lookahead = tokens[idx];
      if (!lookahead) break;

      const bp = bpTable[lookahead.typeId];
      if (bp > 0) {
        // ⚡ Tier 1: Built-in infix — full inline emission, zero parselet delegation
        if (bp <= minBp) break;

        if (this.diagnosticPipeline) {
          // Fast path skips the registry, but built-ins are still registered
          // there (for introspection/tests) — look them up only in this
          // diagnostics-only branch so the playground's "matched parselets"
          // view isn't permanently blind to every arithmetic operator.
          const infixParselet = registry.getInfix(lookahead.typeId);
          if (infixParselet) {
            this.fireParseletMatched(infixParselet, lookahead, false, bp);
          }
        }

        this.current = ++idx;
        const typeId = lookahead.typeId;

        if (typeId === PrecedenceParser.PERCENT_ID) {
          // Postfix: no right operand. "50%" → value / 100
          builder.emitOpcode(OpCode.PUSH_NUMBER);
          builder.emitNumber(100);
          builder.emitOpcode(OpCode.DIV);
        } else {
          // Infix: parse right operand, then emit opcode.
          // Right-associative for CARET (^), left-associative for all others.
          const rightBp = (typeId === PrecedenceParser.CARET_ID) ? bp : bp + 1;
          this.parseExpression(rightBp, builder);
          builder.emitOpcode(PrecedenceParser.INFIX_OPCODE[typeId]);
        }
      } else {
        // Tier 2: Plugin parselet fallback — full flexibility for custom syntax
        const infixParselet = registry.getInfix(lookahead.typeId);
        if (!infixParselet) break;
        if (infixParselet.bindingPower <= minBp) break;

        this.current = ++idx;

        if (this.diagnosticPipeline) {
          this.fireParseletMatched(infixParselet, lookahead, false, infixParselet.bindingPower);
        }
        // Parselet handles its own recursion for right operand internally
        infixParselet.parse(this as any, token, lookahead, builder);
      }

      idx = this.current;
    }

    this.current = idx;
    this.depth--;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Prefix dispatch: inline switch for built-ins, parselet registry for plugins
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Parse a prefix token. Built-in tokens (NUMBER, IDENT, LPAREN, etc.) are
   * handled inline with zero registry lookup. Everything else falls through
   * to the parselet registry (Tier 2).
   */
  private parsePrefix(token: Token): void {
    const builder = this.builder;
    const typeId = token.typeId;

    if (this.diagnosticPipeline) {
      // Fast path below skips the registry for built-ins, but they're still
      // registered there (for introspection/tests) — look up here so the
      // playground's "matched parselets" view isn't permanently blind to
      // every number, identifier, paren, and unary operator.
      const parselet = this.registry.getPrefix(typeId);
      if (parselet) {
        this.fireParseletMatched(parselet, token, true);
      }
    }

    switch (typeId) {
      // ── Numeric literals ──────────────────────────────────────────────────
      case PrecedenceParser.NUMBER_ID: {
        // Parse number with locale-aware separator normalization
        let v: number;
        const raw = token.value;
        if (raw.startsWith("0x") || raw.startsWith("0X")) {
          v = parseInt(raw, 16);
          // A prefix with no digits after it ("0x" alone) makes parseInt
          // return NaN — this used to push straight through as a silent
          // NaN Number value instead of a visible error.
          if (Number.isNaN(v)) {
            throw ErrorFactory.parsing("INVALID_NUMBER_LITERAL", `Invalid hex literal: "${raw}"`, { raw });
          }
        } else if (raw.startsWith("0b") || raw.startsWith("0B")) {
          v = parseInt(raw.slice(2), 2);
          if (Number.isNaN(v)) {
            throw ErrorFactory.parsing("INVALID_NUMBER_LITERAL", `Invalid binary literal: "${raw}"`, { raw });
          }
        } else if (raw.startsWith("0o") || raw.startsWith("0O")) {
          v = parseInt(raw.slice(2), 8);
          if (Number.isNaN(v)) {
            throw ErrorFactory.parsing("INVALID_NUMBER_LITERAL", `Invalid octal literal: "${raw}"`, { raw });
          }
        } else if (CHAINED_DOT_THOUSANDS_GROUPS.test(raw)) {
          // The lexer accepts "." as a thousands-group separator
          // independent of locale (ExpressionLexer's number-scanning
          // "Thousands separators" block), but the locale-based
          // normalization below only strips the ACTIVE locale's own
          // configured thousandsSeparator character — for "en" that's
          // ",", not ".", so a chained dot-grouped literal like
          // "1.234.567" fell through to parseFloat() untouched, which
          // stops at the second "." and silently truncated it to 1.234
          // (over 99% of the digits dropped, with no error). This is the
          // REAL number-parsing path for actual evaluation — Tier 1 of
          // the two-tier dispatch above always returns for NUMBER_ID, so
          // NumberParselet.parse() (which has the identical fix) never
          // actually runs except via direct unit tests / the "matched
          // parselets" diagnostic display.
          v = parseFloat(raw.split(".").join(""));
        } else {
          const locale = getLocale(this.localeCode);
          const decimalSep = locale.display.decimalSeparator;
          const thousandsSep = locale.display.thousandsSeparator;
          let normalized = raw;
          // Replace thousands separator with empty string (split+join avoids per-call RegExp compilation)
          if (thousandsSep) {
            normalized = normalized.split(thousandsSep).join("");
          }
          // Replace locale decimal separator with "." for JavaScript parsing
          if (decimalSep && decimalSep !== ".") {
            normalized = normalized.replace(decimalSep, ".");
          }
          v = parseFloat(normalized);
        }
        builder.emitOpcode(OpCode.PUSH_NUMBER);
        builder.emitNumber(v);
        return;
      }

      case PrecedenceParser.BIGINT_ID: {
        // Strip optional 'n' suffix before emitting as string
        let raw = token.value;
        if (raw.endsWith("n")) raw = raw.slice(0, -1);
        builder.emitOpcode(OpCode.PUSH_BIGINT);
        builder.emitString(raw);
        return;
      }

      case PrecedenceParser.STRING_ID: {
        builder.emitOpcode(OpCode.PUSH_STRING);
        builder.emitString(token.value);
        return;
      }

      // ── Identifiers (variables) ────────────────────────────────────────────
      case PrecedenceParser.IDENT_ID: {
        // IDENT tokens map to LOAD_VAR by default. The IdentifierParselet
        // and VariableParselet add STORE_VAR for assignments — those are
        // handled via the parselet registry below.
        builder.emitOpcode(OpCode.LOAD_VAR);
        builder.emitString(token.value);
        return;
      }

      // ── Grouping / bare-tuple vector literal ─────────────────────────────────
      // `(expr)` groups for precedence; `(x, y[, z[, w]])` is the bare-tuple
      // vector literal documented as an alternative to vec2/vec3/vec4(...)
      // (wiki: Arithmetic/Vector). This Tier-1 case is what actually runs for
      // every LPAREN in production parsing — GroupParselet.ts mirrors this
      // logic for registry-introspection/diagnostic-listing purposes, but a
      // package can never override LPAREN's dispatch here (Tier 1 always
      // wins over the ParseletRegistry fallback below), so both must be kept
      // in sync by hand.
      case PrecedenceParser.LPAREN_ID: {
        this.parseExpression(0, builder);
        let count = 1;
        while (this.match(TokenTypes.COMMA)) {
          this.parseExpression(0, builder);
          count++;
        }
        this.consume(TokenTypes.RPAREN);
        if (count > 1) {
          builder.emitOpcode(OpCode.ARR_NEW);
          builder.emitIndex(count);
        }
        return;
      }

      // ── Unary operators ───────────────────────────────────────────────────
      case PrecedenceParser.MINUS_ID: {
        this.parseExpression(BindingPower.Prefix, builder);
        builder.emitOpcode(OpCode.NEG);
        return;
      }

      case PrecedenceParser.PLUS_ID: {
        this.parseExpression(BindingPower.Prefix, builder);
        builder.emitOpcode(OpCode.POS);
        return;
      }

      // ── Keyword constants ─────────────────────────────────────────────────
      case PrecedenceParser.KEYWORD_ID: {
        // Keywords are handled by parselets (pi→PI, e→E, etc.)
        // Fall through to registry below.
      }
    }

    // ── Tier 2: Plugin/parselet prefix path ──────────────────────────────────
    const prefixParselet = this.registry.getPrefix(typeId);
    if (!prefixParselet) {
      throw ErrorFactory.parsing(
        "NO_PREFIX_PARSELET",
        `No prefix parselet found for token: ${token.type} ("${token.value}")`,
        { tokenType: token.type, tokenValue: token.value }
      );
    }

    prefixParselet.parse(this as any, token, builder);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Token stream navigation (identical API to Parser)
  // ═══════════════════════════════════════════════════════════════════════════════

  consume(expectedType?: string): Token {
    const token = this.tokens[this.current];
    if (!token) {
      throw ErrorFactory.parsing(
        "UNEXPECTED_END_OF_INPUT",
        "Unexpected end of input"
      );
    }
    if (expectedType !== undefined) {
      const expectedId = tokenTypeId(expectedType);
      if (token.typeId !== expectedId) {
        throw ErrorFactory.parsing(
          "UNEXPECTED_TOKEN_TYPE",
          `Expected token type "${expectedType}" but got "${token.type}" ("${token.value}")`,
          { expectedType, actualType: token.type, actualValue: token.value }
        );
      }
    }
    this.current++;
    return token;
  }

  match(expectedType: string): boolean {
    const token = this.peek();
    if (token && token.typeId === tokenTypeId(expectedType)) {
      this.advance();
      return true;
    }
    return false;
  }

  peek(): Token | undefined {
    return this.tokens[this.current];
  }

  previous(): Token | undefined {
    return this.current > 0 ? this.tokens[this.current - 1] : undefined;
  }

  private advance(): void {
    this.current++;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Builder access — set before parse, read by inline prefix handlers
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Set the builder to use for the current parse. Called by ExpressionEngine. */
  setBuilder(builder: BytecodeBuilder): void {
    this.builder = builder;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Diagnostics
  // ═══════════════════════════════════════════════════════════════════════════════

  private fireParseletMatched(
    parselet: { category: string },
    token: Token,
    isPrefix: boolean,
    bindingPower?: number
  ): void {
    const pipeline = this.diagnosticPipeline!;
    const event: DiagnosticEvent & { type: "parselet_matched" } = {
      type: DiagnosticEventType.ParseletMatched,
      elapsedNs: 0,
      expression: this.currentExpression,
      tokenType: token.type,
      tokenValue: token.value,
      parseletCategory: parselet.category,
      parseletType: (parselet as any).constructor?.name ?? "unknown",
      isPrefix,
      bindingPower,
      tokenOffset: token.offset || 0,
    };
    pipeline.fireParseletMatched(event);
  }
}
