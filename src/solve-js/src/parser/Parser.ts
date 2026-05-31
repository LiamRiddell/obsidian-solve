import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { Token, tokenTypeId } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import { DiagnosticPipeline, DiagnosticEventType, type DiagnosticEvent } from "@solve-js/diagnostics";

/**
 * Pratt parser (legacy) — parselet-based expression parser.
 *
 * Consumes a token stream and produces bytecode via a BytecodeBuilder.
 * Forwards to registered {@link PrefixParselet} and {@link InfixParselet}
 * handlers in the {@link ParseletRegistry}.
 *
 * New code should use {@link PrecedenceParser} which provides a two-tier
 * fast-path optimization. This class is kept for backwards compatibility
 * with existing parselet implementations that expect Parser's API.
 */
export class Parser {
     private tokens: Token[] = [];
     private current = 0;
     private depth = 0;
     private maxDepth: number;
     /** Cached registry reference — avoids this.parseletRegistry property chain in hot loop */
     private registry: ParseletRegistry;
     private diagnosticPipeline: DiagnosticPipeline | undefined;
     private currentExpression: string = "";
     private localeCode: string;
 
     constructor(parseletRegistry: ParseletRegistry, maxDepth = 50, localeCode = "en") {
         this.registry = parseletRegistry;
         this.maxDepth = maxDepth;
         this.localeCode = localeCode;
     }

     /**
      * Get locale code for NumberParselet to normalize separators
      */
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
    }    load(tokens: Token[], hasParens?: boolean): void {
         // Fast path: if caller guarantees no parentheses, skip the O(n) paren scan.
         // ~90% of expression tokens have no parens — this saves a full array traversal.
         if (hasParens === false) {
             this.tokens = tokens;
             this.current = 0;
             this.depth = 0;
             return;
         }
         // Paren scan: count balance to skip array copy for balanced expressions.
         // ~95%+ of parenthesized expressions are balanced, saving an O(n) copy.
         // Uses typeId for faster comparison (integer vs string).
         const LPAREN_ID = tokenTypeId('LPAREN');
         const RPAREN_ID = tokenTypeId('RPAREN');
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
      * Auto-balance unmatched parentheses: append missing closing parens
      * or prepend missing opening parens to make expressions parseable.
      * Only called when openCount !== 0 after the fast-path count.
      */
     private balanceParens(tokens: Token[], openCount: number): Token[] {
         const result = tokens.slice();
         if (openCount > 0) {
             // More opens than closes — append missing closing parens
             const RPAREN_ID = tokenTypeId('RPAREN');
             for (let i = 0; i < openCount; i++) {
                 const lastToken = tokens[tokens.length - 1];
                 result.push({
                     type: "RPAREN",
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
             // More closes than opens — prepend missing opening parens
             const LPAREN_ID = tokenTypeId('LPAREN');
             for (let i = 0; i < -openCount; i++) {
                 result.unshift({
                     type: "LPAREN",
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

    parseExpression(bindingPower = 0, builder?: BytecodeBuilder): void {
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
        const tokens = this.tokens; // cache reference for hot path

        if (!token) {
            this.depth--;
            throw ErrorFactory.parsing("UNEXPECTED_END", "Unexpected end of expression");
        }

        const prefixParselet = this.registry.getPrefix(token.typeId);
        if (!prefixParselet) {
            this.depth--;
            throw ErrorFactory.parsing(
                "NO_PREFIX_PARSELET",
                `No prefix parselet found for token: ${token.type} ("${token.value}")`,
                { tokenType: token.type, tokenValue: token.value }
            );
        }

        // Fire parselet matched event
        if (this.diagnosticPipeline) {
            this.fireParseletMatched(prefixParselet, token, true);
        }

        if (builder) {
            prefixParselet.parse(this, token, builder);
        }

        // Infix parselet loop — hot path, cache references to avoid property lookups
        let idx = this.current;
        const len = tokens.length;
        const registry = this.registry;
        const hasDiag = this.diagnosticPipeline !== undefined;

        while (idx < len) {
            const nextToken = tokens[idx];
            if (!nextToken) break;

            const infixParselet = registry.getInfix(nextToken.typeId);
            if (!infixParselet) break;
            if (infixParselet.bindingPower <= bindingPower) break;

            this.current = ++idx; // advance past token

            if (hasDiag) {
                this.fireParseletMatched(infixParselet, nextToken, false, infixParselet.bindingPower);
            }

            if (builder) {
                infixParselet.parse(this, token, nextToken, builder);
            }

            // Sync idx after recursive parsing: inner parseExpression() calls
            // advance this.current past the RHS, so idx needs to catch up.
            idx = this.current;
        }

        this.current = idx;
        this.depth--;
    }

    /**
     * Fire a parselet-matched event through the diagnostic pipeline.
     * Uses a minimal typed interface to avoid allocating when no collector is active.
     */
    private fireParseletMatched(
        parselet: { category: string },
        token: Token,
        isPrefix: boolean,
        bindingPower?: number
    ): void {
        // Caller already checks diagnosticPipeline !== undefined
        const pipeline = this.diagnosticPipeline!;
        const event: DiagnosticEvent & { type: "parselet_matched" } = {
            type: DiagnosticEventType.ParseletMatched,
            elapsedNs: 0,
            expression: this.currentExpression,
            tokenType: token.type,
            tokenValue: token.value,
            parseletCategory: parselet.category,
            parseletType: parselet.constructor.name,
            isPrefix,
            bindingPower,
            tokenOffset: token.offset || 0,
        };
        pipeline.fireParseletMatched(event);
    }

    consume(expectedType?: string): Token {
        const token = this.tokens[this.current];
        if (!token) {
            throw ErrorFactory.parsing(
                "UNEXPECTED_END_OF_INPUT",
                "Unexpected end of input"
            );
        }
        if (expectedType !== undefined) {
            // Fast path: integer comparison (hot path)
            const expectedId = tokenTypeId(expectedType);
            if (token.typeId !== expectedId) {
                // Slow path: string comparison for error message detail
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
}
