import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { Token, tokenTypeId, TokenTypes } from "@solve-js/lexer/Token";
import { BytecodeBuilder, type BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";
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
        } else if (typeId === PrecedenceParser.CARET_ID && this.tryEmitMatrixCaretOp(builder)) {
          // `^T` (transpose) or `^-1` (inverse) — already fully handled,
          // including consuming their own trailing tokens.
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
        // An identifier immediately followed by "(" may be a user-defined
        // function DEFINITION (`f(x) = ...`) or CALL (`f(5)`) — see
        // parseUserFunctionDefOrCall's doc comment for the full
        // disambiguation. Only the (cheap) LPAREN check runs for the
        // overwhelmingly common case of a bare identifier with nothing
        // following it.
        if (this.peek()?.typeId === PrecedenceParser.LPAREN_ID) {
          this.parseUserFunctionDefOrCall(token, builder);
          return;
        }
        // IDENT tokens map to LOAD_VAR by default. The IdentifierParselet
        // and VariableParselet add STORE_VAR for assignments — those are
        // handled via the parselet registry below. Note this is also how a
        // user-defined function's own PARAMETER references compile — see
        // UserFunctionDef's doc comment in BytecodeBuilder.ts for why there
        // is no separate parameter-load opcode: `LOAD_VAR` resolution
        // dynamically checks the VM's innermost call frame first.
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
          // Legacy bare-tuple vector sugar — a 1xN row-vector Matrix (see
          // packages/vector/parselets/VectorParselet.ts's comment).
          builder.emitOpcode(OpCode.MAT_NEW);
          builder.emitIndex(1);
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
  // The "Tier-1 shape-exception" pattern
  // ═══════════════════════════════════════════════════════════════════════════════
  //
  // Tier 1 exists purely for performance — avoid a Map lookup + parselet call
  // on ~95% of tokens (see this file's own module doc comment above). A
  // recurring consequence: any grammar shape tied to a Tier-1 token type can
  // ONLY be implemented by hand-editing this switch, since a package-
  // registered ParseletRegistry parselet for that same token type would
  // simply never run in production (Tier 1 always wins over the registry
  // fallback). Five confirmed instances of this tension exist in this file
  // (plus one that had to move OUTSIDE it entirely):
  //   1. NUMBER_ID — the full locale-aware number-literal parsing (hex/
  //      binary/octal, chained-dot thousands grouping, decimal-separator
  //      normalization) is inlined in parsePrefix() above; NumberParselet.ts's
  //      own copy is dead code for real evaluation, kept registered only for
  //      the "matched parselets" diagnostic view.
  //   2. IDENT_ID — parseUserFunctionDefOrCall's lookahead (below) disambig-
  //      uates a function DEFINITION from a CALL from a plain variable load.
  //   3. LPAREN_ID — the bare-tuple vector-literal sugar ("(x,y[,z[,w]])" ->
  //      MAT_NEW) is inlined in parsePrefix() above; GroupParselet.ts mirrors
  //      it for introspection only and must be kept in sync by hand.
  //   4. CARET_ID — the transpose/inverse suffix table just below.
  //   5. PLUS_ID — the locale word "and" lexes as PLUS (Tier-1, fixed Sum
  //      binding power), so a registry parselet can never intercept it the
  //      way LogicalParselet.ts intercepts "or"/&&/||; unlike the other four,
  //      there's no SHAPE to special-case on here (the token itself IS the
  //      operator), so the workaround lives entirely outside this file, as a
  //      runtime Boolean/Boolean type-check inside vm/VM.ts's OpCode.ADD
  //      handler instead.
  //
  // Deliberate non-goal: none of this is exposed as an IEnginePackage
  // extension point (unlike prefixParselets/infixParselets). Letting
  // third-party packages register their own Tier-1 shape-matchers would put
  // per-package matcher iteration on a genuinely hot path (every CARET/
  // NUMBER/IDENT/LPAREN/PLUS token, matched or not) — a materially bigger,
  // separate product decision than "make this one table more concise," and
  // not one this pattern write-up makes.

  /**
   * A single `^`-suffix shape: `matches` peeks ahead (consuming nothing) to
   * check whether this shape starts at the current position; `emit` is only
   * called immediately after `matches` returned true for that SAME position,
   * and is responsible for consuming that shape's own trailing tokens and
   * emitting its bytecode.
   */
  private static readonly CARET_SUFFIX_RULES: ReadonlyArray<{
    name: string;
    matches(parser: PrecedenceParser): boolean;
    emit(parser: PrecedenceParser, builder: BytecodeBuilder): void;
  }> = [
    {
      name: "transpose (^T)",
      matches: (p) => {
        const next = p.peek();
        return next?.type === TokenTypes.IDENT && next.value === "T";
      },
      emit: (p, builder) => {
        p.advance();
        builder.emitOpcode(OpCode.CALL_BUILTIN);
        builder.emitIndex(63); // transpose — see VMBuiltins.ts
        builder.emitIndex(1);
      },
    },
    {
      name: "inverse (^-1)",
      matches: (p) => {
        const next = p.peek();
        if (next?.typeId !== PrecedenceParser.MINUS_ID) return false;
        const afterMinus = p.peekAt(1);
        return afterMinus?.type === TokenTypes.NUMBER && afterMinus.value === "1";
      },
      emit: (p, builder) => {
        p.advance();
        p.advance();
        builder.emitOpcode(OpCode.CALL_BUILTIN);
        builder.emitIndex(65); // inv — see VMBuiltins.ts
        builder.emitIndex(1);
      },
    },
  ];

  /**
   * After a `^` token (already consumed by the Tier-1 infix loop above),
   * checks {@link CARET_SUFFIX_RULES} in order for a shape that means
   * something other than ordinary exponentiation: `^T` (transpose) and `^-1`
   * (matrix inverse — LITERALLY the integer exponent `-1`; `^-2`, `^-1.5`,
   * etc. still mean ordinary exponentiation). On a match, the rule's `emit`
   * consumes that shape's own tokens and this returns `true`. On no match,
   * consumes NOTHING, returning `false` so the caller falls through to
   * ordinary `EXP` parsing.
   *
   * Every rule dispatches purely on SHAPE, never on operand type (unknowable
   * at parse time): `inv()`'s own handler (`VMBuiltins.ts` index 65) returns
   * `1/x` for a plain Number — byte-identical to what `Math.pow(x, -1)`
   * already computed for `x^-1` before this feature existed — and a real
   * matrix inverse for a Matrix, so `5^-1` still means exactly what it always
   * has; only a Matrix operand actually inverts.
   *
   * Adding a future `^`-suffix shape is a new table entry here, not a new
   * if-block — see the "Tier-1 shape-exception" pattern write-up above for
   * why this table can't instead be a package-registered parselet.
   */
  private tryEmitMatrixCaretOp(builder: BytecodeBuilder): boolean {
    for (const rule of PrecedenceParser.CARET_SUFFIX_RULES) {
      if (rule.matches(this)) {
        rule.emit(this, builder);
        return true;
      }
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // User-defined, parameterized, reusable functions (f(x) = 2*x + 1, then f(5))
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * From an LPAREN token index, scan forward tracking paren depth and
   * return the index of the matching RPAREN, or `null` if the parens never
   * balance before the token stream ends. No emission, no position
   * advance — same class of technique as {@link balanceParens}'s own
   * pre-scan, just exposed mid-parse instead of only at `load()` time.
   * `openIdx` must point AT the LPAREN itself.
   */
  private findMatchingRParen(openIdx: number): number | null {
    let depth = 0;
    for (let i = openIdx; i < this.tokens.length; i++) {
      const t = this.tokens[i];
      if (t.typeId === PrecedenceParser.LPAREN_ID) depth++;
      else if (t.typeId === PrecedenceParser.RPAREN_ID) {
        depth--;
        if (depth === 0) return i;
      }
    }
    return null;
  }

  /**
   * Disambiguates a bare `IDENT` immediately followed by `(` between three
   * things, using ONLY a bracket-depth scan (no backtracking — nothing is
   * consumed until the shape is known):
   * - `f(x) = expr` — a DEFINITION: the matching `)` is followed by `=`.
   * - `f(5)` — a CALL to a (possibly not-yet-defined) function: anything
   *   else. This was never valid syntax before this feature (a bare
   *   `IDENT` immediately before `(` has no pre-existing "plain variable
   *   read + separately grouped `(...)`" meaning to preserve — confirmed
   *   via `BuiltinNormalizerRules.ts`'s `implicitMultiplyRule()`, which
   *   only inserts an implicit `*` for `NUMBER/RPAREN` immediately before
   *   `IDENT/LPAREN`, never for a bare `IDENT` immediately before
   *   `LPAREN`). Always commits to a CALL; an unregistered name produces a
   *   clear `UNDEFINED_FUNCTION` error at VM-execution time — the same
   *   forward-reference philosophy `LOAD_VAR`/`UNDEFINED_VARIABLE` already
   *   uses, rather than any parse-time registry lookup.
   * If the parens never balance, this falls through to the ordinary
   * `LOAD_VAR` path (a malformed expression surfaces its own parse error
   * shortly after, from the normal expression grammar).
   */
  private parseUserFunctionDefOrCall(nameToken: Token, builder: BytecodeBuilder): void {
    const closeIdx = this.findMatchingRParen(this.current);
    if (closeIdx === null) {
      builder.emitOpcode(OpCode.LOAD_VAR);
      builder.emitString(nameToken.value);
      return;
    }
    const afterClose = this.tokens[closeIdx + 1];
    if (afterClose?.type === TokenTypes.EQUALS) {
      this.parseUserFunctionDefinition(nameToken, builder);
    } else {
      this.parseUserFunctionCall(nameToken, builder);
    }
  }

  /**
   * A parameter name, accepted as either `IDENT` or `UNIT` — matches this
   * codebase's established `:name = value` variable-name policy
   * (`VariableParselet.ts` explicitly accepts `UNIT`-typed tokens too, e.g.
   * `:b = 5` for the "b" bits unit) since common short parameter names
   * like `h`/`l`/`b`/`t`/`s`/`m` collide with real unit abbreviations
   * (hour, liter, bits, ton, second, meter, ...) and lex as `UNIT`, not
   * `IDENT`.
   */
  private consumeParamName(): string {
    const token = this.peek();
    if (token?.type === TokenTypes.IDENT || token?.type === TokenTypes.UNIT) {
      this.consume();
      return token.value;
    }
    throw ErrorFactory.parsing(
      "USER_FUNCTION_INVALID_PARAM_NAME",
      `Expected a parameter name but got "${token?.type ?? "end of input"}"${token ? ` ("${token.value}")` : ""}`,
      { actualType: token?.type },
    );
  }

  private parseUserFunctionDefinition(nameToken: Token, builder: BytecodeBuilder): void {
    this.consume(TokenTypes.LPAREN);
    const params: string[] = [];
    if (this.peek()?.type !== TokenTypes.RPAREN) {
      params.push(this.consumeParamName());
      while (this.match(TokenTypes.COMMA)) {
        params.push(this.consumeParamName());
      }
    }
    this.consume(TokenTypes.RPAREN);
    this.consume(TokenTypes.EQUALS);

    if (params.length === 0) {
      throw ErrorFactory.parsing(
        "USER_FUNCTION_NO_PARAMS",
        `"${nameToken.value}()" has no parameters -- user-defined functions need at least one (a zero-argument definition is indistinguishable from a plain function CALL with no args, which this grammar doesn't otherwise support)`,
        { name: nameToken.value },
      );
    }

    // Compile the body into its OWN independent BytecodeBuilder, reusing
    // the SAME parser/token stream but directing emission elsewhere.
    // `parseExpression(minBp, _builder)` sets `this.builder = _builder`
    // with NO automatic restore — explicitly restoring via `setBuilder()`
    // afterward (not a `finally`, since a thrown parse error here should
    // propagate as-is; there's no further use of `this.builder` on that
    // path before the whole parse aborts) avoids silently emitting
    // whatever parses next (in this same expression, or — via
    // ExpressionEngine's builder pool — a LATER, unrelated line) into a
    // stale, already-.build()'d body builder.
    const bodyBuilder = new BytecodeBuilder();
    this.parseExpression(BindingPower.Lowest, bodyBuilder);
    this.setBuilder(builder);

    const bodyProgram = bodyBuilder.build();
    if (bodyProgram.hasAsync) {
      // v1 scope decision: a function body calling an async plugin
      // (weather, stocks, currency, ...) isn't supported yet — propagating
      // a 'pending' result up through a reentrant executeBytecode() call
      // would need the OUTER expression's own bytecode position/stack
      // state to also be resumable later, which this first pass doesn't
      // implement. Rejecting at DEFINITION time (not call time) gives the
      // clearest possible error, matching this codebase's "never silently
      // pretend to support something it doesn't" convention (e.g.
      // addBusinessDays()'s own disclosed holiday-exclusion scope-down).
      throw ErrorFactory.parsing(
        "FUNCTION_BODY_MUST_BE_SYNCHRONOUS",
        `"${nameToken.value}(...)"'s body calls an async operation (weather, stocks, currency, ...) — user-defined function bodies must be synchronous`,
        { name: nameToken.value },
      );
    }

    const bodyIdx = builder.emitUserFunctionBody(nameToken.value, params, bodyProgram);
    builder.emitOpcode(OpCode.DEFINE_USER_FUNCTION);
    builder.emitIndex(bodyIdx);

    // A definition line has no single input value to echo back the way an
    // assignment does — push a plain confirmation string, matching this
    // codebase's "never silently produce a misleading numeric 0" principle.
    builder.emitOpcode(OpCode.PUSH_STRING);
    builder.emitString(`${nameToken.value}(${params.join(", ")}) defined`);
  }

  private parseUserFunctionCall(nameToken: Token, builder: BytecodeBuilder): void {
    this.consume(TokenTypes.LPAREN);
    let argCount = 0;
    if (this.peek()?.type !== TokenTypes.RPAREN) {
      this.parseExpression(BindingPower.Lowest, builder);
      argCount++;
      while (this.match(TokenTypes.COMMA)) {
        this.parseExpression(BindingPower.Lowest, builder);
        argCount++;
      }
    }
    this.consume(TokenTypes.RPAREN);

    builder.emitOpcode(OpCode.CALL_USER_FUNCTION);
    builder.emitString(nameToken.value);
    builder.emitByte(argCount);
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

  /**
   * Read-only lookahead `offset` tokens past the current position, without
   * consuming anything — `peekAt(0)` is equivalent to {@link peek}.
   * `this.tokens` is a plain in-memory array (not a stream), so this is a
   * simple, safe index read; no rewind/checkpoint mechanism is needed since
   * nothing is consumed.
   */
  peekAt(offset: number): Token | undefined {
    return this.tokens[this.current + offset];
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
