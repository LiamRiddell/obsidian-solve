import { VM } from "@solve-js/vm/OpRegistry";
import { DependencyGraph } from "@solve-js/vm/DependencyGraph";
import { LineCache, LineCacheEntry } from "@solve-js/cache/LineCache";
import { ScopeManager } from "@solve-js/vm/ScopeManager";
import { Lexer } from "@solve-js/lexer/Lexer";
import { PrecedenceParser } from "@solve-js/parser/PrecedenceParser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { BytecodeBuilder, type BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";
import { createVM, executeBytecode } from "@solve-js/vm/VM";
import type { EvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { Value, numberValue, pendingValue, errorValue } from "@solve-js/vm/Value";
import { PluginManager } from "@solve-js/plugins/PluginSystem";
import { BUILTIN_PACKAGES } from "@solve-js/providers/builtins";
import type { ISolvePackage } from "@solve-js/api/SolveAPI";
import { sharedVariableResolver } from "@solve-js/variables/VariableResolver";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import { AsyncResultCache } from "@solve-js/cache/AsyncResultCache";
import {
	ResolverRegistry,
	type AsyncCheckResult,
} from "@solve-js/resolvers/ResolverRegistry";
import {
	AsyncResolutionBatcher,
	type AsyncResolutionListener,
	type UnsubscribeFn,
} from "@solve-js/engine/AsyncResolutionBatcher";
import { dataQueryService } from "@solve-js/services/DataQueryService";
import { AllocationTracker, type PipelineTelemetry, type StageAllocation } from "@solve-js/telemetry";
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
import { buildTokenLookup } from "@solve-js/lexer/tokenRegistration";
import { abortLogger } from "@app/utilities/AbortControllerLogger";
import { TokenNormalizer, createBuiltinNormalizerRules } from "@solve-js/normalizer";
import type { NormalizerRule } from "@solve-js/normalizer";



/**
 * Core expression evaluation engine — the top-level orchestrator.
 *
 * Owns the full evaluation pipeline: lexing, parsing, bytecode compilation,
 * VM execution, DAG-based dependency tracking, and async resolution.
 *
 * Key responsibilities:
 * - Pipeline orchestration: lex → parse → compile → execute → cache
 * - Bytecode caching for repeated expressions
 * - DAG-based incremental re-evaluation on variable changes
 * - Async resolution via ResolverRegistry + AsyncResolutionBatcher
 * - Package registration (built-in + external plugins)
 * - Safety validation (length, complexity, nesting)
 * - Diagnostic pipeline integration
 * - Keystroke-level AbortSignal management
 *
 * Each engine instance has its own isolated lexer, registry, parser, and
 * LineCache. The VM is shared via `sharedOpRegistry` but each engine
 * creates its own VM instance with configurable limits.
 *
 * @example
 * ```typescript
 * import { ExpressionEngine } from "@solve-js";
 * const engine = new ExpressionEngine("en");
 * const value = engine.evaluateExpression("2 + 2 * 10");
 * console.log(value.toNumber()); // 22
 * ```
 */
export class ExpressionEngine {
    private dag = new DependencyGraph();
    private lineCache = new LineCache();
    private scopeManager = new ScopeManager();
    private lexer: Lexer;
    private registry: ParseletRegistry;
    private parser: PrecedenceParser;
    private localeCode: string;
    private vm: VM;
    private config: typeof DEFAULT_CONFIG;
    private pluginManager: PluginManager;
    private diagnosticPipeline: DiagnosticPipeline;
    /** Registry of async resolvers from registered packages. */
    private resolverRegistry = new ResolverRegistry();

    /**
     * Keystroke-level AbortSignal — set by the UI layer (MarkdownEditorViewPlugin)
     * before each evaluation. When the user types a new keystroke, the old signal
     * is aborted, causing all in-flight async work (fetches, preflight checks,
     * batcher flushes) to be canceled atomically.
     *
     * executeAndStore() and executeRaw() link their local AbortControllers to
     * this signal so that when the keystroke changes, all per-evaluation controllers
     * are aborted together.
     */
    private keystrokeSignal: AbortSignal | null = null;

    /**
     * Micro-batcher that collapses multiple async resolutions into a single
     * DAG walk + re-evaluation pass. Replaces the old single-callback pattern.
     */
    private batcher: AsyncResolutionBatcher;
    /** Post-lexer token normalizer for phrase fusion, implicit multiply, etc. */
    private normalizer: TokenNormalizer;

    /**
	 * Unsubscribe from DataQueryService cache updates.
	 * Set in constructor, called in clear()/destroy.
	 */
	private _dqsUnsubscribe: (() => void) | null = null;
    // Bytecode cache — avoids re-parsing identical expressions
    private bytecodeCache: Map<string, BytecodeProgram> = new Map();
    // Pre-allocated BytecodeBuilder pool — avoids 4 heap allocations per
    // expression (opcode array, number array, string array, stringIndex Map).
    // Pool size of 4 handles concurrent evaluation paths. Builders are
    // reset() and returned to the pool after use rather than discarded.
    private builderPool: BytecodeBuilder[] = [
        new BytecodeBuilder(),
        new BytecodeBuilder(),
        new BytecodeBuilder(),
        new BytecodeBuilder(),
    ];
    // Index into the builder pool — incremented modulo pool size.
    // Not thread-safe, but ExpressionEngine is single-threaded.
    private builderPoolIndex = 0;
    // Most recent pipeline telemetry — populated when AllocationTracker.isEnabled().
    // Null when tracking is disabled (production — zero overhead).
    private lastTelemetry: PipelineTelemetry | null = null;

    constructor(
        localeCode = "en",
        diagnosticMode = false,
        config?: Partial<typeof DEFAULT_CONFIG>,
        diagnosticPipeline?: DiagnosticPipeline,
        packages?: ISolvePackage[]
    ) {
        this.localeCode = localeCode;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.lexer = new Lexer(localeCode, buildTokenLookup(localeCode));
        this.registry = new ParseletRegistry();
        this.pluginManager = new PluginManager(this.registry);
        // Wire resolver registry so PluginManager can register async resolvers
        this.pluginManager.resolverRegistry = this.resolverRegistry;

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
        this.normalizer = new TokenNormalizer();
        // Register built-in normalizer rules (phrase fusion, implicit multiply)
        for (const rule of createBuiltinNormalizerRules()) {
            this.normalizer.register(rule);
        }

        this.parser = new PrecedenceParser(this.registry, this.config.validation.maxNestingDepth, localeCode);
        this.vm = createVM(sharedOpRegistry, this.config.vm.maxStackDepth, this.config.vm.maxInstructions);
		this.batcher = new AsyncResolutionBatcher(this.dag, this.lineCache, this.vm);

		// ── Bridge: DataQueryService → batcher ──────────────────────
		// DataQueryService resolves data independently (via its own worker).
		// When a cache update fires, we feed it into the batcher so it goes
		// through the same DAG-walk + re-execution + event-stream pipeline
		// as engine-originated async resolutions. This eliminates the old
		// parallel pipeline where MarkdownEditorViewPlugin subscribed to
		// DataQueryService directly and did its own manual DAG walk.
		this._dqsUnsubscribe = dataQueryService.onCacheUpdate(
			(dataSourceId, queryKeys, _data) => {
				// DataQueryService uses compound queryKeys (e.g., ["rate", "USD", "GBP"]).
				// Join into a single string to match the DAG's stored format
				// (registered via registerLineDataSourceDependency with [queryKey]).
				const compositeKey = queryKeys.join(':');
				this.batcher.add({
					queryKey: compositeKey,
					packageId: dataSourceId,
					signal: new AbortController().signal,
					isError: false,
				});
			},
		);
	}

    // ── Multi-listener event stream ────────────────────────────────────

    /**
     * Subscribe to async resolution events.
     *
     * Receives either `{ type: 'lines-updated', lineNumbers, affectedQueryKeys }`
     * or `{ type: 'error', queryKey, packageId, error }`.
     *
     * Use this instead of the deprecated `onAsyncResolved` callback for:
     * - Triggering view re-renders after async data loads
     * - Showing transient error toasts for failed resolutions
     * - Updating loading spinners for specific query keys
     *
     * @returns An unsubscribe function — call it in your `destroy()` method.
     */
    addAsyncListener(listener: AsyncResolutionListener): UnsubscribeFn {
        return this.batcher.addListener(listener);
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
        if (pkg.asyncResolver) {
            this.resolverRegistry.register(pkg.asyncResolver);
        }
        if (pkg.normalizerRules) {
            for (const rule of pkg.normalizerRules) {
                this.normalizer.register(rule);
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
     * Store a result in the line cache (with DAG registration).
     * Extracted common pattern from 8 call sites.
     */
    private storeLineResult(
        lineNumber: number,
        result: Value,
        program: BytecodeProgram,
        reads: string[],
        writes: string[],
        expression: string,
    ): void {
        this.lineCache.set(lineNumber, new LineCacheEntry(
            result,
            program,
            reads,
            writes.length > 0 ? writes[0] : null
        ), expression);
    }

    /**
     * Execute bytecode and handle the result.
     *
     * Replaces ALL 5 try/catch blocks that previously caught AsyncSuspenseError.
     * Now that executeBytecode returns an EvalResult discriminated union,
     * we simply check result.type instead of catching errors.
     *
     * Sets up AbortController → VM for stale-data prevention.
     * Cleans up the VM stack after execution (success or pending).
     * Fires async resolution via fire-and-forget for pending results.
     */
    private executeAndStore(
        program: BytecodeProgram,
        lineNumber: number,
        expression: string,
        reads: string[],
        writes: string[],
        packageId: string,
    ): Value {
        const stackBefore = this.vm.getStack().length;

        // Set up AbortController for this evaluation.
        // When the user edits the line before resolution, the old controller
        // is aborted, preventing stale data from surfacing.
        const controller = new AbortController();
        // ── Link to keystroke signal (One AbortController Per Keystroke) ──
        // When the user types a new keystroke, the keystrokeController is aborted,
        // which in turn aborts this local controller, canceling all in-flight
        // async work for this specific evaluation.
        const abortLocal = () => controller.abort();
        this.keystrokeSignal?.addEventListener('abort', abortLocal, { once: true });

        abortLogger.localControllerCreated("executeAndStore");
        if (this.keystrokeSignal) {
            abortLogger.signalLinked("executeAndStore");
        }

        this.vm.activeSignal = controller.signal;
        this.vm.abortCurrent = () => {
            abortLogger.signalUnlinked("executeAndStore");
            this.keystrokeSignal?.removeEventListener('abort', abortLocal);
            controller.abort();
        };

        const result = executeBytecode(program, this.vm);

        // Single stack cleanup (replaces 10 occurrences)
        while (this.vm.getStack().length > stackBefore) {
            this.vm.pop();
        }

        if (result.type === 'pending') {
            // Fire-and-forget async resolution
            void this.resolveAsync(result);

            // Register data source dependency in DAG for re-evaluation tracking
            this.dag.registerLineDataSourceDependency(
                lineNumber,
                result.packageId || packageId,
                [result.queryKey]
            );

            const pending = pendingValue(result.queryKey);
            this.storeLineResult(lineNumber, pending, program, reads, writes, expression);
            return pending;
        }

        // Success path
        this.dag.registerLine(lineNumber, reads, writes);
        this.storeLineResult(lineNumber, result.value, program, reads, writes, expression);
        return result.value;
    }

    /**
     * Execute bytecode and return the raw EvalResult without DAG/LineCache updates.
     * Used by reEvaluateLine, executeCached, and evaluateIncremental which
     * manage their own cache state differently.
     */
    private executeRaw(program: BytecodeProgram): EvalResult {
        const stackBefore = this.vm.getStack().length;

        const controller = new AbortController();
        // ── Link to keystroke signal (One AbortController Per Keystroke) ──
        const abortLocal = () => controller.abort();
        this.keystrokeSignal?.addEventListener('abort', abortLocal, { once: true });

        abortLogger.localControllerCreated("executeRaw");
        if (this.keystrokeSignal) {
            abortLogger.signalLinked("executeRaw");
        }

        this.vm.activeSignal = controller.signal;
        this.vm.abortCurrent = () => {
            abortLogger.signalUnlinked("executeRaw");
            this.keystrokeSignal?.removeEventListener('abort', abortLocal);
            controller.abort();
        };

        const result = executeBytecode(program, this.vm);

        // Stack cleanup
        while (this.vm.getStack().length > stackBefore) {
            this.vm.pop();
        }

        return result;
    }

    /**
     * Fire-and-forget async resolution using async/await.
     *
     * On resolution or error:
     * 1. Checks AbortSignal — if aborted, stale data is discarded.
     * 2. Stores result/error in AsyncResultCache (per-package scoped).
     * 3. Defers re-evaluation to AsyncResolutionBatcher which collapses
     *    multiple resolutions into a single DAG walk + re-execution pass
     *    and fires typed events to all listeners.
     */
    private async resolveAsync(pending: Extract<EvalResult, { type: 'pending' }>): Promise<void> {
        const { queryKey, resolver, packageId, signal } = pending;
        const effectivePackageId = packageId || '_engine';

        // Dedup: skip if already in-flight
        if (AsyncResultCache.isInFlight(effectivePackageId, queryKey)) return;

        AsyncResultCache.registerInFlight(effectivePackageId, queryKey, resolver);

        try {
            const value = await resolver;
            if (signal.aborted) {
                abortLogger.staleDataDiscarded(queryKey, "signal aborted after resolve");
                return; // Stale — expression changed
            }
            AsyncResultCache.set(effectivePackageId, queryKey, value);

            // Defer re-evaluation to batcher (collapsed across microtask).
            this.batcher.add({
                queryKey,
                packageId: effectivePackageId,
                signal,
                isError: false,
            });
        } catch (err) {
            if (signal.aborted) {
                abortLogger.staleDataDiscarded(queryKey, "signal aborted after error");
                return; // Stale — expression changed
            }
            const error = err instanceof Error ? err : new Error(String(err));
            AsyncResultCache.setError(effectivePackageId, queryKey, error);

            // Notify batcher of the error.
            this.batcher.add({
                queryKey,
                packageId: effectivePackageId,
                signal,
                isError: true,
                error,
            });
        }
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
     * Route parse+compile to the active parser (PrecedenceParser or Recursive Descent).
     *
     * Sets up the builder on the active parser, loads tokens, and calls
     * parseExpression(). Abstracts the API difference between the two parsers:
     * - PrecedenceParser:  parser.setBuilder(builder); parser.parseExpression(0)
     * - RD:                parser.builder = builder; parser.parseExpression(0)
     */
    private parseExpression(builder: BytecodeBuilder, tokens: Token[], hasParens?: boolean): void {
        this.parser.setBuilder(builder);
        // When autoBalanceParens is disabled, skip the O(n) paren-count scan
        // by always passing false — the parser will fail naturally on unmatched
        // parens instead of silently inserting missing closing/opening tokens.
        this.parser.load(tokens, this.config.validation.autoBalanceParens ? hasParens : false);
        this.parser.parseExpression(0);
    }

    /**
     * Evaluate an expression using already-lexed tokens.
     *
     * This is the shared core of both evaluateLine (which lexes via
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
            this.lineCache.set(lineNumber, new LineCacheEntry(v, { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [], hasAsync: false }, [], null), expression);
            return v;
        }

        // ══ NORMALIZER ══
        // Normalize tokens for phrase fusion, implicit multiply, domain token merging.
        const normalizedTokens = this.normalizer.normalize(tokens);

        // ══ SAFETY CHECK 2: Complexity scoring ══
        const complexityCheck = checkExpressionComplexity(normalizedTokens, this.config.validation);
        if (!complexityCheck.passed) {
            throw ErrorFactory.execution(
                'EVALUATION_ERROR',
                complexityCheck.errorMessage!,
                { lineNumber }
            );
        }

        const { reads, writes } = extractReadsAndWrites(normalizedTokens);

        let program: BytecodeProgram;
        const cachedProgram = this.bytecodeCache.get(expression);
        if (cachedProgram) {
            program = cachedProgram;
        } else {
            // Get a pooled builder — avoids 4 heap allocations per expression
            const builder = this.builderPool[this.builderPoolIndex++ % this.builderPool.length];
            builder.reset();
            try {
                this.parseExpression(builder, normalizedTokens, hasParens);
            } catch (e) {
                const errorMessage = e instanceof Error ? e.message : String(e);
                throw ErrorFactory.execution(
                    'EVALUATION_ERROR',
                    errorMessage,
                    { lineNumber }
                );
            }

            // Use build() which allocates TypedArrays directly from builder arrays.
            // This is a single copy (builder → TypedArray) instead of the old
            // double copy (builder → pool buffer → TypedArray for cache).
            program = builder.build();
            this.bytecodeCache.set(expression, program);
        }

        // ══ PRE-FLIGHT ASYNC CHECK ══
        // O(1) guard: skip the O(n) resolver scan when the bytecode has no
        // async opcodes AND no resolvers are registered. Either condition
        // alone is enough to warrant a preflight scan:
        //   - program.hasAsync: bytecode contains CALL_PLUGIN (async VM path)
        //   - resolverRegistry.size > 0: resolvers may intercept any expression
        // For purely sync expressions (e.g., `2 + 2`) with no resolvers, this
        // is an O(1) fast-path that bypasses the resolver scan entirely.
        if (program.hasAsync || this.resolverRegistry.size > 0) {
        // Check all registered async resolvers BEFORE VM execution.
        // If any resolver says "data not ready", skip VM and return Pending.
        // Link the preflight AbortController to the keystroke signal so
        // that in-flight preflight checks are canceled on new keystrokes.
        const preflightController = new AbortController();
        const abortPreflight = () => preflightController.abort();
        this.keystrokeSignal?.addEventListener('abort', abortPreflight, { once: true });

        abortLogger.localControllerCreated("evaluateWithTokens preflight");
        if (this.keystrokeSignal) {
            abortLogger.signalLinked("evaluateWithTokens preflight");
        }

        const preflightSignal = preflightController.signal;
        const asyncCheck = this.resolverRegistry.preflightAll(
            normalizedTokens, program, '_engine', preflightSignal
        );
        if (asyncCheck) {
            // Fire-and-forget — resolves asynchronously, re-evaluates on completion
            void this.resolveAsync({
                type: 'pending',
                queryKey: asyncCheck.queryKey,
                resolver: asyncCheck.resolver,
                packageId: asyncCheck.packageId || '_engine',
                signal: asyncCheck.signal,
            });

            // Register data source dependency for DAG re-evaluation tracking
            this.dag.registerLineDataSourceDependency(
                lineNumber,
                asyncCheck.packageId || '_engine',
                [asyncCheck.queryKey]
            );

            const pending = pendingValue(asyncCheck.queryKey);
            this.storeLineResult(lineNumber, pending, program, reads, writes, expression);
            return pending;
        }
        } // end preflight guard

        // Execute and handle result — no try/catch needed.
        // executeBytecode now returns EvalResult (discriminated union).
        return this.executeAndStore(program, lineNumber, expression, reads, writes, '_engine');
    }

    	/**
	 * Evaluate a single expression line with full DAG and LineCache integration.
	 *
	 * @param lineNumber - 1-based line position in the document.
	 * @param lineText - The raw line text (may contain inline solve syntax).
	 * @returns The evaluated Value.
	 * @throws {SolveError} On safety validation failure or parse error.
	 */
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
     *
     * When AllocationTracker.isEnabled(), each pipeline stage is wrapped
     * with AllocationTracker.track() to capture wall-time and heap delta.
     * When disabled (production), track() is a zero-overhead passthrough.
     */
    private evaluateExpressionWithDiagnostic(expression: string, lineNumber: number, inputType: string = "expression"): { value: Value; tokens: Token[]; program: BytecodeProgram; error?: string; debug?: DiagnosticReportJSON } {
        const pipeline = this.diagnosticPipeline;
        const hasCollectors = pipeline.hasCollectors;
        const trackEnabled = AllocationTracker.isEnabled();
        const stageAllocs: StageAllocation[] = [];

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

        // ══ LEXER STAGE ══
        // Lexing with token emission events — use resetExpression to skip
        // redundant classifyLine (caller already knows this is an expression).
        const lexResult = AllocationTracker.track('lexer', () => {
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
            return { hasParens };
        });
        const hasParens = lexResult.result.hasParens;
        if (trackEnabled && lexResult.alloc) stageAllocs.push(lexResult.alloc);

        if (tokens.length === 0) {
            const v = numberValue(0);
            this.lineCache.set(lineNumber, new LineCacheEntry(v, { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [], hasAsync: false }, [], null), expression);

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

            return { value: v, tokens, program: { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [], hasAsync: false }, debug: undefined };
        }

        // ══ NORMALIZER STAGE ══
        // Post-lexer token normalization: phrase fusion, implicit multiply, etc.
        // Normalized tokens replace raw tokens for parsing and safety checks.
        let normalizedTokens: Token[] = tokens;
        if (this.normalizer.ruleCount > 0) {
            if (hasCollectors) {
                pipeline.fireNormalizerStart({
                    type: DiagnosticEventType.NormalizerStart,
                    elapsedNs: 0,
                    expression,
                    inputTokenCount: tokens.length,
                });
            }

            let fusionCount = 0;
            normalizedTokens = this.normalizer.normalize(tokens, (fusion) => {
                if (hasCollectors) {
                    fusionCount++;
                    pipeline.fireTokenFused({
                        type: DiagnosticEventType.TokenFused,
                        elapsedNs: 0,
                        expression,
                        ruleName: fusion.rule,
                        sourceTokenCount: fusion.sourceTokens.length,
                        fusedTokenType: fusion.fusedToken.type,
                        fusedTokenValue: fusion.fusedToken.value,
                    });
                }
            });

            if (hasCollectors) {
                pipeline.fireNormalizerEnd({
                    type: DiagnosticEventType.NormalizerEnd,
                    elapsedNs: 0,
                    expression,
                    outputTokenCount: normalizedTokens.length,
                    fusionsCount: fusionCount,
                });
            }
        }

        // === SAFETY CHECK 2: Complexity scoring ===
        const complexityCheck = checkExpressionComplexity(normalizedTokens, this.config.validation);
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
                program: { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [], hasAsync: false },
                error: complexityCheck.errorMessage!,
                debug: undefined
            };
        }

        const { reads, writes } = extractReadsAndWrites(normalizedTokens);

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

            // ══ PARSER STAGE ══
            // Get a pooled builder — avoids 4 heap allocations per expression
            const builder = this.builderPool[this.builderPoolIndex++ % this.builderPool.length];
            builder.reset();
            try {
                const parseResult = AllocationTracker.track('parser', () => {
                    this.parseExpression(builder, normalizedTokens, hasParens);
                    // Use build() which allocates TypedArrays directly from builder arrays.
                    // This is a single copy (builder → TypedArray) instead of the old
                    // double copy (builder → pool buffer → TypedArray for cache).
                    return builder.build();
                });
                if (trackEnabled && parseResult.alloc) stageAllocs.push(parseResult.alloc);
                program = parseResult.result;
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
                    tokens: normalizedTokens,
                    program: { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [], hasAsync: false },
                    error: errorMessage,
                    debug: undefined
                };
            }

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

        // ══ PRE-FLIGHT ASYNC CHECK ══
        // O(1) guard: skip the O(n) resolver scan when the bytecode has no
        // async opcodes AND no resolvers are registered.
        if (program.hasAsync || this.resolverRegistry.size > 0) {
        // Check all registered async resolvers BEFORE VM execution.
        // Link the preflight AbortController to the keystroke signal so
        // that in-flight preflight checks are canceled on new keystrokes.
        const preflightController = new AbortController();
        const abortPreflight = () => preflightController.abort();
        this.keystrokeSignal?.addEventListener('abort', abortPreflight, { once: true });

        abortLogger.localControllerCreated("diagnostic preflight");
        if (this.keystrokeSignal) {
            abortLogger.signalLinked("diagnostic preflight");
        }

        const preflightSignal = preflightController.signal;
        const asyncCheck = this.resolverRegistry.preflightAll(
            normalizedTokens, program, '_engine', preflightSignal
        );
        if (asyncCheck) {
            void this.resolveAsync({
                type: 'pending',
                queryKey: asyncCheck.queryKey,
                resolver: asyncCheck.resolver,
                packageId: asyncCheck.packageId || '_engine',
                signal: asyncCheck.signal,
            });

            this.dag.registerLineDataSourceDependency(
                lineNumber,
                asyncCheck.packageId || '_engine',
                [asyncCheck.queryKey]
            );

            const pending = pendingValue(asyncCheck.queryKey);
            this.storeLineResult(lineNumber, pending, program, reads, writes, expression);

            if (hasCollectors) {
                pipeline.firePipelineEnd({
                    type: DiagnosticEventType.PipelineEnd,
                    elapsedNs: 0,
                    expression,
                    success: true,
                    totalTokens: tokens.length,
                    totalOpcodes: program.opcodes.length,
                });
            }

            return {
                value: pending,
                tokens: normalizedTokens,
                program,
                debug: undefined,
            };
        }
        } // end preflight guard

        // ══ VM STAGE ══
        const emitVmTrace = hasCollectors && this.config.diagnostic.vmTraceEnabled === true;
        const stackBefore = this.vm.getStack().length;

        // Set up AbortController for VM execution
        // ── Link to keystroke signal (One AbortController Per Keystroke) ──
        const controller = new AbortController();
        const abortLocal = () => controller.abort();
        this.keystrokeSignal?.addEventListener('abort', abortLocal, { once: true });

        abortLogger.localControllerCreated("diagnostic vm");
        if (this.keystrokeSignal) {
            abortLogger.signalLinked("diagnostic vm");
        }

        this.vm.activeSignal = controller.signal;
        this.vm.abortCurrent = () => {
            abortLogger.signalUnlinked("diagnostic vm");
            this.keystrokeSignal?.removeEventListener('abort', abortLocal);
            controller.abort();
        };

        let evalResult: EvalResult;
        const vmResult = AllocationTracker.track('vm', () => {
            return executeBytecode(
                program,
                this.vm,
                emitVmTrace ? pipeline : undefined,
                expression
            );
        }, { cacheHit: !!cachedProgram });
        evalResult = vmResult.result;
        if (trackEnabled && vmResult.alloc) stageAllocs.push(vmResult.alloc);

        // Stack cleanup
        while (this.vm.getStack().length > stackBefore) {
            this.vm.pop();
        }

        if (evalResult.type === 'pending') {
            void this.resolveAsync(evalResult);

            this.dag.registerLineDataSourceDependency(
                lineNumber,
                evalResult.packageId || '_engine',
                [evalResult.queryKey]
            );

            const pending = pendingValue(evalResult.queryKey);
            this.storeLineResult(lineNumber, pending, program, reads, writes, expression);

            if (hasCollectors) {
                pipeline.firePipelineEnd({
                    type: DiagnosticEventType.PipelineEnd,
                    elapsedNs: 0,
                    expression,
                    success: true,
                    totalTokens: tokens.length,
                    totalOpcodes: program.opcodes.length,
                });
            }

            return {
                value: pending,
                tokens: normalizedTokens,
                program,
                debug: undefined,
            };
        }

        const result = evalResult.value;

        this.dag.registerLine(lineNumber, reads, writes);
        this.storeLineResult(lineNumber, result, program, reads, writes, expression);

        // ══ BUILD TELEMETRY ══
        if (trackEnabled && stageAllocs.length > 0) {
            this.lastTelemetry = AllocationTracker.createTelemetry(
                expression,
                stageAllocs,
                !!cachedProgram
            );
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
                tokens: normalizedTokens,
                program,
                debug: reports[0]?.toJSON() || undefined,
            };
         }

        return {
            value: result!,
            tokens: normalizedTokens,
            program,
        };
    }

    reEvaluateLine(lineNumber: number, expression: string): Value | undefined {
        const entry = this.lineCache.get(lineNumber, expression);
        if (!entry) return undefined;

        const program = this.bytecodeCache.get(expression);
        if (!program) return undefined;

        // ══ PRE-FLIGHT ASYNC CHECK ══
        // O(1) guard: skip the O(n) resolver scan when the bytecode has no
        // async opcodes AND no resolvers are registered.
        if (entry.bytecode.hasAsync || this.resolverRegistry.size > 0) {
        // Pre-flight async check — run before VM even for cached bytecode
        // ── Link to keystroke signal ──
        const preflightController = new AbortController();
        const abortPreflight = () => preflightController.abort();
        this.keystrokeSignal?.addEventListener('abort', abortPreflight, { once: true });

        abortLogger.localControllerCreated("reEvaluateLine preflight");
        if (this.keystrokeSignal) {
            abortLogger.signalLinked("reEvaluateLine preflight");
        }

        const preflightSignal = preflightController.signal;
        const asyncCheck = this.resolverRegistry.preflightAll(
            [], entry.bytecode, '_engine', preflightSignal
        );
        if (asyncCheck) {
            void this.resolveAsync({
                type: 'pending',
                queryKey: asyncCheck.queryKey,
                resolver: asyncCheck.resolver,
                packageId: asyncCheck.packageId || '_engine',
                signal: asyncCheck.signal,
            });
            return pendingValue(asyncCheck.queryKey);
        }
        } // end hasAsync guard

        this.vm.reset();
        const evalResult = this.executeRaw(program);

        if (evalResult.type === 'pending') {
            void this.resolveAsync(evalResult);
            return pendingValue(evalResult.queryKey);
        }

        const result = evalResult.value;
        entry.result = result;

        return result;
    }

    getDag(): DependencyGraph {
        return this.dag;
    }

    getLineCache(): LineCache {
        return this.lineCache;
    }

    getBytecodeCache(): Map<string, BytecodeProgram> {
        return this.bytecodeCache;
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

    getParser(): PrecedenceParser {
        return this.parser;
    }

    isDiagnosticMode(): boolean {
        return this.diagnosticPipeline.hasCollectors;
    }

    /**
     * Set the keystroke-level AbortSignal for the current evaluation cycle.
     *
     * Called by the UI layer (via ThreeTierEvaluator) before evaluate() or
     * evaluateAll(). All per-evaluation AbortControllers created during this
     * cycle link to this signal so that when the user types a new keystroke,
     * all in-flight async work is canceled atomically.
     *
     * @param signal The keystroke's AbortSignal, or null to clear.
     */
    setKeystrokeSignal(signal: AbortSignal | null): void {
        if (signal) {
            abortLogger.keystrokeSignalSet(signal.aborted);
        } else {
            abortLogger.keystrokeSignalCleared();
        }
        this.keystrokeSignal = signal;
    }

    /**
     * Get the most recent pipeline telemetry from AllocationTracker.
     *
     * Returns null when AllocationTracker.isEnabled() is false (production —
     * zero overhead), or when no expression has been evaluated via
     * evaluateExpressionWithDiagnostic() since the last clear().
     *
     * Use this in test/benchmark suites to inspect per-stage wall-time and
     * heap allocation data without enabling the full diagnostic pipeline.
     */
    getLastTelemetry(): PipelineTelemetry | null {
        return this.lastTelemetry;
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
				program: { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [], hasAsync: false },
				tokens: [],
				reads: [],
				writes: [],
			};
		}

		// Normalize tokens for phrase fusion, implicit multiply, domain token merging.
		const normalizedTokens = this.normalizer.normalize(tokens);

		// Complexity check — delegate to ExpressionEngineSafety.ts
		const complexityCheck = checkExpressionComplexity(normalizedTokens, this.config.validation);
		if (!complexityCheck.passed) {
			throw ErrorFactory.validation("EXPRESSION_TOO_COMPLEX", complexityCheck.errorMessage!);
		}

		const { reads, writes } = extractReadsAndWrites(normalizedTokens);

		// Check bytecode cache
		const cachedProgram = this.bytecodeCache.get(expression);
		if (cachedProgram) {
			return { program: cachedProgram, tokens, reads, writes };
		}

		// Parse and compile — get a pooled builder to avoid heap allocations
		const builder = this.builderPool[this.builderPoolIndex++ % this.builderPool.length];
		builder.reset();
		try {
			this.parseExpression(builder, normalizedTokens, hasParens);
		} catch (e) {
			const errorMessage = e instanceof Error ? e.message : String(e);
			throw ErrorFactory.parsing(
				"PARSE_ERROR",
				errorMessage
			);
		}

		// Use build() which allocates TypedArrays directly from builder arrays.
		// This is a single copy (builder → TypedArray) instead of the old
		// double copy (builder → pool buffer → TypedArray for cache).
		const program = builder.build();
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
		const evalResult = this.executeRaw(program);

		if (evalResult.type === 'pending') {
			void this.resolveAsync(evalResult);
			return pendingValue(evalResult.queryKey);
		}

		return evalResult.value;
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
     }	clear(): void {
        // Cancel pending batcher flushes and clear listeners to prevent
        // stale re-evaluations from in-flight promises that resolve after clear.
		// NOTE: _dqsUnsubscribe is NOT called here — the bridge must survive
		// engine clear() so DataQueryService cache updates continue to flow
		// into the batcher after document switches / engine resets.
		this.batcher.clearAll();
         this.dag.clear();
         this.lineCache.clear();
         this.scopeManager.clear();
         this.bytecodeCache.clear();
         this.vm.reset();
         this.lastTelemetry = null;
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
            const evalResult = this.executeRaw(entry.bytecode);

            if (evalResult.type === 'pending') {
                void this.resolveAsync(evalResult);
                // Don't block — continue processing other affected lines.
                // The pending result will trigger re-evaluation when resolved.
                continue;
            }

            const result = evalResult.value;
            updated.set(lineNumber, result);
            entry.result = result;
        }
        return updated;
    }
}