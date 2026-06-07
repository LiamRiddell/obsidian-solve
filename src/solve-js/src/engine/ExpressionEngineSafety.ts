import type { Token } from "@solve-js/lexer/Token";
import { InlineSolvePosition } from "@solve-js/types/ParsingResult";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import { numberValue, Value } from "@solve-js/vm/Value";
import { BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";
import { sharedLexer } from "@solve-js/lexer/Lexer";

// ── Validation config ────────────────────────────────────────────────────

export interface ValidationConfig {
    maxExpressionLength: number;
    maxComplexity: number;
}

// ── Safety result ─────────────────────────────────────────────────────────

export interface SafetyCheckResult {
    passed: boolean;
    error?: { value: Value; tokens: Token[]; program: BytecodeProgram; error: string };
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
): { passed: boolean; complexityScore: number; errorMessage?: string } {
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
        return { passed: false, complexityScore, errorMessage: err.message };
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
 * Extract variable reads and writes from a token stream.
 *
 * Handles both IDENT and UNIT tokens as potential variable references.
 * UNIT tokens occur when the variable name collides with a known unit
 * (e.g., "b" for bits, "s" for seconds). The colon prefix unambiguously
 * signals a variable definition context (handled by VariableParselet),
 * and standalone UNIT tokens in expression position are resolved via
 * the prefix UNIT parselet (which emits LOAD_VAR).
 */
export function extractReadsAndWrites(tokens: Token[]): { reads: string[]; writes: string[] } {
    const reads: string[] = [];
    const writes: string[] = [];

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type === "COLON") {
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
 *
 * Lines containing inline solves (s\`...\`) are never considered empty.
 */
export function isEmptyLine(lineText: string): boolean {
    const classification = sharedLexer.classifyLine(lineText);
    return classification.skip;
}

// ── Multi-target expression splitting ────────────────────────────────────

/**
 * Split a multi-target expression on commas after the "in" keyword.
 *
 * Used for expressions like "10 USD in EUR, GBP, JPY" which should produce
 * three sub-expressions: "10 USD in EUR", "10 USD in GBP", "10 USD in JPY".
 *
 * Guards:
 * - "in" must be a standalone word (word-boundary check prevents splitting
 *   within words like "inside", "inner", "pinned").
 * - Colon-prefixed expressions (variable definitions) are never split.
 * - Single-target expressions (no commas after "in") return null.
 *
 * @returns Array of sub-expression strings, or null if not multi-target.
 */
export function splitMultiTargetExpression(expression: string): string[] | null {
    // Guard: colon-prefixed variable definitions are never multi-target.
    if (expression.trim().startsWith(':')) return null;

    // Match "in" as a standalone keyword (word boundaries).
    // Captures: prefix before "in", targets after "in".
    const inMatch = expression.match(/^(.*?)\bin\b\s+(.+)$/i);
    if (!inMatch) return null;

    const prefix = inMatch[1].trimEnd();
    const targetsPart = inMatch[2];

    // Split targets on commas, trim whitespace, filter empties.
    const targets = targetsPart
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

    // Single target (no commas) — not multi-target.
    if (targets.length <= 1) return null;

    // Build sub-expressions: "<prefix> in <target>" for each target.
    return targets.map(target => `${prefix} in ${target}`);
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
