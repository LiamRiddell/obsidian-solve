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
import { BUILTIN_PACKAGES } from "@solve-js/providers/builtins";
import type { ISolvePackage } from "@solve-js/api/SolveAPI";
import { sharedVariableResolver } from "@solve-js/variables/VariableResolver";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import {
    ParsingResult,
    ParsedLine,
    InlineSolvePosition,
    UnifiedParsingOptions,
} from "@solve-js/types/ParsingResult";
import { DiagnosticReportJSON } from "@solve-js/diagnostics";
import type { Token, ScanLineResult } from "@solve-js/lexer";
import { DEFAULT_CONFIG, type EngineConfig } from "@solve-js/constants/Configuration";
import {
    DiagnosticPipeline,
    NullDiagnosticCollector,
    TimelineDiagnosticCollector,
    DiagnosticEventType,
    type DiagnosticEvent,
    type CategorizedParselet
} from "@solve-js/diagnostics";
import {
    checkExpressionLength,
    checkExpressionComplexity,
    extractReadsAndWrites,
} from "@solve-js/engine/ExpressionEngineSafety";



export class ExpressionEngine {
    private dag = new DependencyGraph();
    private lineCache = new LineCache();
    private scopeManager = new ScopeManager();
    private lexer: Lexer;
    private registry: ParseletRegistry;
    private parser: Parser;
    private localeCode: string;
    private vm: VM;
    private config: typeof DEFAULT_CONFIG;
    private pluginManager: PluginManager;
    private diagnosticPipeline: DiagnosticPipeline;
    // Bytecode cache — avoids re-parsing identical expressions
    private bytecodeCache: Map<string, BytecodeProgram> = new Map();
    // Pre-allocated typed array buffers for zero-copy VM consumption.
    // Sized for 95th-percentile expression complexity. Complex expressions
    // (>512 opcodes / >128 numbers) fall back to fresh allocation in buildInto().
    private bufferPool: { opcodes: Uint8Array; numbers: Float64Array } = {
        opcodes: new Uint8Array(512),
        numbers: new Float64Array(128),
    };

    constructor(
        localeCode = "en",
        diagnosticMode = false,
        config?: Partial<typeof DEFAULT_CONFIG>,
        diagnosticPipeline?: DiagnosticPipeline,
        packages?: ISolvePackage[]
    ) {
        this.localeCode = localeCode;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.lexer = new Lexer(localeCode);
        this.registry = new ParseletRegistry();
        this.pluginManager = new PluginManager(this.registry);

// Wire diagnostic pipeline: use provided, create timeline if enabled, or leave empty for production
         if (diagnosticPipeline) {
             this.diagnosticPipeline = diagnosticPipeline;
         } else if (diagnosticMode) {
             this.diagnosticPipeline = new DiagnosticPipeline();
             this.diagnosticPipeline.register(new TimelineDiagnosticCollector());
         } else {
             this.diagnosticPipeline = new DiagnosticPipeline();
             // Production: no collectors — pipeline length-check exits immediately with zero overhead
         }

        // Register providers via ISolvePackage data.
        // Defaults to BUILTIN_PACKAGES (all built-in providers). Callers can
        // pass a filtered subset via the `packages` constructor parameter to
        // selectively include/exclude specific providers (e.g., omit dice or
        // vector support for a calculator-only engine).
        // Each package's parselets go into the engine's isolated registry
        // (not sharedParseletRegistry), lexer plugins into the engine's
        // isolated lexer, and opcode/variable handlers into shared registries.
        const pkgList = packages ?? BUILTIN_PACKAGES;
        for (const pkg of pkgList) {
            this.registerPackage(pkg);
        }
        this.parser = new Parser(this.registry, this.config.validation.maxNestingDepth, localeCode);
        this.vm = createVM(sharedOpRegistry, this.config.vm.maxStackDepth, this.config.vm.maxInstructions);
    }

    /**
     * Register a package with the engine's isolated registries.
     *
     * Handles all ISolvePackage fields:
     * - `lexerPlugin` → engine's isolated lexer (via this.lexer.registerPlugin)
     * - `prefixParselets` → engine's isolated ParseletRegistry
     * - `infixParselets` → engine's isolated ParseletRegistry
     * - `opcodeHandlers` → sharedOpRegistry (shared across all engine instances)
     * - `variableSources` → sharedVariableResolver (shared across all engine instances)
     *
     * Built-in packages (ARITHMETIC, FUNCTION, UOM, etc.) are registered
     * via this method during construction. External user packages can also
     * use this method for data-driven registration without creating a
     * SolvePlugin with a register() callback.
     *
     * @param pkg - The package to register.
     */
    registerPackage(pkg: ISolvePackage): void {
        if (pkg.lexerPlugin) {
            this.lexer.registerPlugin(pkg.lexerPlugin);
        }
        if (pkg.prefixParselets) {
            for (const pp of pkg.prefixParselets) {
                this.registry.registerPrefix(pp.tokenType, pp.parselet);
            }
        }
        if (pkg.infixParselets) {
            for (const ip of pkg.infixParselets) {
                this.registry.registerInfix(ip.tokenType, ip.parselet);
            }
        }
        if (pkg.opcodeHandlers) {
            for (const oh of pkg.opcodeHandlers) {
                sharedOpRegistry.register(oh);
            }
        }
        if (pkg.variableSources) {
            for (const vs of pkg.variableSources) {
                sharedVariableResolver.registerSource(vs);
            }
        }
    }

    /**
     * Get the effective engine configuration currently in use.
     * Includes all defaults merged with any constructor overrides.
     * Useful for introspection — lets consumers see what values are actually
     * in effect after merging with DEFAULT_CONFIG.
     */
    getConfig(): EngineConfig {
        return { ...this.config };
    }

    /**
     * Get the underlying diagnostic pipeline for advanced usage.
     */
    getDiagnosticPipeline(): DiagnosticPipeline {
        return this.diagnosticPipeline;
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
        this.bytecodeCache.clear();
    }

    /**
     * Unified parsing method that handles different input types and returns comprehensive results
     * with precise coordinate mapping for inline solves.
     */
    parseDocument(input: string, options: UnifiedParsingOptions = { inputType: 'markdown' }): ParsingResult {
        // Scan the entire document in a single pass — bypasses the old
        // split('\n') → evaluateLines() → join('\n') → scanDocument()
        // roundtrip. scanDocument() classifies and tokenizes all lines
        // character-by-character with a single Lexer.reset().
        const scanResults = this.lexer.scanDocument(input);
        const processedLines = this.processScanResults(scanResults);

        const result: ParsingResult = {
            lines: processedLines,
            totalLines: processedLines.length,
            errors: [],
        };

        // Collect errors from processed lines
        for (const line of processedLines) {
            if (line.error) {
                result.errors.push(`Line ${line.lineNumber}: ${line.error}`);
            }
            for (const solve of line.inlineSolves) {
                if (solve.error) {
                    result.errors.push(`Line ${line.lineNumber}: ${solve.error}`);
                }
            }
        }

        const includeDiagnostics = options.includeDiagnostics ?? false;
        if (includeDiagnostics) {
            const reports = this.diagnosticPipeline.collectReports();
            if (reports.length > 0) {
                result.diagnostics = reports[0].toJSON();
            }
        }

        return result;
    }

    /**
     * Batch-evaluate an array of lines in a single pass.
     *
     * Uses scanDocument() to classify and tokenize all lines in a single
     * character-by-character walk through the re-joined document text.
     * This eliminates the per-line Lexer.reset() + classifyLine() +
     * findInlineSolvesInLine() overhead from the old three-pass approach.
     *
     * Tokenization results from scanDocument() are passed directly to the
     * parser via evaluateLineWithPreTokenized(), skipping re-lexing.
     */
    /**
     * Batch-evaluate an array of lines in a single pass.
     *
     * Primarily used by tests. For production, prefer parseDocument()
     * which calls scanDocument() directly on the raw document string,
     * bypassing the split→join roundtrip that this method performs.
     */
    evaluateLines(lines: string[]): ParsedLine[] {
        // Rejoin lines and scan in a single pass — scanDocument() handles
        // classification + tokenization for all lines in one character walk.
        const documentText = lines.join('\n');
        const scanResults = this.lexer.scanDocument(documentText);
        return this.processScanResults(scanResults);
    }

    /**
     * Process pre-scanned line results into ParsedLine objects.
     *
     * Shared by parseDocument() (which scanDocuments the raw input) and
     * evaluateLines() (which scanDocuments joined line arrays). Handles
     * inline solve extraction, variable assignment detection, and
     * expression evaluation for each non-skipped line.
     */
    private processScanResults(scanResults: ScanLineResult[]): ParsedLine[] {
        const result: ParsedLine[] = [];

        for (const scanResult of scanResults) {
            const lineText = scanResult.text;
            const lineNumber = scanResult.lineNumber;
            const startPosition = scanResult.startOffset;
            const endPosition = scanResult.endOffset;
            const isEmpty = scanResult.classification.skip;
            const inlineSolves: InlineSolvePosition[] = scanResult.inlineSolves.map(s => ({
                start: s.start,
                end: s.end,
                expression: s.expression,
                lineNumber,
                columnNumber: s.columnNumber,
            }));
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
                error: null,
            };

            if (!isEmpty) {
                const isVariableAssignment = lineText.trim().startsWith(':');

                if (hasInlineSolves && !isVariableAssignment) {
                    for (const solve of inlineSolves) {
                        try {
                            const value = this.evaluateLine(lineNumber, solve.expression);
                            solve.result = value;
                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            solve.error = errorMessage;
                        }
                    }
                } else {
                    const expression = lineText.trim();
                    if (expression) {
                        // Pass pre-tokenized tokens from scanDocument to avoid re-lexing
                        try {
                            const value = this.evaluateLineWithPreTokenized(
                                lineNumber,
                                expression,
                                scanResult.tokens
                            );
                            parsedLine.expression = expression;
                            parsedLine.result = value;
                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            parsedLine.error = errorMessage;
                        }
                    }
                }
            }

            result.push(parsedLine);
        }

        return result;
    }

    /**
     * Evaluate a line using pre-tokenized tokens from scanDocument().
     *
     * Skips the lexing step entirely — the tokens are already available
     * from the document-level scan. Only parsing, compilation, and
     * execution are performed.
     *
     * This is the production fast path for evaluateLines(). Note: this
     * path intentionally bypasses the diagnostic pipeline. For diagnostic
     * events, use evaluateExpressionWithDiagnostic() directly.
     */
    private evaluateLineWithPreTokenized(
        lineNumber: number,
        expression: string,
        preTokenized: Token[]
    ): Value {
        // Filter markdown tokens as a defensive safety net.
        // ExpressionLexer never produces MD_* tokens, but this guard
        // prevents accidental breakage if the lexer mode changes.
        const tokens: Token[] = [];
        let hasParens = false;
        for (const t of preTokenized) {
            if (t.type === "LPAREN" || t.type === "RPAREN") hasParens = true;
            tokens.push(t);
        }

        // Directly invoke evaluateWithTokens — no lexing needed
        return this.evaluateWithTokens(lineNumber, expression, tokens, hasParens);
    }

    /**
     * Evaluate an expression using already-lexed tokens.
     *
     * This is the shared core of both evaluateLine() (which lexes via
     * resetExpression) and evaluateLineWithPreTokenized() (which uses
     * tokens from scanDocument). It handles safety checks, bytecode
     * caching, parsing, and VM execution.
     */
    private evaluateWithTokens(
        lineNumber: number,
        expression: string,
        tokens: Token[],
        hasParens?: boolean
    ): Value {
        // ══ SAFETY CHECK 1: Expression length limit ══
        const lengthCheck = checkExpressionLength(expression, this.config.validation);
        if (!lengthCheck.passed) {
            throw ErrorFactory.execution(
                'EVALUATION_ERROR',
                lengthCheck.error!.error,
                { lineNumber }
            );
        }

        if (tokens.length === 0) {
            const v = numberValue(0);
            this.lineCache.set(lineNumber, new LineCacheEntry(v, { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [] }, [], null), expression);
            return v;
        }

        // ══ SAFETY CHECK 2: Complexity scoring ══
        const complexityCheck = checkExpressionComplexity(tokens, this.config.validation);
        if (!complexityCheck.passed) {
            throw ErrorFactory.execution(
                'EVALUATION_ERROR',
                complexityCheck.errorMessage!,
                { lineNumber }
            );
        }

        const { reads, writes } = extractReadsAndWrites(tokens);

        let program: BytecodeProgram;
        const cachedProgram = this.bytecodeCache.get(expression);
        if (cachedProgram) {
            program = cachedProgram;
        } else {
            const builder = new BytecodeBuilder();
            this.parser.load(tokens, hasParens);
            try {
                this.parser.parseExpression(0, builder);
            } catch (e) {
                const errorMessage = e instanceof Error ? e.message : String(e);
                throw ErrorFactory.execution(
                    'EVALUATION_ERROR',
                    errorMessage,
                    { lineNumber }
                );
            }

            const poolProgram = builder.buildInto(this.bufferPool);
            program = {
                opcodes: new Uint8Array(poolProgram.opcodes),
                numbers: new Float64Array(poolProgram.numbers),
                strings: poolProgram.strings,
                constants: poolProgram.constants,
            };
            this.bytecodeCache.set(expression, program);
        }

        const stackBefore = this.vm.getStack().length;
        const result = executeBytecode(program, this.vm);
        while (this.vm.getStack().length > stackBefore) {
            this.vm.pop();
        }

        if (result) {
            this.dag.registerLine(lineNumber, reads, writes);
            this.lineCache.set(lineNumber, new LineCacheEntry(
                result,
                program,
                reads,
                writes.length > 0 ? writes[0] : null
            ), expression);
        }

        if (!result) {
            throw ErrorFactory.execution('EVALUATION_ERROR', 'No result from evaluation', { lineNumber });
        }

        return result;
    }

    evaluateLine(
        lineNumber: number,
        lineText: string
    ): Value {
        const result = this.evaluateLineWithDebug(lineNumber, lineText);
        if (result.error) {
            throw ErrorFactory.execution(
                'EVALUATION_ERROR',
                result.error,
                { lineNumber }
            );
        }
        return result.value;
    }

    /**
     * Evaluate a line with diagnostic information, supporting both regular expressions and inline solves
     */
    evaluateLineWithDebug(
        lineNumber: number,
        lineText: string,
        inputType: string = "expression"
    ): { value: Value; tokens: Token[]; program: BytecodeProgram; error?: string; inlineSolve?: InlineSolvePosition; debug?: DiagnosticReportJSON } {
        const inlineSolveMatch = lineText.match(/^s`([^`]*)`$/);
        if (inlineSolveMatch) {
            const expression = inlineSolveMatch[1];
            const result = this.evaluateExpressionWithDiagnostic(expression, lineNumber, inputType);
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
        return this.evaluateExpressionWithDiagnostic(lineText, lineNumber, inputType);
    }

    /**
     * Core expression evaluation logic with diagnostic pipeline integration.
     * Every pipeline stage fires events to registered collectors.
     */
    private evaluateExpressionWithDiagnostic(expression: string, lineNumber: number, inputType: string = "expression"): { value: Value; tokens: Token[]; program: BytecodeProgram; error?: string; debug?: DiagnosticReportJSON } {
        const pipeline = this.diagnosticPipeline;
        const hasCollectors = pipeline.hasCollectors;

        // === SAFETY CHECK 1: Expression length limit ===
        const lengthCheck = checkExpressionLength(expression, this.config.validation);
        if (!lengthCheck.passed) {
            return { ...lengthCheck.error!, debug: undefined };
        }

        const tokens: Token[] = [];

        // Pipeline event: start
        if (hasCollectors) {
            pipeline.firePipelineStart({
                type: DiagnosticEventType.PipelineStart,
                elapsedNs: 0,
                expression,
                inputType,
             });
        }

        // Lexing with token emission events — use resetExpression to skip
        // redundant classifyLine (caller already knows this is an expression).
        this.lexer.resetExpression(expression);
        let tokenIndex = 0;
        let hasParens = false;
        for (const t of this.lexer) {
            if (t.type === "LPAREN" || t.type === "RPAREN") hasParens = true;
            tokens.push(t);

            if (hasCollectors) {
                pipeline.fireTokenEmitted({
                    type: DiagnosticEventType.TokenEmitted,
                    elapsedNs: 0, // zero-cost placeholder (timeline collector overrides)
                    expression,
                    token: {
                        type: t.type,
                        value: t.value,
                        offset: t.offset || 0,
                        line: t.line || lineNumber,
                        col: t.col || 0,
                    },
                });
            }
            tokenIndex++;
        }

        if (tokens.length === 0) {
            const v = numberValue(0);
            this.lineCache.set(lineNumber, new LineCacheEntry(v, { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [] }, [], null), expression);

            if (hasCollectors) {
                pipeline.firePipelineEnd({
                    type: DiagnosticEventType.PipelineEnd,
                    elapsedNs: 0,
                    expression,
                    success: true,
                    totalTokens: 0,
                    totalOpcodes: 0,
                });
            }

            return { value: v, tokens, program: { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [] }, debug: undefined };
        }

        // === SAFETY CHECK 2: Complexity scoring ===
        const complexityCheck = checkExpressionComplexity(tokens, this.config.validation);
        if (!complexityCheck.passed) {
            if (hasCollectors) {
                pipeline.firePipelineEnd({
                    type: DiagnosticEventType.PipelineEnd,
                    elapsedNs: 0,
                    expression,
                    success: false,
                    totalTokens: tokens.length,
                    totalOpcodes: 0,
                });
            }
            return {
                value: numberValue(0),
                tokens: [],
                program: { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [] },
                error: complexityCheck.errorMessage!,
                debug: undefined
            };
        }

        const { reads, writes } = extractReadsAndWrites(tokens);

        let program: BytecodeProgram;

        // Check bytecode cache
        const cachedProgram = this.bytecodeCache.get(expression);
        if (cachedProgram) {
            program = cachedProgram;

            if (hasCollectors) {
                pipeline.fireCacheHit({
                    type: DiagnosticEventType.CacheHit,
                    elapsedNs: 0,
                    expression,
                    cache: "bytecode",
                    key: expression,
                });

                pipeline.fireBytecodeBuilt({
                    type: DiagnosticEventType.BytecodeBuilt,
                    elapsedNs: 0,
                    expression,
                    opcodesLength: program.opcodes.length,
                    numbersLength: program.numbers.length,
                    stringsLength: program.strings.length,
                    isCached: true,
                });
            }
        } else {
            if (hasCollectors) {
                pipeline.fireCacheMiss({
                    type: DiagnosticEventType.CacheMiss,
                    elapsedNs: 0,
                    expression,
                    cache: "bytecode",
                    key: expression,
                });
            }

            // Parselet matching event: inject into parser via pipeline
            if (hasCollectors) {
                this.parser.setDiagnosticPipeline(pipeline, expression);
            }

            const builder = new BytecodeBuilder();
            this.parser.load(tokens, hasParens);
            try {
                this.parser.parseExpression(0, builder);
            } catch (e) {
                const errorMessage = e instanceof Error ? e.message : String(e);

                if (hasCollectors) {
                    pipeline.firePipelineEnd({
                        type: DiagnosticEventType.PipelineEnd,
                        elapsedNs: 0,
                        expression,
                        success: false,
                        totalTokens: tokens.length,
                        totalOpcodes: 0,
                    });
                }

                return {
                    value: numberValue(0),
                    tokens,
                    program: { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [] },
                    error: errorMessage,
                    debug: undefined
                };
            }

            // Build directly into pooled typed arrays for zero-copy VM consumption.
            // buildInto() returns subarray views that share the pool's ArrayBuffer —
            // copy before caching since the pool will be reused for the next expression.
            const poolProgram = builder.buildInto(this.bufferPool);
            program = {
                opcodes: new Uint8Array(poolProgram.opcodes),
                numbers: new Float64Array(poolProgram.numbers),
                strings: poolProgram.strings,
                constants: poolProgram.constants,
            };
            this.bytecodeCache.set(expression, program);

            if (hasCollectors) {
                pipeline.fireBytecodeBuilt({
                    type: DiagnosticEventType.BytecodeBuilt,
                    elapsedNs: 0,
                    expression,
                    opcodesLength: program.opcodes.length,
                    numbersLength: program.numbers.length,
                    stringsLength: program.strings.length,
                    isCached: false,
                });
            }

            // Clear parser pipeline reference to avoid holding refs
            this.parser.setDiagnosticPipeline(undefined, "");
        }

        // Use the shared VM instance
        // Only emit VM step events when vmTrace is explicitly enabled (very verbose)
        const emitVmTrace = hasCollectors && this.config.diagnostic.vmTraceEnabled === true;
        const stackBefore = this.vm.getStack().length;
        const result = executeBytecode(program, this.vm, emitVmTrace ? pipeline : undefined, expression);
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
                writes.length > 0 ? writes[0] : null
            ), expression);
        }

if (hasCollectors) {
             pipeline.fireVmHalt({
                 type: DiagnosticEventType.VmHalt,
                 elapsedNs: 0,
                 expression,
                 result: result ? {
                     type: result.type,
                     value: result.value,
                     unit: result.unit,
                 } : undefined,
             });

            pipeline.firePipelineEnd({
                type: DiagnosticEventType.PipelineEnd,
                elapsedNs: 0,
                expression,
                success: true,
                totalTokens: tokens.length,
                totalOpcodes: program.opcodes.length,
            });
        }

// Build debug info — structured diagnostic report
         if (hasCollectors) {
            const reports = pipeline.collectReports();
            return {
                value: result!,
                tokens,
                program,
                debug: reports[0]?.toJSON() || undefined,
            };
         }

        return {
            value: result!,
            tokens,
            program,
        };
    }

    reEvaluateLine(lineNumber: number, expression: string): Value | undefined {
        const entry = this.lineCache.get(lineNumber, expression);
        if (!entry) return undefined;

        const program = this.bytecodeCache.get(expression);
        if (!program) return undefined;

        this.vm.reset();
        const result = executeBytecode(program, this.vm);

        if (result) {
            entry.result = result;
            this.lineCache.markClean(lineNumber, expression);
        }

        return result;
    }

    getDag(): DependencyGraph {
        return this.dag;
    }

    getLineCache(): LineCache {
        return this.lineCache;
    }

    /**
     * Get the shared VM instance.
     * Used by VMCheckpointer to create/restore checkpoints.
     */
    getVM(): VM {
        return this.vm;
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

    isDiagnosticMode(): boolean {
        return this.diagnosticPipeline.hasCollectors;
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
     * Returns NaN on error or for bare undefined variable references.
     */    /**
	 * Compile-only path: lex → parse → bytecode, without execution.
	 * Used by Tier 3 (background) evaluation to discover reads/writes
	 * for the dependency graph without running display-only expressions.
	 *
	 * Uses the bytecode cache — repeated compilations of the same expression
	 * return the cached program with zero allocation.
	 *
	 * @throws ErrorFactory on parse failure or safety check failure.
	 */
	compileExpression(expression: string): {
		program: BytecodeProgram;
		tokens: Token[];
		reads: string[];
		writes: string[];
	} {
		// Safety checks — delegate to ExpressionEngineSafety.ts
		const lengthCheck = checkExpressionLength(expression, this.config.validation);
		if (!lengthCheck.passed) {
			throw ErrorFactory.validation("EXPRESSION_TOO_LONG", lengthCheck.error!.error);
		}

		// Lexing — skip classifyLine overhead since caller knows this is an expression.
		const tokens: Token[] = [];
		let hasParens = false;
		this.lexer.resetExpression(expression);
		for (const t of this.lexer) {
			if (t.type === "LPAREN" || t.type === "RPAREN") hasParens = true;
			tokens.push(t);
		}

		if (tokens.length === 0) {
			return {
				program: { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [] },
				tokens: [],
				reads: [],
				writes: [],
			};
		}

		// Complexity check — delegate to ExpressionEngineSafety.ts
		const complexityCheck = checkExpressionComplexity(tokens, this.config.validation);
		if (!complexityCheck.passed) {
			throw ErrorFactory.validation("EXPRESSION_TOO_COMPLEX", complexityCheck.errorMessage!);
		}

		const { reads, writes } = extractReadsAndWrites(tokens);

		// Check bytecode cache
		const cachedProgram = this.bytecodeCache.get(expression);
		if (cachedProgram) {
			return { program: cachedProgram, tokens, reads, writes };
		}

		// Parse and compile
		const builder = new BytecodeBuilder();
		this.parser.load(tokens, hasParens);
		try {
			this.parser.parseExpression(0, builder);
		} catch (e) {
			const errorMessage = e instanceof Error ? e.message : String(e);
			throw ErrorFactory.parsing(
				"PARSE_ERROR",
				errorMessage
			);
		}

		// Build into pooled buffers, then copy for caching (pool is reused)
		const poolProgram = builder.buildInto(this.bufferPool);
		const program: BytecodeProgram = {
			opcodes: new Uint8Array(poolProgram.opcodes),
			numbers: new Float64Array(poolProgram.numbers),
			strings: poolProgram.strings,
			constants: poolProgram.constants,
		};
		this.bytecodeCache.set(expression, program);

		return { program, tokens, reads, writes };
	}

	/**
	 * Execute pre-compiled bytecode against the engine's shared VM.
	 * Used by Tier 2 (scroll into view) to re-execute cached bytecode
	 * without re-lexing, re-parsing, or re-compiling.
	 *
	 * Preserves the VM stack — pops any leftover items after execution.
	 * Does NOT update DAG or LineCache (caller is responsible for state
	 * management via DocumentModel).
	 *
	 * @returns The execution result, or undefined if bytecode is empty.
	 */
	executeCached(program: BytecodeProgram): Value {
		if (program.opcodes.length === 0) {
			return numberValue(0);
		}
		const stackBefore = this.vm.getStack().length;
		const result = executeBytecode(program, this.vm);
		// Pop any leftover stack items from this expression
		while (this.vm.getStack().length > stackBefore) {
			this.vm.pop();
		}
		if (!result) {
			return numberValue(0);
		}
		return result;
	}

    evaluateNumber(expression: string): number {
         const trimmed = expression.trim();

         // Pre-check: bare identifiers that aren't known variables → NaN.
         // Doing this before evaluation avoids the ambiguity of "result === 0"
         // when a variable might legitimately store the value 0.
         if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
             if (this.vm.getVar(trimmed) === undefined) {
                 return NaN;
             }
         }

         try {
             const result = this.evaluateLine(-1, expression);
             return result.toNumber();
         } catch {
             return NaN;
         }
     }

    clear(): void {
         this.dag.clear();
         this.lineCache.clear();
         this.scopeManager.clear();
         this.bytecodeCache.clear();
         this.vm.reset();
     }

    /**
     * @deprecated Dirty-state tracking consolidated into DocumentModel.
     * Use DocumentModel.markDirty() or DocumentModel.markDirtyByLineNumber() instead.
     */
    markDirtyFromVariable(_variable: string): void {
        // No-op: DocumentModel is the canonical dirty-state source.
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

        // Dynamic import to avoid circular dependency:
        // eval.worker.ts imports ExpressionEngine, so we can't statically import it here.
        let createEvalWorker: () => Worker;
        try {
            ({ default: createEvalWorker } = await import("@solve-js/workers/eval.worker"));
        } catch {
            // Fallback: evaluate on main thread if worker can't be created
            for (let i = 0; i < expressions.length; i++) {
                try { results[i] = this.evaluateNumber(expressions[i]); } catch { results[i] = undefined; }
            }
            return results;
        }

        const maxWorkers = Math.min(expressions.length, 4);
        const chunkSize = Math.ceil(expressions.length / maxWorkers);
        const promises: Promise<void>[] = [];

        for (let w = 0; w < maxWorkers; w++) {
            const worker = createEvalWorker();
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

                setTimeout(resolve, 100);
            });
            promises.push(promise);
        }

        await Promise.all(promises);
        workers.forEach((w) => w.terminate());
        return results;
    }

    /**
     * Incrementally re-evaluate lines affected by a variable change.
     * Walks the DAG from the changed variable to find exactly which lines
     * need re-execution — no dirty-set indirection, no sorting guesswork.
     * Uses Kahn's algorithm for topological ordering: producers always
     * execute before consumers, regardless of document line order.
     */
    evaluateIncremental(variable: string, newValue: number): Map<number, Value> {
        // Phase 1.4 DAG-walk: get affected lines in topological order.
        // This replaces the old approach of markDirtyFromVariable() →
        // getDirtyLines() → ascending sort, which (a) double-iterated,
        // (b) picked up unrelated dirty lines, and (c) failed for
        // non-ascending dependency chains.
        const affectedLines = this.dag.getAffectedLinesInOrder(variable);

        // Preserve existing VM state while overriding the changed variable.
        this.vm.setVar(variable, numberValue(newValue));

        const updated = new Map<number, Value>();

        for (const lineNumber of affectedLines) {
            const entry = this.lineCache.getEntryForLine(lineNumber);
            if (!entry || entry.bytecode.opcodes.length === 0) continue;
            try {
                const stackBefore = this.vm.getStack().length;
                const result = executeBytecode(entry.bytecode, this.vm);
                // Pop any leftover stack items from this expression
                while (this.vm.getStack().length > stackBefore) {
                    this.vm.pop();
                }
                if (result) {
                    updated.set(lineNumber, result);
                    entry.result = result;
                    this.lineCache.markClean(lineNumber);
                }
            } catch { }
        }
        return updated;
    }
}