import type { Token } from "@solve-js/lexer/Token";
import { InlineSolvePosition } from "@solve-js/types/ParsingResult";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import { numberValue, Value } from "@solve-js/vm/Value";
import { BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";

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
 * Skips lines that contain no evaluable expression:
 * - Whitespace-only lines
 * - Markdown structural markers with no content (bare #, >, -, *, +, 1.)
 * - Code block fences (```)
 * - MathJax block fences ($$)
 * - Table separator rows (|---|)
 * - Horizontal rules (---, ***, ___)
 * - Standalone wikilinks / embeds ([[...]], ![[...]])
 *
 * Lines containing inline solves (s\`...\`) are never considered empty.
 */
export function isEmptyLine(lineText: string): boolean {
    const s = lineText.trimStart();
    if (s.length === 0) return true;

    // Lines containing inline solves are never empty — they have evaluable expressions
    if (s.includes('s`')) return false;

    // Markdown structural markers with ONLY whitespace after (no content).
    // Uses $ anchor to preserve backward compatibility:
    //   "# " is empty, but "# heading" is not.
    if (/^(?:#{1,6}|>|[-*+]|\d+\.)\s*$/.test(s)) return true;

    // Code block & MathJax fences (the entire block is non-evaluable structure)
    if (/^```/.test(s)) return true;
    if (/^\$\$/.test(s)) return true;

    // Table separator rows (e.g. | --- | :---: |)
    if (/^\|[-:|\s]+\|$/.test(s)) return true;

    // Horizontal rules (---, ***, ___) with optional trailing whitespace
    // Each must be 3+ of the SAME character — mixed chars like *-* are not HRs
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(s)) return true;

    // Standalone wikilinks / embeds ([[page]] or ![[image]])
    if (/^!?\[\[.*\]\]\s*$/.test(s)) return true;

    return false;
}

/**
 * Find all inline solves in a line with precise coordinate mapping.
 */
export function findInlineSolvesInLine(lineText: string, lineNumber: number): InlineSolvePosition[] {
    const results: InlineSolvePosition[] = [];
    const regex = /s`([^`]*)`/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(lineText)) !== null) {
        results.push({
            start: match.index,
            end: match.index + match[0].length,
            expression: match[1],
            lineNumber,
            columnNumber: match.index + 1,
        });
    }
    return results;
}
