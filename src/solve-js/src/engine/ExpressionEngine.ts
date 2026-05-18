import { VM } from "@solve-js/vm/OpRegistry";
import { DependencyGraph } from "@solve-js/vm/DependencyGraph";
import { LineCache, LineCacheEntry } from "@solve-js/cache/LineCache";
import { ScopeManager } from "@solve-js/vm/ScopeManager";
import { Lexer } from "@solve-js/lexer/Lexer";
import { Parser } from "@solve-js/parser/Parser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { BytecodeBuilder, type BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";
import { createVM, executeBytecode } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { Value, numberValue } from "@solve-js/vm/Value";
import { PluginManager } from "@solve-js/plugins/PluginSystem";
import { registerArithmeticParselets } from "@solve-js/providers/arithmetic/parselets/index";
import { registerPercentageParselets } from "@solve-js/providers/percentage/parselets/index";
import { registerFunctionParselets } from "@solve-js/providers/function/parselets/index";
import { registerDatetimeParselets } from "@solve-js/providers/datetime/parselets/index";
import { registerDiceParselets } from "@solve-js/providers/dice/parselets/index";
import { registerVariableParselets } from "@solve-js/providers/variables/parselets/index";
import { registerUomParselets } from "@solve-js/providers/uom/parselets/index";
import { registerVectorParselets } from "@solve-js/providers/vector/parselets/index";
import { registerBigIntParselets } from "@solve-js/providers/biginteger/parselets/index";
import { TokenTypes } from "@solve-js/lexer/Token";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import {
    ParsingResult,
    ParsedLine,
    InlineSolvePosition,
    UnifiedParsingOptions,
    ParseletInfo,
    DebugInfo
} from "@solve-js/types/ParsingResult";
import { DEFAULT_CONFIG } from "@solve-js/constants/Configuration";

export class ExpressionEngine {
    private dag = new DependencyGraph();
    private lineCache = new LineCache();
    private scopeManager = new ScopeManager();
    private lexer: Lexer;
    private registry: ParseletRegistry;
    private parser: Parser;
    private localeCode: string;
    private vm: VM;
    private diagnosticMode: boolean;
    private config: typeof DEFAULT_CONFIG;
    private pluginManager: PluginManager;
    // Bytecode cache — avoids re-parsing identical expressions
    private bytecodeCache: Map<string, BytecodeProgram> = new Map();
    // Pre-allocated typed array buffers for zero-copy VM consumption
    private bufferPool: { opcodes: Uint8Array; numbers: Float64Array } = {
        opcodes: new Uint8Array(256),
        numbers: new Float64Array(64),
    };
    // O(1) lookup for markdown token types to skip during lexing
    private markdownTokenTypes = new Set(["MD_H1", "MD_H2", "MD_H3", "MD_H4", "MD_H5", "MD_H6", "MD_BOLD", "MD_ITALIC", "MD_CODE", "MD_LINK", "MD_IMAGE", "MD_LIST_ITEM", "MD_BLOCKQUOTE", "MD_HR", "MD_TABLE", "MD_NEWLINE", "WS"]);

    constructor(localeCode = "en", diagnosticMode = false, config?: Partial<typeof DEFAULT_CONFIG>) {
        this.localeCode = localeCode;
        this.diagnosticMode = diagnosticMode;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.lexer = new Lexer(localeCode);
        this.registry = new ParseletRegistry();
        this.pluginManager = new PluginManager(this.registry);
        // Register built-in providers (can be extended via registerPlugin/unregisterPlugin)
        registerArithmeticParselets(this.registry);
        registerPercentageParselets(this.registry);
        registerFunctionParselets(this.registry);
        registerDatetimeParselets(this.registry);
        registerDiceParselets(this.registry);
        registerVariableParselets(this.registry);
        registerUomParselets(this.registry);
        registerVectorParselets(this.registry);
        registerBigIntParselets(this.registry);
        this.parser = new Parser(this.registry, this.config.validation.maxNestingDepth);
        this.vm = createVM(sharedOpRegistry, this.config.vm.maxStackDepth, this.config.vm.maxInstructions);
    }

    /**
     * Register an external plugin with the engine.
     */
    registerPlugin(plugin: import("@solve-js/plugins/PluginSystem").SolvePlugin): void {
        this.pluginManager.register(plugin);
    }

    /**
     * Unregister an external plugin.
     */
    unregisterPlugin(pluginName: string): void {
        this.pluginManager.unregister(pluginName);
        // Clear bytecode cache since parselets may have changed
        this.bytecodeCache.clear();
    }

    /**
     * Unified parsing method that handles different input types and returns comprehensive results
     * with precise coordinate mapping for inline solves.
     */
    parseDocument(input: string, options: UnifiedParsingOptions = { inputType: 'markdown' }): ParsingResult {
        const lines = input.split('\n');
        const result: ParsingResult = {
            lines: [],
            totalLines: lines.length,
            errors: []
        };

        let currentPosition = 0;

        for (let i = 0; i < lines.length; i++) {
            const lineText = lines[i];
            const lineNumber = i + 1;
            const startPosition = currentPosition;
            const endPosition = startPosition + lineText.length;

            // Move to next line position (accounting for newline character)
            currentPosition = endPosition + 1;

            // Check if line is empty (whitespace only or only markdown markers)
            const isEmpty = this.isEmptyLine(lineText);

            // Find inline solves in the line
            const inlineSolves = this.findInlineSolvesInLine(lineText, lineNumber);
            const hasInlineSolves = inlineSolves.length > 0;

            const parsedLine: ParsedLine = {
                lineNumber,
                text: lineText,
                startPosition,
                endPosition,
                isEmpty,
                hasInlineSolves,
                inlineSolves,
                expression: null,
                result: null,
                error: null
            };

            if (!isEmpty) {
                // Check if this is a variable assignment (starts with colon)
                const isVariableAssignment = lineText.trim().startsWith(":");

                if (hasInlineSolves && !isVariableAssignment) {
                    // Process each inline solve
                    for (const solve of inlineSolves) {
                        try {
                            const value = this.evaluateLine(lineNumber, solve.expression);
                            solve.result = value;
                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            result.errors.push(`Line ${lineNumber}: ${errorMessage}`);
                            solve.error = errorMessage;
                        }
                    }
                } else {
                    // Process as a regular expression line
                    const expression = lineText.trim();
                    if (expression) {
                        try {
                            const value = this.evaluateLine(lineNumber, expression);
                            parsedLine.expression = expression;
                            parsedLine.result = value;
                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            parsedLine.error = errorMessage;
                            result.errors.push(`Line ${lineNumber}: ${errorMessage}`);
                        }
                    }
                }
            }

            result.lines.push(parsedLine);
        }

        return result;
    }

    /**
     * Check if a line is effectively empty (whitespace only or only markdown syntax)
     */
    private isEmptyLine(lineText: string): boolean {
        // Optimized regex: matches empty/whitespace-only lines OR lines containing only a markdown marker
        return /^\s*$|^\s*([#>-]|\*|\+)\s*$/.test(lineText);
    }

    /**
     * Find all inline solves in a line with precise coordinate mapping
     */
    private findInlineSolvesInLine(lineText: string, lineNumber: number): InlineSolvePosition[] {
        const results: InlineSolvePosition[] = [];
        const regex = /s`([^`]*)`/g;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(lineText)) !== null) {
            const start = match.index;
            const expression = match[1];
            const end = start + match[0].length;
            const columnNumber = start + 1; // 1-based column number

            results.push({
                start,
                end,
                expression,
                lineNumber,
                columnNumber
            });
        }

        return results;
    }

    evaluateLine(
        lineNumber: number,
        lineText: string
    ): Value {
        const result = this.evaluateLineWithDebug(lineNumber, lineText);
        if (result.error) {
            throw new Error(result.error);
        }
        return result.value;
    }

    /**
     * Evaluate a line with diagnostic information, supporting both regular expressions and inline solves
     */
    evaluateLineWithDebug(
        lineNumber: number,
        lineText: string
    ): { value: Value; tokens: any[]; program: any; error?: string; inlineSolve?: InlineSolvePosition; debug?: DebugInfo } {
        // Check if this is an inline solve
        const inlineSolveMatch = lineText.match(/^s`([^`]*)`$/);
        if (inlineSolveMatch) {
            const expression = inlineSolveMatch[1];
            const result = this.evaluateExpressionWithDiagnostic(expression, lineNumber);
            return {
                ...result,
                inlineSolve: {
                    start: 0,
                    end: lineText.length,
                    expression,
                    lineNumber,
                    columnNumber: 1
                }
            };
        }

        // Regular expression evaluation
        return this.evaluateExpressionWithDiagnostic(lineText, lineNumber);
    }

    /**
     * Core expression evaluation logic with diagnostic information
     */
    private evaluateExpressionWithDiagnostic(expression: string, lineNumber: number): { value: Value; tokens: any[]; program: any; error?: string; debug?: DebugInfo } {
        // === SAFETY CHECK 1: Expression length limit ===
        if (expression.length > this.config.validation.maxExpressionLength) {
            const err = ErrorFactory.validation(
                "EXPRESSION_TOO_LONG",
                `Expression exceeds max length of ${this.config.validation.maxExpressionLength} characters (got ${expression.length})`,
                { expressionLength: expression.length, maxLength: this.config.validation.maxExpressionLength }
            );
            return {
                value: numberValue(0),
                tokens: [],
                program: { opcodes: [], numbers: [], strings: [] },
                error: err.message,
                debug: undefined
            };
        }

        const tokens: any[] = [];
        const parselets: ParseletInfo[] = [];

        this.lexer.reset(expression);
        for (const t of this.lexer) {
            if (this.markdownTokenTypes.has(t.type)) continue;
            tokens.push(t);
        }

        if (tokens.length === 0) {
            const v = numberValue(0);
            this.lineCache.set(lineNumber, new LineCacheEntry(v, { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [] }, [], null, false), expression);
            const debug = this.diagnosticMode ? { tokens, parselets, program: { opcodes: [], numbers: [], strings: [] } } : undefined;
            return { value: v, tokens, program: { opcodes: [], numbers: [], strings: [] }, debug };
        }

        // === SAFETY CHECK 2: Complexity scoring ===
        let functionCallCount = 0;
        let nestingDepth = 0;
        let maxParens = 0;
        for (const t of tokens) {
            if (t.type === "FUNC") functionCallCount++;
            if (t.value === "(" || t.type === "LPAREN") { nestingDepth++; maxParens = Math.max(maxParens, nestingDepth); }
            if (t.value === ")" || t.type === "RPAREN") nestingDepth--;
        }
        const complexityScore = tokens.length + functionCallCount * 5 + maxParens * 10;
        if (complexityScore > this.config.validation.maxComplexity) {
            const err = ErrorFactory.validation(
                "EXPRESSION_TOO_COMPLEX",
                `Expression complexity score ${complexityScore} exceeds maximum of ${this.config.validation.maxComplexity}`,
                { complexity: complexityScore, maxComplexity: this.config.validation.maxComplexity }
            );
            return {
                value: numberValue(0),
                tokens: [],
                program: { opcodes: [], numbers: [], strings: [] },
                error: err.message,
                debug: undefined
            };
        }

        const reads: string[] = [];
        const writes: string[] = [];
        for (const t of tokens) {
            if (t.value.startsWith(":") && t.type === "COLON") reads.push(t.value.slice(1));
        }

        let program: BytecodeProgram;

        // Check bytecode cache before parsing — avoids re-parsing identical expressions
        const cachedProgram = this.bytecodeCache.get(expression);
        if (cachedProgram) {
            program = cachedProgram;
        } else {
            // Only collect parselet information if diagnostic mode is enabled
            if (this.diagnosticMode) {
                this.collectParseletInfo(tokens, parselets);
            }

            const builder = new BytecodeBuilder();
            this.parser.load(tokens);
            try {
                this.parser.parseExpression(0, builder);
            } catch (e) {
                const errorMessage = e instanceof Error ? e.message : String(e);
                return {
                    value: numberValue(0),
                    tokens,
                    program: { opcodes: [], numbers: [], strings: [] },
                    error: errorMessage,
                    debug: undefined
                };
            }
            // Build directly into pooled typed arrays for zero-copy VM consumption
            program = builder.buildInto(this.bufferPool);
            this.bytecodeCache.set(expression, program);
        }

        // Use the shared VM instance — variables persist across lines,
        // while the stack is cleaned up between expressions
        const stackBefore = this.vm.getStack().length;
        const result = executeBytecode(program, this.vm);
        // Pop any leftover stack items from this expression
        while (this.vm.getStack().length > stackBefore) {
          this.vm.pop();
        }

        if (result) {
            this.dag.registerLine(lineNumber, reads, writes);
            this.lineCache.set(lineNumber, new LineCacheEntry(
                result,
                program,
                reads,
                writes.length > 0 ? writes[0] : null,
                false
            ), expression);
        }

        const debug = this.diagnosticMode ? { tokens, parselets, program } : undefined;
        return {
            value: result!,
            tokens,
            program,
            debug
        };
    }

    /**
     * Collect parselet information for each token
     */
    private collectParseletInfo(tokens: any[], parselets: ParseletInfo[]): void {
        for (const token of tokens) {
            const parseletType = this.getParseletTypeForToken(token.type);
            parselets.push({
                tokenType: token.type,
                tokenValue: token.value,
                parseletType: parseletType,
                tokenOffset: token.offset || 0
            });
        }
    }

    /**
     * Get the parselet type for a specific token type
     */
    private getParseletTypeForToken(tokenType: string): string {
        if (tokenType === 'PERCENT') return 'Percentage';
        if (tokenType === 'UNIT') return 'UoM';
        if (tokenType === 'CONVERT' || tokenType === 'TO' || tokenType === 'BEST') return 'UoM';
        if (tokenType === 'FUNC') return 'Function';
        if (tokenType === 'ROLL') return 'Dice';
        if (tokenType === 'NOW' || tokenType === 'TODAY' || tokenType === 'TOMORROW' || tokenType === 'YESTERDAY') return 'Date/Time';
        if (tokenType === 'VEC2' || tokenType === 'VEC3' || tokenType === 'VEC4') return 'Vector';
        if (tokenType === 'BIGINT') return 'BigInt';
        if (tokenType === 'COLON' || tokenType === 'EQUALS') return 'Variable';
        if (tokenType === 'INCREASE' || tokenType === 'DECREASE' || tokenType === 'INCREASE_BY' || tokenType === 'DECREASE_BY') return 'Percentage';
        if (tokenType === 'NUMBER' || tokenType === 'PI' || tokenType === 'E') return 'Arithmetic';
        return 'Expression';
    }

    reEvaluateLine(lineNumber: number, expression: string): Value | undefined {
        const entry = this.lineCache.get(lineNumber, expression);
        if (!entry) return undefined;

        // Use cached bytecode directly (already typed arrays from buildInto)
        const program = this.bytecodeCache.get(expression);
        if (!program) return undefined;

        // Reuse existing VM — reset instead of creating new instance
        this.vm.reset();

        const result = executeBytecode(program, this.vm);

        if (result) {
            entry.result = result;
            this.lineCache.markClean(lineNumber, expression);
        }

        return result;
    }

    markDirtyFromVariable(variable: string): void {
        const affected = this.dag.getAffectedLines(variable);
        for (const line of affected) {
            this.lineCache.markDirty(line);
        }
    }

    getDag(): DependencyGraph {
        return this.dag;
    }

    getLineCache(): LineCache {
        return this.lineCache;
    }

    getScopeManager(): ScopeManager {
        return this.scopeManager;
    }

    getLexer(): Lexer {
        return this.lexer;
    }

    getParser(): Parser {
        return this.parser;
}

    getMemoCache(): never {
        throw new Error("MemoCache has been consolidated into LineCache");
    }

    isDiagnosticMode(): boolean {
        return this.diagnosticMode;
    }

    /**
     * Evaluate a raw expression string without line-number context.
     * Returns the Value result. Throws on error.
     */
    evaluateExpression(expression: string): Value {
        return this.evaluateLine(-1, expression);
    }

    /**
     * Fast path: evaluate an expression and return a number directly.
     * Skips Value object allocation when only a numeric result is needed.
     * Returns NaN on error.
     */
    evaluateNumber(expression: string): number {
        try {
            return this.evaluateLine(-1, expression).toNumber();
        } catch {
            return NaN;
        }
    }

    /**
     * Lean document parsing — skips diagnostic info collection for maximum speed.
     * Use this for production evaluation where debug info is not needed.
     */
    parseDocumentLean(input: string): { results: (number | undefined)[]; errors: string[] } {
        const lines = input.split('\n');
        const results: (number | undefined)[] = [];
        const errors: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const lineText = lines[i].trim();
            if (!lineText || lineText.startsWith(':')) {
                results.push(undefined);
                continue;
            }

            const inlineSolveMatch = lineText.match(/^s`([^`]*)`$/);
            const expression = inlineSolveMatch ? inlineSolveMatch[1] : lineText;

            if (expression.length > this.config.validation.maxExpressionLength) {
                errors.push(`Line ${i + 1}: expression too long`);
                results.push(undefined);
                continue;
            }

            try {
                results.push(this.evaluateLine(i + 1, expression).toNumber());
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                errors.push(`Line ${i + 1}: ${errorMessage}`);
                results.push(undefined);
            }
        }

        return { results, errors };
    }

    clear(): void {
        this.dag.clear();
        this.lineCache.clear();
        this.scopeManager.clear();
        this.bytecodeCache.clear();
    }

/**
      * Evaluate independent expressions using a worker pool (Web Workers).
      * Falls back to sequential for single-threaded envs (Node.js, SSR).
      */
     async evaluateParallel(expressions: string[]): Promise<(number | undefined)[]> {
         const results: (number | undefined)[] = new Array(expressions.length);
         const workers: Worker[] = [];

         if (typeof Worker === "undefined") {
             for (let i = 0; i < expressions.length; i++) {
                 try { results[i] = this.evaluateNumber(expressions[i]); } catch { results[i] = undefined; }
             }
             return results;
         }

         const maxWorkers = Math.min(expressions.length, 4);
         const chunkSize = Math.ceil(expressions.length / maxWorkers);
         const promises: Promise<void>[] = [];

         for (let w = 0; w < maxWorkers; w++) {
             const workerUrl = this.getWorkerUrl();
             if (!workerUrl) {
                 // Fallback: evaluate on main thread
                 const start = w * chunkSize;
                 const end = Math.min(start + chunkSize, expressions.length);
                 for (let i = start; i < end; i++) {
                     try { results[i] = this.evaluateNumber(expressions[i]); } catch { results[i] = undefined; }
                 }
                 continue;
             }

             const worker = new Worker(workerUrl, { type: "module", name: `solve-eval-${w}` });
             workers.push(worker);
             const start = w * chunkSize;
             const end = Math.min(start + chunkSize, expressions.length);

             const promise = new Promise<void>((resolve) => {
                 worker.onmessage = (e: MessageEvent) => {
                     const msg = e.data;
                     if (msg.type === "RESULT" && typeof msg.id === "number" && msg.id >= start && msg.id < end) {
                         results[msg.id] = msg.value?.value ?? undefined;
                     }
                 };
                 worker.onerror = () => resolve();

                 for (let i = start; i < end; i++) {
                     worker.postMessage({ type: "EVAL", id: i, expression: expressions[i], locale: this.localeCode });
                 }

                 // Give worker time to process
                 setTimeout(resolve, 100);
             });
             promises.push(promise);
         }

         await Promise.all(promises);
         workers.forEach((w) => w.terminate());
return results;
    }

    /**
     * Get the worker entry script URL.
     * In production, this is the bundled worker-entry.js file.
     */
    private getWorkerUrl(): string | null {
        // Resolve at build time via esbuild define
        // @ts-ignore — replaced during build
        if (typeof __WORKER_URL__ !== "undefined") return __WORKER_URL__;
        // Development: load from known path
        const base = typeof window !== "undefined" ? window.location.origin : "";
        return `${base}/workers/worker-entry.js`;
    }

    /**
     * Incremental re-evaluation: only re-evaluates lines affected by a variable change.
     * Uses the DAG dependency graph to minimize re-computation.
     */
    evaluateIncremental(variable: string, newValue: number): Map<number, Value> {
        this.vm.setVar(variable, numberValue(newValue));
        this.markDirtyFromVariable(variable);
        const dirtyLines = this.lineCache.getDirtyLines();
        const updated = new Map<number, Value>();

        for (const lineNumber of dirtyLines) {
            const entry = this.lineCache.get(lineNumber);
            if (!entry) continue;
            try {
                this.vm.reset();
                const result = this.evaluateLineWithDebug(lineNumber, "");
                if (!result.error && result.value) {
                    updated.set(lineNumber, result.value);
                    entry.result = result.value;
                    this.lineCache.markClean(lineNumber);
                }
            } catch { }
        }
        return updated;
    }
}