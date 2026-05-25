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
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import {
    ParsingResult,
    ParsedLine,
    InlineSolvePosition,
    UnifiedParsingOptions,
} from "@solve-js/types/ParsingResult";
import { DiagnosticReportJSON } from "@solve-js/diagnostics";
import type { Token } from "@solve-js/lexer/Token";
import { DEFAULT_CONFIG } from "@solve-js/constants/Configuration";
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
    isEmptyLine,
    findInlineSolvesInLine,
} from "@solve-js/engine/ExpressionEngineSafety";

// Pre-existing: __WORKER_URL__ is substituted by esbuild define at build time
declare var __WORKER_URL__: string | undefined;

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
    // O(1) lookup for markdown token types to skip during lexing
    private markdownTokenTypes = new Set([
        "MD_H1", "MD_H2", "MD_H3", "MD_H4", "MD_H5", "MD_H6",
        "MD_BOLD", "MD_ITALIC", "MD_CODE", "MD_LINK", "MD_IMAGE",
        "MD_LIST_ITEM", "MD_BLOCKQUOTE", "MD_HR", "MD_TABLE",
        "MD_NEWLINE", "WS"
    ]);

    constructor(
        localeCode = "en",
        diagnosticMode = false,
        config?: Partial<typeof DEFAULT_CONFIG>,
        diagnosticPipeline?: DiagnosticPipeline
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
        this.parser = new Parser(this.registry, this.config.validation.maxNestingDepth, localeCode);
        this.vm = createVM(sharedOpRegistry, this.config.vm.maxStackDepth, this.config.vm.maxInstructions);
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
        const lines = input.split('\n');
        const processedLines = this.evaluateLines(lines);

        const result: ParsingResult = {
            lines: processedLines,
            totalLines: lines.length,
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
     * Shares lexer state, bytecode cache, and VM across all lines for maximum efficiency.
     * This avoids the per-line overhead of parseDocument() when processing visible lines
     * in the frontend — one call instead of N.
     */
    evaluateLines(lines: string[]): ParsedLine[] {
        const result: ParsedLine[] = [];
        let currentPosition = 0;

        for (let i = 0; i < lines.length; i++) {
            const lineText = lines[i];
            const lineNumber = i + 1;
            const startPosition = currentPosition;
            const endPosition = startPosition + lineText.length;
            currentPosition = endPosition + 1;

            const isEmpty = this.isEmptyLine(lineText);
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
                error: null,
            };

            if (!isEmpty) {
                const isVariableAssignment = lineText.trim().startsWith(":");

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
                        try {
                            const value = this.evaluateLine(lineNumber, expression);
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
     * Check if a line is effectively empty (whitespace only or only markdown syntax).
     */
    private isEmptyLine(lineText: string): boolean {
        return isEmptyLine(lineText);
    }

    /**
     * Find all inline solves in a line with precise coordinate mapping.
     */
    private findInlineSolvesInLine(lineText: string, lineNumber: number): InlineSolvePosition[] {
        return findInlineSolvesInLine(lineText, lineNumber);
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

        // Lexing with token emission events
        this.lexer.reset(expression);
        let tokenIndex = 0;
        for (const t of this.lexer) {
            if (this.markdownTokenTypes.has(t.type)) continue;
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
            this.lineCache.set(lineNumber, new LineCacheEntry(v, { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [] }, [], null, false), expression);

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

            return { value: v, tokens, program: { opcodes: [], numbers: [], strings: [] }, debug: undefined };
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
                program: { opcodes: [], numbers: [], strings: [] },
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
            this.parser.load(tokens);
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
                    program: { opcodes: [], numbers: [], strings: [] },
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
                writes.length > 0 ? writes[0] : null,
                false
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
		// Safety checks
		const lengthCheck = checkExpressionLength(expression, this.config.validation);
		if (!lengthCheck.passed) {
			throw ErrorFactory.validation(
				"EXPRESSION_TOO_LONG",
				expression.length > this.config.validation.maxExpressionLength
					? `Expression exceeds max length of ${this.config.validation.maxExpressionLength} characters (got ${expression.length})`
					: lengthCheck.error!.error
			);
		}

		// Lexing
		const tokens: Token[] = [];
		this.lexer.reset(expression);
		for (const t of this.lexer) {
			if (this.markdownTokenTypes.has(t.type)) continue;
			tokens.push(t);
		}

		if (tokens.length === 0) {
			return {
				program: { opcodes: [], numbers: [], strings: [] },
				tokens: [],
				reads: [],
				writes: [],
			};
		}

		// Complexity check
		const complexityCheck = checkExpressionComplexity(tokens, this.config.validation);
		if (!complexityCheck.passed) {
			throw ErrorFactory.validation(
				"EXPRESSION_TOO_COMPLEX",
				`Expression complexity score ${complexityCheck.complexityScore} exceeds maximum of ${this.config.validation.maxComplexity}`
			);
		}

		const { reads, writes } = extractReadsAndWrites(tokens);

		// Check bytecode cache
		const cachedProgram = this.bytecodeCache.get(expression);
		if (cachedProgram) {
			return { program: cachedProgram, tokens, reads, writes };
		}

		// Parse and compile
		const builder = new BytecodeBuilder();
		this.parser.load(tokens);
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

                setTimeout(resolve, 100);
            });
            promises.push(promise);
        }

        await Promise.all(promises);
        workers.forEach((w) => w.terminate());
        return results;
    }

    private getWorkerUrl(): string | null {
		if (typeof __WORKER_URL__ !== "undefined") return __WORKER_URL__;
        const base = typeof window !== "undefined" ? window.location.origin : "";
        return `${base}/workers/eval-worker.js`;
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