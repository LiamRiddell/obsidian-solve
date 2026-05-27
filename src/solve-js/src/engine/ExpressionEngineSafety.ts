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
                program: { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [] },
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
 * Extract variable reads and writes from a token stream.
 */
export function extractReadsAndWrites(tokens: Token[]): { reads: string[]; writes: string[] } {
    const reads: string[] = [];
    const writes: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type === "COLON") {
            // The moo lexer produces COLON as a bare ":" token. The variable
            // name follows as a separate IDENT token (matching VariableParselet).
            if (i + 1 < tokens.length && tokens[i + 1].type === "IDENT") {
                const varName = tokens[i + 1].value;
                reads.push(varName);
                // Colon-prefix variable definition: :name = expr
                // COLON + IDENT are separate tokens, so EQUALS is at i+2.
                if (i + 2 < tokens.length && tokens[i + 2].type === "EQUALS") {
                    writes.push(varName);
                }
            }
        }
        if (t.type === "IDENT") {
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
