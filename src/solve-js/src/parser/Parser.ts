import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import { DiagnosticPipeline, DiagnosticEventType, type DiagnosticEvent } from "@solve-js/diagnostics";

export class Parser {
     private tokens: Token[] = [];
     private current = 0;
     private depth = 0;
     private maxDepth: number;
     private parseletRegistry: ParseletRegistry;
     private diagnosticPipeline: DiagnosticPipeline | undefined;
     private currentExpression: string = "";
     private localeCode: string;
     /** Track paren delta during load() — skip balanceParens if balanced */
     private parenDelta = 0;

     constructor(parseletRegistry: ParseletRegistry, maxDepth = 50, localeCode = "en") {
         this.parseletRegistry = parseletRegistry;
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
    }

load(tokens: Token[]): void {
         // Fast path: count paren balance to skip array copy for balanced expressions.
         // ~95%+ of expressions are balanced, saving an O(n) copy per parse.
         let openCount = 0;
         for (let i = 0; i < tokens.length; i++) {
             if (tokens[i].type === "LPAREN") openCount++;
             else if (tokens[i].type === "RPAREN") openCount--;
         }
         this.parenDelta = openCount;
         this.tokens = openCount === 0 ? tokens : this.balanceParens(tokens, openCount);
         this.current = 0;
         this.depth = 0;
     }

     /**
      * Auto-balance unmatched parentheses: append missing closing parens
      * or prepend missing opening parens to make expressions parseable.
      * Only called when parenDelta !== 0 after the fast-path count.
      */
     private balanceParens(tokens: Token[], openCount: number): Token[] {
         const result = [...tokens];
         if (openCount > 0) {
             // More opens than closes — append missing closing parens
             for (let i = 0; i < openCount; i++) {
                 const lastToken = tokens[tokens.length - 1];
                 result.push({
                     type: "RPAREN",
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
             for (let i = 0; i < -openCount; i++) {
                 result.unshift({
                     type: "LPAREN",
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

        const prefixParselet = this.parseletRegistry.getPrefix(token.type);
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
        const registry = this.parseletRegistry;
        const hasDiag = this.diagnosticPipeline !== undefined;

        while (idx < len) {
            const nextToken = tokens[idx];
            if (!nextToken) break;

            const infixParselet = registry.getInfix(nextToken.type);
            if (!infixParselet) break;
            if (infixParselet.getBindingPower() <= bindingPower) break;

            this.current = ++idx; // advance past token

            if (hasDiag) {
                this.fireParseletMatched(infixParselet, nextToken, false, infixParselet.getBindingPower());
            }

            if (builder) {
                infixParselet.parse(this, token, nextToken, builder);
            }
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
        this.diagnosticPipeline.fireParseletMatched(event);
    }

    consume(expectedType?: string): Token {
        const token = this.tokens[this.current];
        if (!token) {
            throw ErrorFactory.parsing(
                "UNEXPECTED_END_OF_INPUT",
                "Unexpected end of input"
            );
        }
        if (expectedType !== undefined && token.type !== expectedType) {
            throw ErrorFactory.parsing(
                "UNEXPECTED_TOKEN_TYPE",
                `Expected token type "${expectedType}" but got "${token.type}" ("${token.value}")`,
                { expectedType, actualType: token.type, actualValue: token.value }
            );
        }
        this.current++;
        return token;
    }

    match(expectedType: string): boolean {
        const token = this.peek();
        if (token && token.type === expectedType) {
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
