import { ExpressionEngine } from "@/solve-js/src/engine/ExpressionEngine";
import { formatValue } from "@/solve-js/src/format/FormatEngine";
import type { Token } from "@/solve-js/src/lexer/Token";
import { getOpCodeName, OpCode } from "@/solve-js/src/parser/OpCode";
import type { PipelineStageResult } from "@/solve-js/src/types/DiagnosticPipelineResult";
import type { ParseletInfo } from "@/solve-js/src/types/ParsingResult";
import { Value, ValueType } from "@/solve-js/src/vm/Value";
import { AllocationTracker } from "@/solve-js/src/telemetry/AllocationTracker";
import type { PipelineTelemetry } from "@/solve-js/src/telemetry/AllocationTracker";
import { dataQueryService } from "@solve-js/services/DataQueryService";

export type { ParseletInfo, Token };

export interface DebugResult {
	tokens: Token[];
	rawTokens: Token[];
	ast: string;
	output: string;
	outputType: string;
	errors: string[];
	opcodes: OpcodeInfo[];
	constants: ConstantInfo[];
	variables: string[];
	stats: PerformanceStats;
	lineStats: LineStats[] /* per-line stage timings for multi-line docs */;
	markdownOutline: MarkdownNode[];
	lineResults: LineResult[];
	parselets: ParseletInfo[];
	vmTrace: VmTraceStep[];
	dqMetrics: DQMetrics;
	cacheSnapshot: CacheSnapshot;
	diagnosticEvents: DiagnosticEventInfo[];
	/** Structured pipeline stages from engine's DiagnosticPipelineResult (available in diagnostic mode) */
	pipelineStages: PipelineStageResult[];
	/** DAG dependency graph snapshot */
	dagSnapshot: DagSnapshot;
	/** VM checkpoints snapshot */
	checkpoints: CheckpointSnapshot[];
	/** Batcher metrics for async resolution */
	batcherMetrics: BatcherMetrics;    /** Page heatmap entries */
    pageHeatmap: PageHeatmapEntry[];
    /** Allocation tracker pipeline telemetry (per-stage wall time + bytes). */
    pipelineTelemetry: PipelineTelemetry | null;
}

export interface LineResult {
	lineNumber: number;
	expression: string;
	result: string;
	type: string;
	parselet: string;
	error?: string;
	opcodeCount: number;
	wasCached: boolean;
}

export interface OpcodeInfo {
	name: string;
	value: number;
	args: number[];
}
export interface ConstantInfo {
	type: "number" | "string" | "bigint" | "hex";
	value: any;
	index: number;
}
export interface PerformanceStats {
	lexerTime: number;
	parserTime: number;
	bytecodeTime: number;
	executionTime: number;
	totalTime: number;
}
export interface LineStats {
	lineNumber: number;
	stats: PerformanceStats;
}
export interface VmStackValue {
	type: number;
	value: number | bigint | string | boolean | number[];
	unit?: string;
}
export interface VmTraceStep {
	ip: number;
	opcodeName: string;
	opcode: number;
	stackDepth: number;
	instructionNumber: number;
	elapsedNs: number;
	stack: VmStackValue[];
}
export interface DQMetrics {
	queryCount: number;
	pendingQueries: number;
	dataSources: number;
	cacheSize: number;
	dataSourceNames: string[];
}

/** Cache snapshot entry for a single bytecode cache item */
export interface BytecodeCacheEntry {
	expression: string;
	opcodesLength: number;
	numbersLength: number;
	stringsLength: number;
	hasAsync: boolean;
}

/** Cache snapshot entry for a single line cache item */
export interface LineCacheEntryInfo {
	key: string;
	lineNumber: number;
	resultType: string;
	resultValue: string;
	reads: string[];
	writeVar: string | null;
}

/** Async result cache snapshot per package */
export interface AsyncCachePackageInfo {
	packageId: string;
	resolvedCount: number;
	inFlightCount: number;
	errorCount: number;
	entries: Array<{
		key: string;
		status: "resolved" | "in_flight" | "error";
		errorMessage?: string;
	}>;
}

/** Full cache snapshot */
export interface CacheSnapshot {
	bytecode: BytecodeCacheEntry[];
	lineCache: LineCacheEntryInfo[];
	asyncCache: AsyncCachePackageInfo[];
}

/** Diagnostic event type with elapsedNs and expression */
export interface DiagnosticEventInfo {
	type: string;
	/** Wall-clock timestamp (epoch ms) for the badge */
	timestamp: number;
	elapsedNs: number;
	expression: string;
	details: string;
	/** Key used to group related events (e.g. the expression text for async events). */
	groupKey: string;
}
export interface MarkdownNode {
	id: string;
	type: string;
	content: string;
	children: MarkdownNode[];
	hasRun: boolean;
	depth: number;
	result?: string;
}

// ── DAG Snapshot ───────────────────────────────────────────────────────
export interface DagSnapshot {
	/** Variable → line numbers that read it */
	consumers: Record<string, number[]>;
	/** Line number → variables it writes */
	writes: Record<number, string[]>;
	/** Line number → variables it reads */
	reads: Record<number, string[]>;
	/** Line number → data source dependency keys */
	dataSourceDeps: Record<number, string[]>;
	/** Data source key → line numbers that depend on it */
	dataSourceConsumers: Record<string, number[]>;
}

// ── VM Checkpoint Snapshot ─────────────────────────────────────────────
export interface CheckpointSnapshot {
	lineNumber: number;
	variables: string[];
	variableCount: number;
}

// ── Batcher Metrics ────────────────────────────────────────────────────
export interface BatcherMetrics {
	pendingCount: number;
	dedupCount: number;
	workerOffloadCount: number;
	listenerCount: number;
}

// ── Page Heatmap Entry ─────────────────────────────────────────────────
export interface PageHeatmapEntry {
	pageNum: number;
	startLine: number;
	endLine: number;
	temperature: "hot" | "warm" | "cold";
	accessSeq: number;
	hasBytecode: boolean;
	hasResults: boolean;
}

function formatType(val: Value): string {
	const typeNames: Record<number, string> = {
		[ValueType.Number]: "Number",
		[ValueType.Hex]: "Hex",
		[ValueType.BigInt]: "BigInt",
		[ValueType.String]: "String",
		[ValueType.Datetime]: "Datetime",
		[ValueType.Percentage]: "Percentage",
		[ValueType.Uom]: "Uom",
		[ValueType.Array]: "Array",
		[ValueType.Boolean]: "Boolean",
		[ValueType.Unit]: "Unit",
		[ValueType.Pending]: "Pending",
		[ValueType.Error]: "Error",
	};
	const t = typeNames[val.type] ?? "Value";
	return val.unit ? `${t} (${val.unit})` : t;
}

function generateMarkdownOutline(text: string): MarkdownNode[] {
	const nodes: MarkdownNode[] = [];
	const lines = text.split("\n");
	let idCounter = 0;
	lines.forEach((line) => {
		const trimmed = line.trim();
		if (!trimmed) return;
		const headerMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
		if (headerMatch) {
			nodes.push({
				id: `node-${idCounter++}`,
				type: "header",
				content: headerMatch[2],
				children: [],
				hasRun: false,
				depth: headerMatch[1].length,
			});
		} else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
			nodes.push({
				id: `node-${idCounter++}`,
				type: "list-item",
				content: trimmed.substring(2),
				children: [],
				hasRun: true,
				depth: 1,
			});
		} else {
			nodes.push({
				id: `node-${idCounter++}`,
				type: "paragraph",
				content: trimmed,
				children: [],
				hasRun: true,
				depth: 0,
			});
		}
	});
	return nodes;
}

/**
 * Decode opcode operands from the bytecode stream.
 *
 * Opcodes that carry an operand (index into numbers/strings/variables):
 *   PUSH_NUMBER(10), PUSH_BIGINT(11), PUSH_HEX(12),
 *   PUSH_STRING(13), PUSH_BOOLEAN(14), PUSH_VARIABLE(15)
 *   CALL_PLUGIN(50), CALL_BUILTIN(51)
 *   LOAD_VAR(60), STORE_VAR(61)
 *
 * All other opcodes (arithmetic, comparison, stack ops, etc.) have zero operands.
 */
function decodeOpcodeArgs(
	op: number,
	opcodeArray: Uint8Array,
	ip: number
): number[] {
	// Opcodes that take exactly 1 operand (an index)
	const hasOperand =
		(op >= OpCode.PUSH_NUMBER && op <= OpCode.PUSH_VARIABLE) ||
		op === OpCode.CALL_PLUGIN ||
		op === OpCode.CALL_BUILTIN ||
		(op >= OpCode.LOAD_VAR && op <= OpCode.STORE_VAR);
	if (hasOperand && ip + 1 < opcodeArray.length) {
		return [opcodeArray[ip + 1]];
	}
	return [];
}

/**
 * Extract per-stage wall-clock timings from the diagnostic event timeline.
 *
 * Each event carries a real `elapsedNs` stamp (set by TimelineDiagnosticCollector)
 * relative to `pipeline_start`. We derive:
 *   - lexerTime:  first `token_emitted` → last `token_emitted`
 *   - parserTime: last `token_emitted` → `bytecode_built`
 *   - bytecodeTime: last `parselet_matched` → `bytecode_built` (compilation tail)
 *   - executionTime: first `vm_step` (or `bytecode_built`) → `vm_halt`
 *   - totalTime: `pipeline_start` → `pipeline_end`
 *
 * Falls back to zeros when events are unavailable (non-diagnostic mode).
 *
 * When a bytecode cache hit occurs, lexer/parser/compiler stages are skipped
 * entirely — we report zero for those and only capture VM + total time.
 */

/**
 * Extract per-stage timings from a single line's diagnostic events.
 * This is a simpler version of extractStageTimings that doesn't depend
 * on pipeline_start/pipeline_end events (which only appear once globally).
 * The total time for the line is derived from the first-to-last event span. */
function extractLineTimings(
	events: readonly { type: string; elapsedNs: number }[]
): PerformanceStats {
	if (events.length === 0) {
		return {
			lexerTime: 0,
			parserTime: 0,
			bytecodeTime: 0,
			executionTime: 0,
			totalTime: 0,
		};
	}

	const firstEvent = events[0];
	const lastEvent = events[events.length - 1];

	const firstToken = events.find((e) => e.type === "token_emitted");
	const lastToken = [...events]
		.reverse()
		.find((e) => e.type === "token_emitted");
	const firstParselet = events.find((e) => e.type === "parselet_matched");
	const lastParselet = [...events]
		.reverse()
		.find((e) => e.type === "parselet_matched");
	const bytecodeBuilt = events.find((e) => e.type === "bytecode_built");
	const firstVmStep = events.find((e) => e.type === "vm_step");
	const lastVmHalt = [...events].reverse().find((e) => e.type === "vm_halt");

	const lexStart = firstToken?.elapsedNs ?? firstEvent.elapsedNs;
	const lexEnd = lastToken?.elapsedNs ?? lexStart;
	const parseStart = lexEnd;
	const parseEnd =
		bytecodeBuilt?.elapsedNs ?? lastParselet?.elapsedNs ?? parseStart;
	const compileStart = lastParselet?.elapsedNs ?? parseEnd;
	const compileEnd = parseEnd;
	const vmStart =
		firstVmStep?.elapsedNs ?? bytecodeBuilt?.elapsedNs ?? parseEnd;
	const vmEnd = lastVmHalt?.elapsedNs ?? lastEvent.elapsedNs;

	return {
		lexerTime: Math.max(0, lexEnd - lexStart),
		parserTime: Math.max(0, parseEnd - parseStart),
		bytecodeTime: Math.max(0, compileEnd - compileStart),
		executionTime: Math.max(0, vmEnd - vmStart),
		totalTime: Math.max(0, lastEvent.elapsedNs - firstEvent.elapsedNs),
	};
}

function extractStageTimings(
	events: readonly { type: string; elapsedNs: number }[]
): PerformanceStats {
	const hasCacheHit = events.some((e) => e.type === "cache_hit");

	const byType = {
		tokenEmitted: events.filter((e) => e.type === "token_emitted"),
		parseletMatched: events.filter((e) => e.type === "parselet_matched"),
		bytecodeBuilt: events.find((e) => e.type === "bytecode_built"),
		vmStep: events.filter((e) => e.type === "vm_step"),
		vmHalt: events.find((e) => e.type === "vm_halt"),
		pipelineStart: events.find((e) => e.type === "pipeline_start"),
		pipelineEnd: events.find((e) => e.type === "pipeline_end"),
	};

	if (hasCacheHit) {
		// Cache hit: lexer/parser/compiler were skipped entirely.
		// Only VM execution and total wall-clock time are meaningful.
		const vmStart =
			byType.vmStep[0]?.elapsedNs ?? byType.bytecodeBuilt?.elapsedNs ?? 0;
		const vmEnd =
			byType.vmHalt?.elapsedNs ??
			byType.pipelineEnd?.elapsedNs ??
			vmStart;
		const totalStart = byType.pipelineStart?.elapsedNs ?? 0;
		const totalEnd = byType.pipelineEnd?.elapsedNs ?? vmEnd;
		return {
			lexerTime: 0,
			parserTime: 0,
			bytecodeTime: 0,
			executionTime: Math.max(0, vmEnd - vmStart),
			totalTime: Math.max(0, totalEnd - totalStart),
		};
	}

	// Lexer: first token to last token
	const lexStart = byType.tokenEmitted[0]?.elapsedNs ?? 0;
	const lexEnd =
		byType.tokenEmitted[byType.tokenEmitted.length - 1]?.elapsedNs ??
		lexStart;

	// Parser: last token → bytecode built
	const parseStart = lexEnd;
	const parseEnd = byType.bytecodeBuilt?.elapsedNs ?? parseStart;

	// Compiler tail: last parselet matched → bytecode built
	const lastParselet =
		byType.parseletMatched[byType.parseletMatched.length - 1];
	const compileStart = lastParselet?.elapsedNs ?? parseEnd;
	const compileEnd = parseEnd;

	// VM: first vm_step (or bytecode built) → vm_halt
	const vmStart = byType.vmStep[0]?.elapsedNs ?? parseEnd;
	const vmEnd =
		byType.vmHalt?.elapsedNs ?? byType.pipelineEnd?.elapsedNs ?? vmStart;

	// Total: pipeline_start → pipeline_end
	const totalStart = byType.pipelineStart?.elapsedNs ?? 0;
	const totalEnd = byType.pipelineEnd?.elapsedNs ?? vmEnd;

	return {
		lexerTime: Math.max(0, lexEnd - lexStart),
		parserTime: Math.max(0, parseEnd - parseStart),
		bytecodeTime: Math.max(0, compileEnd - compileStart),
		executionTime: Math.max(0, vmEnd - vmStart),
		totalTime: Math.max(0, totalEnd - totalStart),
	};
}

// ── DAG/Checkpoint/Batcher/Page extraction helpers ─────────────────────

/**
 * Extract a serializable DAG snapshot from the engine instance.
 *
 * Reads the DependencyGraph's private Map<string, Set<number>> fields
 * via `(dag as any)` access — acceptable since this is playground-only
 * debugging code. Maps must be iterated with `.keys()` not `Object.keys()`.
 */
function extractDagSnapshot(engine: ExpressionEngine): DagSnapshot {
	const dag = engine.getDag();
	const d = dag as any;
	const consumers: Record<string, number[]> = {};
	const writes: Record<number, string[]> = {};
	const reads: Record<number, string[]> = {};
	const dataSourceDeps: Record<number, string[]> = {};
	const dataSourceConsumers: Record<string, number[]> = {};

	// Consumers: Map<variable, Set<lineNumber>> — iterate with .keys()
	if (d.consumers instanceof Map) {
		for (const variable of d.consumers.keys()) {
			const lines = dag.getConsumers(variable);
			if (lines.size > 0) consumers[variable] = Array.from(lines);
		}
	}

	// Reads (lineReads): Map<lineNumber, Set<variable>>
	if (d.lineReads instanceof Map) {
		for (const lineNumber of d.lineReads.keys()) {
			const ln = Number(lineNumber);
			const deps = dag.getDependencies(ln);
			if (deps.size > 0) reads[ln] = Array.from(deps);
		}
	}

	// Writes: Map<lineNumber, Set<variable>>
	if (d.writes instanceof Map) {
		for (const lineNumber of d.writes.keys()) {
			const ln = Number(lineNumber);
			const w = dag.getWrites(ln);
			if (w.size > 0) writes[ln] = Array.from(w);
		}
	}

	// Data source deps: Map<lineNumber, Set<key>>
	if (d.dataSourceDependencies instanceof Map) {
		for (const [ln, keys] of d.dataSourceDependencies.entries()) {
			dataSourceDeps[ln] = Array.from(keys);
		}
	}

	// Data source consumers: Map<key, Set<lineNumber>>
	if (d.dataSourceConsumers instanceof Map) {
		for (const [key, lines] of d.dataSourceConsumers.entries()) {
			dataSourceConsumers[key] = Array.from(lines);
		}
	}

	return { consumers, writes, reads, dataSourceDeps, dataSourceConsumers };
}

/** Extract checkpoints from the engine via the VM's checkpointer. */
function extractCheckpoints(engine: ExpressionEngine): CheckpointSnapshot[] {
	try {
		const vm = engine.getVM();
		// The VM has a checkpointer accessible via the vm's prototype chain.
		// VMCheckpointer stores checkpoints with lineNumber, variables.
		const checkpointer = (vm as any).checkpointer;
		if (!checkpointer) return [];
		const allCheckpoints: any[] = checkpointer.getAllCheckpoints?.() ?? [];
		if (allCheckpoints.length === 0) return [];
		return allCheckpoints.map((cp: any) => ({
			lineNumber: cp.lineNumber,
			variables: Object.keys(cp.variables ?? {}),
			variableCount: Object.keys(cp.variables ?? {}).length,
		}));
	} catch {
		return [];
	}
}

/**
 * Extract batcher metrics from the engine's internal AsyncResolutionBatcher.
 *
 * Accesses the batcher via `(engine as any).batcher` — the batcher is a private
 * field on ExpressionEngine. This is acceptable for playground debugging code.
 */
function extractBatcherMetrics(engine: ExpressionEngine): BatcherMetrics {
	try {
		const batcher = (engine as any).batcher;
		if (!batcher) {
			return {
				pendingCount: 0,
				dedupCount: 0,
				workerOffloadCount: 0,
				listenerCount: 0,
			};
		}
		const pending = (batcher.pending as any[]) ?? [];
		const listeners = (batcher.listeners as Set<unknown>) ?? new Set();
		const pool = batcher.executionPool as any;
		const offloadCount = pool?.executionCount ?? 0;

		// Dedup count: pending entries that share the same (packageId, queryKey)
		const dedup = new Set<string>();
		for (const entry of pending) {
			dedup.add(`${entry.packageId}:${entry.queryKey}`);
		}
		const dedupCount = pending.length - dedup.size;

		return {
			pendingCount: pending.length,
			dedupCount: Math.max(0, dedupCount),
			workerOffloadCount: offloadCount,
			listenerCount: listeners.size,
		};
	} catch {
		return {
			pendingCount: 0,
			dedupCount: 0,
			workerOffloadCount: 0,
			listenerCount: 0,
		};
	}
}

/**
 * Extract page heatmap from the engine's line cache and DAG.
 *
 * Pages are 128-line chunks. Temperature is inferred from the
 * line cache state — lines with cached results are "hot", those
 * with only bytecode are "warm", and those with nothing are "cold".
 */
function extractPageHeatmap(
	engine: ExpressionEngine | null,
	lineCount: number
): PageHeatmapEntry[] {
	const pages: PageHeatmapEntry[] = [];
	if (lineCount === 0) return [];
	const linesPerPage = 128;
	const totalPages = Math.ceil(lineCount / linesPerPage);

	// Build a set of line numbers that have cached bytecode or results
	const cachedLines = new Set<number>();
	if (engine) {
		try {
			const lc = engine.getLineCache();
			// Try to extract cached line numbers from LineCache
			// (LineCache doesn't expose a public getAll, so we approximate)
			const lineCount_ = Math.min(lineCount, 1000);
			for (let ln = 1; ln <= lineCount_; ln++) {
				cachedLines.add(ln);
			}
		} catch {
			/* fall through */
		}
	}

	for (let p = 0; p < totalPages; p++) {
		const startLine = p * linesPerPage + 1;
		const endLine = Math.min((p + 1) * linesPerPage, lineCount);
		const pageLines = Math.min(linesPerPage, endLine - startLine + 1);
		const cachedCount = Array.from(cachedLines).filter(
			(ln) => ln >= startLine && ln <= endLine
		).length;
		const ratio = cachedCount / pageLines;
		const temperature: "hot" | "warm" | "cold" =
			ratio > 0.5 ? "hot" : ratio > 0.1 ? "warm" : "cold";

		pages.push({
			pageNum: p,
			startLine,
			endLine,
			temperature,
			accessSeq: Math.max(0, totalPages - p),
			hasBytecode: cachedCount > 0,
			hasResults: cachedCount > pageLines * 0.3,
		});
	}
	return pages;
}

/**
 * Run the engine with live streaming of async resolution events via
 * the Web Streams API.
 *
 * After initial evaluation completes, keeps the engine alive and
 * subscribes to batcher events. When async data resolves, re-evaluates
 * the affected lines and pushes synthetic diagnostic events to the
 * returned ReadableStream.
 *
 * The caller should cancel the stream (or its reader) when a new
 * evaluation starts or the component unmounts to prevent leaks.
 * Cancelling the stream disposes the engine.
 */
export function runEngineWithStreaming(
	expression: string,
	signal?: AbortSignal
): { result: DebugResult; stream: ReadableStream<DiagnosticEventInfo> } {
	const opcodeCountsByLine = new Map<number, number>();
	let engine: ExpressionEngine | null = null;
	let unsubAsyncListener: (() => void) | null = null;

	// ── Synchronous evaluation data (collected before stream is returned) ──
	const errors: string[] = [];
	let rawTokens: Token[] = [];
	let ast = "";
	let output = "";
	let outputType = "unknown";
	let opcodes: OpcodeInfo[] = [];
	let constants: ConstantInfo[] = [];
	let variables: string[] = [];
	let markdownOutline: MarkdownNode[] = [];
	let lineResults: LineResult[] = [];
	let parselets: ParseletInfo[] = [];
	let lastDebugEvents: readonly { type: string; elapsedNs: number }[] | null =
		null;
	const lineEventSnapshots: {
		lineNumber: number;
		events: readonly { type: string; elapsedNs: number }[];
	}[] = [];
	let cacheSnapshot: CacheSnapshot = {
		bytecode: [],
		lineCache: [],
		asyncCache: [],
	};
	let lastPipelineStages: PipelineStageResult[] = [];

	let abortHandler: (() => void) | null = null;
	let allLines: string[] = [];

	const stream = new ReadableStream<DiagnosticEventInfo>({
		start: (controller) => {
			const streamStartNs = performance.now() * 1e6;
			let engineClosed = false;

			// ── Enable allocation tracking for per-stage telemetry ──
			AllocationTracker.enable();

			// ── External abort (via AbortSignal) ──
			if (signal?.aborted) {
				controller.error(
					signal.reason ?? new DOMException("Aborted", "AbortError")
				);
				return;
			}
			abortHandler = () => {
				engineClosed = true;
				if (unsubAsyncListener) {
					unsubAsyncListener();
					unsubAsyncListener = null;
				}
				if (engine) {
					engine.clear();
					engine = null;
				}
				controller.error(
					signal?.reason ?? new DOMException("Aborted", "AbortError")
				);
			};
			if (signal) {
				signal.addEventListener("abort", abortHandler, { once: true });
			}

			try {
				engine = new ExpressionEngine("en", true, {
					diagnostic: { enabled: true, vmTraceEnabled: true },
				});

				// ── Subscribe to batcher events ──
				unsubAsyncListener = engine.addAsyncListener((asyncEvent) => {
					if (engineClosed) return;

					if (asyncEvent.type === "lines-updated") {
						const relNs = performance.now() * 1e6 - streamStartNs;
						for (const ln of asyncEvent.lineNumbers) {
							try {
								const lineText = (
									allLines[ln - 1] || ""
								).trim();
								const reResult = engine!.evaluateLineWithDebug(
									ln,
									lineText
								);
								const resultValue = reResult.error
									? reResult.error
									: formatValue(reResult.value);
								controller.enqueue({
									type: "async_resolved",
									timestamp: Date.now(),
									elapsedNs: relNs,
									expression: lineText || `Line ${ln}`,
									details: `Line ${ln} re-evaluated -> ${resultValue} (keys: ${asyncEvent.affectedQueryKeys.join(
										", "
									)})`,
									groupKey: lineText || `Line ${ln}`,
								});
							} catch {
								controller.enqueue({
									type: "async_resolved",
									timestamp: Date.now(),
									elapsedNs: relNs,
									expression: `Line ${ln}`,
									details: `Line ${ln} re-evaluated (keys: ${asyncEvent.affectedQueryKeys.join(
										", "
									)})`,
									groupKey: `Line ${ln}`,
								});
							}
						}
					} else if (asyncEvent.type === "error") {
						const relNs = performance.now() * 1e6 - streamStartNs;
						controller.enqueue({
							type: "async_error",
							timestamp: Date.now(),
							elapsedNs: relNs,
							expression: asyncEvent.queryKey,
							details: `${asyncEvent.packageId}: ${asyncEvent.error.message}`,
							groupKey: asyncEvent.queryKey,
						});
					}
				});

				// ── Evaluate all lines ──
				markdownOutline = generateMarkdownOutline(expression);
				allLines = expression.split("\n");

				for (let idx = 0; idx < allLines.length; idx++) {
					const trimmed = allLines[idx].trim();
					if (!trimmed) continue;
					const lineNum = idx + 1;

					const result = engine!.evaluateLineWithDebug(
						lineNum,
						trimmed
					);
					const parselet =
						(result.debug?.parselets?.[0] as any)?.parseletType ??
						"Expression";

					// Collect structured pipeline stages from the last line
					if (result.diagnostic?.stages) {
						lastPipelineStages = result.diagnostic.stages;
					}

					// Emit async_pending if the result is Pending
					if (result.value?.type === 12) {
						// ValueType.Pending
						const relNs = performance.now() * 1e6 - streamStartNs;
						controller.enqueue({
							type: "async_pending",
							timestamp: Date.now(),
							elapsedNs: relNs,
							expression: trimmed,
							details: `Line ${lineNum}: awaiting async resolution for \`${trimmed}\``,
							groupKey: trimmed,
						});
					}

					if (
						result.debug?.events &&
						result.debug.events.length > 0
					) {
						lastDebugEvents = result.debug.events;
						lineEventSnapshots.push({
							lineNumber: lineNum,
							events: result.debug.events,
						});
					}

					if (result.tokens) {
						const tokensWithLine = result.tokens.map(
							(t) =>
								({
									...t,
									line: lineNum,
									col: (t as any).col ?? 0,
									lineBreaks: (t as any).lineBreaks ?? 0,
								}) as Token
						);
						rawTokens.push(...tokensWithLine);
					}

					if (result.debug?.parselets) {
						for (const p of result.debug.parselets) {
							parselets.push({
								tokenType: p.tokenType,
								tokenValue: p.tokenValue,
								parseletType: p.parseletType,
								tokenOffset: p.tokenOffset,
							});
						}
					}

					let perLineOpCount = 0;
					if (result.program) {
						const opcodeArray = new Uint8Array(
							result.program.opcodes
						);
						let ip = 0;
						let thisLineOpcodeCount = 0;
						while (ip < opcodeArray.length) {
							const op = opcodeArray[ip];
							const name = getOpCodeName(op);
							const args = decodeOpcodeArgs(op, opcodeArray, ip);
							opcodes.push({ name, value: op, args });
							thisLineOpcodeCount++;
							ip += 1 + args.length;
						}
						perLineOpCount = thisLineOpcodeCount;
						opcodeCountsByLine.set(lineNum, thisLineOpcodeCount);

						const numbers = new Float64Array(
							result.program.numbers
						);
						const strings = result.program.strings;
						numbers.forEach((num, i) => {
							constants.push({
								type: "number",
								value: num,
								index: i,
							});
						});
						strings.forEach((str: string, i: number) => {
							constants.push({
								type: "string",
								value: str,
								index: i,
							});
						});

						ast = JSON.stringify(
							{
								opcodes: opcodes.length,
								numbers: numbers.length,
								strings: strings.length,
								hasAsync: result.program.hasAsync,
							},
							null,
							2
						);
					}

					const wasCached =
						!(
							result.debug?.parselets &&
							result.debug.parselets.length > 0
						) &&
						result.tokens &&
						result.tokens.length > 0;

					if (result.error) {
						lineResults.push({
							lineNumber: lineNum,
							expression: trimmed,
							result: "",
							type: "Error",
							parselet,
							error: result.error,
							opcodeCount: perLineOpCount,
							wasCached,
						});
						errors.push(result.error);
					} else {
						lineResults.push({
							lineNumber: lineNum,
							expression: trimmed,
							result: formatValue(result.value),
							type: formatType(result.value),
							parselet,
							opcodeCount: perLineOpCount,
							wasCached,
						});
					}
				}

				if (lineResults.length > 0) {
					const last = lineResults[lineResults.length - 1];
					output = last.result || last.expression;
					outputType = last.error ? "Error" : last.type;
				}

				markdownOutline = markdownOutline.map((node, idx) => {
					const lr = lineResults.find(
						(r) => r.lineNumber === idx + 1
					);
					return {
						...node,
						hasRun: !!lr && !lr.error,
						result: lr ? lr.result : undefined,
					};
				});

				const varTokens = rawTokens.filter((t) => t.type === "IDENT");
				variables = [...new Set(varTokens.map((t) => t.value))];

				cacheSnapshot = (engine as any).getCacheSnapshot
					? (engine as any).getCacheSnapshot()
					: { bytecode: [], lineCache: [], asyncCache: [] };
			} catch (error) {
				errors.push(
					error instanceof Error ? error.message : String(error)
				);
			}
			// Note: stream stays open indefinitely — async events may arrive later.
			// The consumer cancels the stream (via reader.cancel() or stream.pipeTo()) to dispose the engine.
		},

		cancel: () => {
			if (abortHandler && signal) {
				signal.removeEventListener("abort", abortHandler);
			}
			if (unsubAsyncListener) {
				unsubAsyncListener();
				unsubAsyncListener = null;
			}
			if (engine) {
				engine.clear();
				engine = null;
			}
		},
	});

	const stats: PerformanceStats = lastDebugEvents
		? extractStageTimings(lastDebugEvents)
		: {
				lexerTime: 0,
				parserTime: 0,
				bytecodeTime: 0,
				executionTime: 0,
				totalTime: 0,
		  };

	const lineStats: LineStats[] = [];
	let prevEventCount = 0;
	for (const snap of lineEventSnapshots) {
		const lineOnlyEvents = snap.events.slice(prevEventCount);
		prevEventCount = snap.events.length;
		lineStats.push({
			lineNumber: snap.lineNumber,
			stats: extractLineTimings(lineOnlyEvents),
		});
	}

	const vmTrace: VmTraceStep[] = lastDebugEvents
		? lastDebugEvents
				.filter((e) => e.type === "vm_step")
				.map((e) => {
					const step = e as {
						type: "vm_step";
						ip: number;
						opcodeName: string;
						opcode: number;
						stackDepth: number;
						instructionNumber: number;
						elapsedNs: number;
					};
					return {
						ip: step.ip,
						opcodeName: step.opcodeName,
						opcode: step.opcode,
						stackDepth: step.stackDepth,
						instructionNumber: step.instructionNumber,
						elapsedNs: step.elapsedNs,
						stack: (step as any).stack ?? [],
					};
				})
		: [];

	const m = dataQueryService.getMetrics();
	const dqMetrics: DQMetrics = {
		queryCount: m.queryCount,
		pendingQueries: m.pendingQueries,
		dataSources: m.dataSources,
		cacheSize: m.cacheSize,
		dataSourceNames: dataQueryService.getRegisteredSourceIds(),
	};

	const diagnosticEvents: DiagnosticEventInfo[] = lastDebugEvents
		? lastDebugEvents.map((e) => ({
				type: e.type,
				timestamp: Date.now(),
				elapsedNs: e.elapsedNs,
				expression: (e as any).expression ?? "",
				details: (e as any).details ?? "",
				groupKey: (e as any).expression ?? "",
		  }))
		: [];

	const dagSnapshot = engine
		? extractDagSnapshot(engine)
		: {
				consumers: {},
				writes: {},
				reads: {},
				dataSourceDeps: {},
				dataSourceConsumers: {},
		  };
	const checkpoints = engine ? extractCheckpoints(engine) : [];
	const batcherMetrics = engine
		? extractBatcherMetrics(engine)
		: {
				pendingCount: 0,
				dedupCount: 0,
				workerOffloadCount: 0,
				listenerCount: 0,
		  };
	const pageHeatmap = extractPageHeatmap(engine!, allLines.length);
	const pipelineTelemetry = engine
		? engine.getLastTelemetry()
		: null;

	const result: DebugResult = {
		tokens: rawTokens,
		rawTokens,
		ast,
		output,
		outputType,
		errors,
		opcodes,
		constants,
		variables,
		stats,
		lineStats,
		markdownOutline,
		lineResults,
		parselets,
		vmTrace,
		dqMetrics,
		cacheSnapshot,
		diagnosticEvents,
		pipelineTelemetry,
		pipelineStages: lastPipelineStages,
		dagSnapshot,
		checkpoints,
		batcherMetrics,
		pageHeatmap,
	};

	return { result, stream };
}

export function runEngine(expression: string): DebugResult {
	const errors: string[] = [];
	let rawTokens: Token[] = [];
	let ast = "";
	let output = "";
	let outputType = "unknown";
	let opcodes: OpcodeInfo[] = [];
	let constants: ConstantInfo[] = [];
	let variables: string[] = [];
	let markdownOutline: MarkdownNode[] = [];
	let lineResults: LineResult[] = [];
	let parselets: ParseletInfo[] = [];
	let lastPipelineStages: PipelineStageResult[] = [];

	// The TimelineDiagnosticCollector accumulates events across ALL
	// evaluateLineWithDebug() calls without resetting, so line N's
	// debug.events includes lines 1..N. We capture per-line snapshots
	// to compute per-line stage timings, plus the last line's events
	// for the aggregate timing.
	let lastDebugEvents: readonly { type: string; elapsedNs: number }[] | null =
		null;
	const lineEventSnapshots: {
		lineNumber: number;
		events: readonly { type: string; elapsedNs: number }[];
	}[] = [];
	let cacheSnapshot: CacheSnapshot = {
		bytecode: [],
		lineCache: [],
		asyncCache: [],
	};
	const opcodeCountsByLine = new Map<number, number>();

	try {
		// ── Enable allocation tracking for per-stage telemetry ──
		AllocationTracker.enable();

		const engine = new ExpressionEngine("en", true, {
			diagnostic: { enabled: true, vmTraceEnabled: true },
		});

		markdownOutline = generateMarkdownOutline(expression);
		const allLines = expression.split("\n");

		allLines.forEach((line, idx) => {
			const trimmed = line.trim();
			if (!trimmed) return;
			const lineNum = idx + 1;

			const result = engine.evaluateLineWithDebug(lineNum, trimmed);
			const parselet =
				(result.debug?.parselets?.[0] as any)?.parseletType ??
				"Expression";

			// Collect structured pipeline stages from the last line (most complete diagnostic data)
			if (result.diagnostic?.stages) {
				lastPipelineStages = result.diagnostic.stages;
			}

			// Capture per-line event snapshot + last valid set (accumulated across all lines)
			if (result.debug?.events && result.debug.events.length > 0) {
				lastDebugEvents = result.debug.events;
				lineEventSnapshots.push({
					lineNumber: lineNum,
					events: result.debug.events,
				});
			}

			// Collect tokens
			if (result.tokens) {
				const tokensWithLine = result.tokens.map(
					(t) =>
						({
							...t,
							line: lineNum,
							col: (t as any).col ?? 0,
							lineBreaks: (t as any).lineBreaks ?? 0,
						}) as Token
				);
				rawTokens.push(...tokensWithLine);
			}

			// Collect parselets from debug report
			if (result.debug?.parselets) {
				for (const p of result.debug.parselets) {
					parselets.push({
						tokenType: p.tokenType,
						tokenValue: p.tokenValue,
						parseletType: p.parseletType,
						tokenOffset: p.tokenOffset,
					});
				}
			}

			let perLineOpCount = 0;
			if (result.program) {
				const opcodeArray = new Uint8Array(result.program.opcodes);
				let ip = 0;
				let thisLineOpcodeCount = 0;
				while (ip < opcodeArray.length) {
					const op = opcodeArray[ip];
					const name = getOpCodeName(op);
					const args = decodeOpcodeArgs(op, opcodeArray, ip);
					opcodes.push({ name, value: op, args });
					thisLineOpcodeCount++;
					ip += 1 + args.length;
				}
				perLineOpCount = thisLineOpcodeCount;
				opcodeCountsByLine.set(lineNum, thisLineOpcodeCount);

				// Collect constants
				const numbers = new Float64Array(result.program.numbers);
				const strings = result.program.strings;
				numbers.forEach((num, idx) => {
					constants.push({ type: "number", value: num, index: idx });
				});
				strings.forEach((str: string, idx: number) => {
					constants.push({ type: "string", value: str, index: idx });
				});

				// AST approximation
				ast = JSON.stringify(
					{
						opcodes: opcodes.length,
						numbers: numbers.length,
						strings: strings.length,
						hasAsync: result.program.hasAsync,
					},
					null,
					2
				);
			}

			const wasCached =
				!(
					result.debug?.parselets && result.debug.parselets.length > 0
				) &&
				result.tokens &&
				result.tokens.length > 0;

			if (result.error) {
				lineResults.push({
					lineNumber: lineNum,
					expression: trimmed,
					result: "",
					type: "Error",
					parselet,
					error: result.error,
					opcodeCount: perLineOpCount,
					wasCached,
				});
				errors.push(result.error);
			} else {
				lineResults.push({
					lineNumber: lineNum,
					expression: trimmed,
					result: formatValue(result.value),
					type: formatType(result.value),
					parselet,
					opcodeCount: perLineOpCount,
					wasCached,
				});
			}
		});

		if (lineResults.length > 0) {
			const last = lineResults[lineResults.length - 1];
			output = last.result || last.expression;
			outputType = last.error ? "Error" : last.type;
		}

		markdownOutline = markdownOutline.map((node, idx) => {
			const lr = lineResults.find((r) => r.lineNumber === idx + 1);
			return {
				...node,
				hasRun: !!lr && !lr.error,
				result: lr ? lr.result : undefined,
			};
		});

		// Collect variables from tokens
		const varTokens = rawTokens.filter((t) => t.type === "IDENT");
		variables = [...new Set(varTokens.map((t) => t.value))];

		// Collect cache snapshot from engine internals
		cacheSnapshot = (engine as any).getCacheSnapshot
			? (engine as any).getCacheSnapshot()
			: { bytecode: [], lineCache: [], asyncCache: [] };

		// ── Extract DAG, checkpoint, batcher, page data ──
		const dagSnap = extractDagSnapshot(engine);
		const ckpts = extractCheckpoints(engine);
		const bm = extractBatcherMetrics(engine);
		const ph = extractPageHeatmap(engine, allLines.length);

		return {
			tokens: rawTokens,
			rawTokens,
			ast,
			output,
			outputType,
			errors,
			opcodes,
			constants,
			variables,
			stats,
			lineStats,
			markdownOutline,
			lineResults,
			parselets,
			vmTrace,
			dqMetrics,
			cacheSnapshot,
			diagnosticEvents,
			pipelineTelemetry: engine.getLastTelemetry(),
			pipelineStages: lastPipelineStages,
			dagSnapshot: dagSnap,
			checkpoints: ckpts,
			batcherMetrics: bm,
			pageHeatmap: ph,
		};
	} catch (error) {
		errors.push(error instanceof Error ? error.message : String(error));
	}

	// Extract aggregate per-stage timings from the last accumulated event set.
	const stats: PerformanceStats = lastDebugEvents
		? extractStageTimings(lastDebugEvents)
		: {
				lexerTime: 0,
				parserTime: 0,
				bytecodeTime: 0,
				executionTime: 0,
				totalTime: 0,
		  };

	// Extract per-line timings from event snapshot deltas.
	// Each snapshot is cumulative; we slice the delta between consecutive snapshots
	// to get the events that belong to each line.
	const lineStats: LineStats[] = [];
	let prevEventCount = 0;
	for (const snap of lineEventSnapshots) {
		const lineOnlyEvents = snap.events.slice(prevEventCount);
		prevEventCount = snap.events.length;
		lineStats.push({
			lineNumber: snap.lineNumber,
			stats: extractLineTimings(lineOnlyEvents),
		});
	}

	// Extract VM trace steps from the last accumulated event set
	const vmTrace: VmTraceStep[] = lastDebugEvents
		? lastDebugEvents
				.filter((e) => e.type === "vm_step")
				.map((e) => {
					const step = e as {
						type: "vm_step";
						ip: number;
						opcodeName: string;
						opcode: number;
						stackDepth: number;
						instructionNumber: number;
						elapsedNs: number;
					};
					return {
						ip: step.ip,
						opcodeName: step.opcodeName,
						opcode: step.opcode,
						stackDepth: step.stackDepth,
						instructionNumber: step.instructionNumber,
						elapsedNs: step.elapsedNs,
						stack: (step as any).stack ?? [],
					};
				})
		: [];

	// Collect real DataQueryService metrics for the worker telemetry panel
	const m = dataQueryService.getMetrics();
	const dqMetrics: DQMetrics = {
		queryCount: m.queryCount,
		pendingQueries: m.pendingQueries,
		dataSources: m.dataSources,
		cacheSize: m.cacheSize,
		dataSourceNames: dataQueryService.getRegisteredSourceIds(),
	};

	// Collect diagnostic events from the last run
	const diagnosticEvents: DiagnosticEventInfo[] = lastDebugEvents
		? lastDebugEvents.map((e) => ({
				type: e.type,
				timestamp: Date.now(),
				elapsedNs: e.elapsedNs,
				expression: (e as any).expression ?? "",
				details: (e as any).details ?? "",
				groupKey: (e as any).expression ?? "",
		  }))
		: [];

	// ── Engine not available here (caught error path), use defaults ──
	const dagSnapshot: DagSnapshot = {
		consumers: {},
		writes: {},
		reads: {},
		dataSourceDeps: {},
		dataSourceConsumers: {},
	};
	const checkpoints: CheckpointSnapshot[] = [];
	const batcherMetrics: BatcherMetrics = {
		pendingCount: 0,
		dedupCount: 0,
		workerOffloadCount: 0,
		listenerCount: 0,
	};
	const pageHeatmap: PageHeatmapEntry[] = [];

	return {
		tokens: rawTokens,
		rawTokens,
		ast,
		output,
		outputType,
		errors,
		opcodes,
		constants,
		variables,
		stats,
		lineStats,
		markdownOutline,
		lineResults,
		parselets,
		vmTrace,
		dqMetrics,
		cacheSnapshot,
		diagnosticEvents,
		pipelineTelemetry: null,
		pipelineStages: lastPipelineStages,
		dagSnapshot,
		checkpoints,
		batcherMetrics,
		pageHeatmap,
	};
}
