import type { Token } from "@solve-js/lexer/Token";
import { InlineSolvePosition } from "@solve-js/types/ParsingResult";
import { ErrorFactory, type EngineError } from "@solve-js/errors/UnifiedErrorFramework";
import { numberValue, Value } from "@solve-js/vm/Value";
import { BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";
import { sharedLexer } from "@solve-js/lexer/Lexer";
import { globalDagKey } from "@solve-js/vm/GlobalVariableStore";

// ── Validation config ────────────────────────────────────────────────────

export interface ValidationConfig {
    maxExpressionLength: number;
    maxComplexity: number;
}

// ── Safety result ─────────────────────────────────────────────────────────

export interface SafetyCheckResult {
    passed: boolean;
    /**
     * `error.error` (a plain string) exists purely because it's spread
     * directly into `evaluateExpressionWithDiagnostic()`'s own return shape
     * (`{value, tokens, program, error?: string, ...}`), which deliberately
     * keeps errors as display strings for the debug/diagnostic pipeline —
     * see that method's own doc comment. `error.engineError` is additive
     * (doesn't replace the string field, so existing consumers of this
     * exported type are unaffected): it carries the real EngineError this
     * check constructed internally, so callers that DO want the original
     * code/category/expected/found/suggestion (prepareExpression(), not the
     * diagnostic pipeline) don't have to reconstruct a generic one from just
     * the flattened message.
     */
    error?: { value: Value; tokens: Token[]; program: BytecodeProgram; error: string; engineError?: EngineError };
}

// ── Safety checks ─────────────────────────────────────────────────────────

/**
 * Check that the expression doesn't exceed the maximum allowed length.
 */
export function checkExpressionLength(
    expression: string,
    config: ValidationConfig
): SafetyCheckResult {
    if (expression.length > config.maxExpressionLength) {
        const err = ErrorFactory.validation(
            "EXPRESSION_TOO_LONG",
            `Expression exceeds max length of ${config.maxExpressionLength} characters (got ${expression.length})`,
            { expressionLength: expression.length, maxLength: config.maxExpressionLength }
        );
        return {
            passed: false,
            error: {
                value: numberValue(0),
                tokens: [],
                program: { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [], hasAsync: false },
                error: err.message,
                engineError: err,
            },
        };
    }
    return { passed: true };
}

/**
 * Score expression complexity based on token count, function calls, and nesting depth.
 * Returns the complexity score and whether it exceeds the configured maximum.
 */
export function checkExpressionComplexity(
    tokens: Token[],
    config: ValidationConfig
): { passed: boolean; complexityScore: number; errorMessage?: string; engineError?: EngineError } {
    let functionCallCount = 0;
    let nestingDepth = 0;
    let maxParens = 0;
    for (const t of tokens) {
        if (t.type === "FUNC") functionCallCount++;
        if (t.value === "(" || t.type === "LPAREN") { nestingDepth++; maxParens = Math.max(maxParens, nestingDepth); }
        if (t.value === ")" || t.type === "RPAREN") nestingDepth--;
    }
    const complexityScore = tokens.length + functionCallCount * 5 + maxParens * 10;
    if (complexityScore > config.maxComplexity) {
        const err = ErrorFactory.validation(
            "EXPRESSION_TOO_COMPLEX",
            `Expression complexity score ${complexityScore} exceeds maximum of ${config.maxComplexity}`,
            { complexity: complexityScore, maxComplexity: config.maxComplexity }
        );
        return { passed: false, complexityScore, errorMessage: err.message, engineError: err };
    }
    return { passed: true, complexityScore };
}

// ── Read/write extraction ─────────────────────────────────────────────────

/**
 * Guard: true if the token is a valid variable name type.
 * Accepts both IDENT and UNIT tokens — UNIT occurs when the variable name
 * collides with a known unit (e.g., "b" for bits, "s" for seconds).
 */
function isVarName(t: Token): boolean {
    return t.type === "IDENT" || t.type === "UNIT";
}

/**
 * True if a UNIT token at this position is being consumed as a
 * unit-of-measure literal rather than a variable reference — i.e. it's
 * immediately preceded by a value (NUMBER, a closing paren) or a
 * conversion keyword (TO, IN). This mirrors exactly where
 * UomLiteralParselet/ConvertParselet/PercentageChangeParselet accept a
 * UNIT token themselves: `500 EUR`, `(x + y) km`, `to JPY`, `in m`.
 * In all of these the compiler emits PUSH_STRING for the unit name, not
 * LOAD_VAR, so treating them as a DAG read is a false positive — the
 * classic case being any bare currency/unit conversion like
 * "500 EUR to JPY", which falsely reported "EUR" and "JPY" as variable
 * dependencies even though the compiled bytecode never loads a variable.
 */
function isUnitLiteralContext(prev: Token): boolean {
    return prev.type === "NUMBER" || prev.type === "TO" || prev.type === "IN" || prev.type === "RPAREN";
}

/**
 * From an LPAREN token index, scan forward tracking paren depth and return
 * the index of the matching RPAREN, or `null` if unbalanced. Mirrors
 * `PrecedenceParser.ts`'s `findMatchingRParen` — necessarily duplicated
 * here since this file is a standalone, parser-instance-free static token
 * scan (same "dead-code-but-must-stay-synced mirror" pattern as
 * `NumberParselet.ts`).
 */
function findMatchingRParenIdx(tokens: Token[], openIdx: number): number | null {
    let depth = 0;
    for (let i = openIdx; i < tokens.length; i++) {
        if (tokens[i].type === "LPAREN") depth++;
        else if (tokens[i].type === "RPAREN") {
            depth--;
            if (depth === 0) return i;
        }
    }
    return null;
}

/**
 * Pre-scan for user-defined-function DEFINITION shapes (`name(params) =
 * body`) to collect the set of PARAMETER names that must be excluded from
 * `reads`/`writes` in {@link extractReadsAndWrites} below. Without this, a
 * parameter name colliding with an unrelated document-level `:variable` of
 * the same name would register a spurious DAG dependency — `f(x) = 2*x+1`
 * must not depend on some unrelated `:x` defined elsewhere in the document,
 * and `x` itself must never be reported as a document-level WRITE (the
 * parameter isn't being assigned to at document scope at all). Scoped to a
 * single line's own token stream, matching how `extractReadsAndWrites` is
 * already called per-line — no cross-line interference with an unrelated
 * `:x` on a different line.
 */
function collectFunctionParamNames(tokens: Token[]): Set<string> {
    const excluded = new Set<string>();
    for (let i = 0; i < tokens.length; i++) {
        if (!isVarName(tokens[i])) continue;
        if (i > 0 && tokens[i - 1].type === "COLON") continue; // :name(...) is a different grammar entirely
        if (tokens[i + 1]?.type !== "LPAREN") continue;
        const closeIdx = findMatchingRParenIdx(tokens, i + 1);
        if (closeIdx === null) continue;
        if (tokens[closeIdx + 1]?.type !== "EQUALS") continue; // a CALL, not a DEFINITION — no params to exclude
        for (let j = i + 2; j < closeIdx; j++) {
            if (isVarName(tokens[j])) excluded.add(tokens[j].value);
        }
    }
    return excluded;
}

/**
 * Extract variable reads and writes from a token stream.
 *
 * Handles both IDENT and UNIT tokens as potential variable references.
 * UNIT tokens occur when the variable name collides with a known unit
 * (e.g., "b" for bits, "s" for seconds). The colon prefix unambiguously
 * signals a variable definition context (handled by VariableParselet).
 * A standalone UNIT token is only a real variable reference when it
 * isn't in unit-literal position (see {@link isUnitLiteralContext}) —
 * otherwise it's a quantity/conversion unit name, never LOAD_VAR'd.
 *
 * Also detects user-defined-function DEFINITIONS (`name(params) = body`)
 * as a read+write of the function's own name — mirroring `:name = value`'s
 * existing convention of registering the defined name as both — and
 * excludes the definition's own PARAMETER names from reads/writes
 * entirely (see {@link collectFunctionParamNames}). A function CALL
 * (`name(args)`, no trailing `=`) needs no special detection: the call's
 * own name falls through to the ordinary bare-identifier read-tracking
 * below, the same as any other `LOAD_VAR`-producing identifier — this is
 * already correct once calls compile successfully, no change needed.
 */
export function extractReadsAndWrites(tokens: Token[]): { reads: string[]; writes: string[] } {
    const reads: string[] = [];
    const writes: string[] = [];
    const functionParamNames = collectFunctionParamNames(tokens);

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type === "GLOBAL") {
            // global :name [= expr] — GLOBAL, COLON, IDENT/UNIT are three
            // separate tokens (matching GlobalVariableParselet). Emit a
            // "global:"-prefixed synthetic name into THIS document's own
            // DAG (via globalDagKey) so a local :hello and global :hello
            // never collide in this document's own reads/writes tracking —
            // the bare-COLON branch below explicitly skips the colon that
            // follows GLOBAL, since it's handled here instead.
            if (i + 2 < tokens.length && tokens[i + 1].type === "COLON" && isVarName(tokens[i + 2])) {
                const key = globalDagKey(tokens[i + 2].value);
                reads.push(key);
                if (i + 3 < tokens.length && tokens[i + 3].type === "EQUALS") {
                    writes.push(key);
                }
            }
            continue;
        }
        if (t.type === "COLON") {
            // Skip — this colon belongs to a `global :name` sequence,
            // already handled by the GLOBAL branch above.
            if (i > 0 && tokens[i - 1].type === "GLOBAL") continue;
            // The moo lexer produces COLON as a bare ":" token. The variable
            // name follows as a separate IDENT or UNIT token (matching VariableParselet).
            if (i + 1 < tokens.length && isVarName(tokens[i + 1])) {
                const varName = tokens[i + 1].value;
                reads.push(varName);
                // Colon-prefix variable definition: :name = expr
                // COLON + IDENT/UNIT are separate tokens, so EQUALS is at i+2.
                if (i + 2 < tokens.length && tokens[i + 2].type === "EQUALS") {
                    writes.push(varName);
                }
            }
        }
        if (isVarName(t)) {
            // Skip if already consumed by preceding COLON handler above.
            if (i > 0 && tokens[i - 1].type === "COLON") continue;
            // Skip UNIT tokens acting as a quantity/conversion unit name
            // rather than a variable (see isUnitLiteralContext above).
            if (t.type === "UNIT" && i > 0 && isUnitLiteralContext(tokens[i - 1])) continue;
            // A user-defined-function's own PARAMETER name — never a
            // document-level read or write (see collectFunctionParamNames).
            if (functionParamNames.has(t.value)) continue;
            // A user-defined-function DEFINITION's own name: `name(params) =
            // body`. Registered as both a read and a write, mirroring
            // `:name = value`'s existing convention just below.
            if (tokens[i + 1]?.type === "LPAREN") {
                const closeIdx = findMatchingRParenIdx(tokens, i + 1);
                if (closeIdx !== null && tokens[closeIdx + 1]?.type === "EQUALS") {
                    reads.push(t.value);
                    writes.push(t.value);
                    continue;
                }
                // else: a CALL (or malformed) — falls through below, same as
                // any other bare identifier read.
            }
            reads.push(t.value);
            // Check if next token is EQUALS -> this is a write
            if (i + 1 < tokens.length && tokens[i + 1].type === "EQUALS") {
                writes.push(t.value);
            }
        }
    }
    return { reads, writes };
}

// ── Line classification ───────────────────────────────────────────────────

/**
 * Check if a line is effectively empty (whitespace only or only markdown syntax).
 *
 * Phase B: Delegates to the ExpressionLexer's character-by-character
 * markdown line scanner, replacing the old regex-based heuristics.
 *
 * Skips lines that contain no evaluable expression:
 * - Whitespace-only lines
 * - Markdown structural markers (headings, blockquotes, lists without inline solves)
 * - Code block fences (```)
 * - MathJax block fences ($$)
 * - Table separator rows (|---|)
 * - Horizontal rules (---, ***, ___)
 * - Standalone wikilinks / embeds ([[...]], ![[...]])
 * - Whole-line comments (a line whose first non-whitespace characters are `//`)
 *
 * Lines containing inline solves (s\`...\`) are never considered empty.
 *
 * Note: a trailing `#`/`//` comment in the MIDDLE of an otherwise-evaluable
 * line does NOT make isEmptyLine() return true — that line is still an
 * "expression" line (skip: false). The comment is instead stripped at
 * tokenization time (ExpressionLexer's HASH/`//` handling emits a COMMENT
 * token for the rest of the line) and then filtered out of the token
 * stream by ExpressionEngine.prepareExpression() before parsing, so
 * `<expr> // note` evaluates identically to `<expr>` alone.
 */
export function isEmptyLine(lineText: string): boolean {
    const classification = sharedLexer.classifyLine(lineText);
    return classification.skip;
}

/**
 * Find all inline solves in a line with precise coordinate mapping.
 *
 * Phase B: Delegates to the ExpressionLexer's character-by-character
 * scanner (no regex, handles escaped backticks).
 */
export function findInlineSolvesInLine(lineText: string, lineNumber: number): InlineSolvePosition[] {
    const spans = sharedLexer.findInlineSolves(lineText);
    return spans.map(s => ({
        start: s.start,
        end: s.end,
        expression: s.expression,
        lineNumber,
        columnNumber: s.columnNumber,
    }));
}
