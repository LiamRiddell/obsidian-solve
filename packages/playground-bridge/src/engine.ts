import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { DocumentModel } from "@solve-js/engine/DocumentModel";
import type { CacheSnapshot, BatcherMetrics, CheckpointSnapshot, BytecodeCacheEntry, LineCacheEntryInfo } from "@solve-js/engine/ExpressionEngine";
export type { CacheSnapshot, BatcherMetrics, CheckpointSnapshot, BytecodeCacheEntry, LineCacheEntryInfo };
import type { DagSnapshot } from "@solve-js/vm/DependencyGraph";
export type { DagSnapshot };
import type { Token } from "@solve-js/lexer/Token";
import type { AsyncResolutionEvent } from "@solve-js/engine/AsyncResolutionBatcher";
import { getOpCodeName, OpCode } from "@solve-js/parser/OpCode";
import type { DiagnosticPipelineResult, PipelineStageResult } from "@solve-js/types/DiagnosticPipelineResult";
import type { ParseletInfo } from "@solve-js/types/ParsingResult";
import { Value, ValueType, enableValueArena, disableValueArena } from "@solve-js/vm/Value";
import type { EngineError } from "@solve-js/errors/UnifiedErrorFramework";
import { AllocationTracker } from "@solve-js/telemetry/AllocationTracker";
import type { PipelineTelemetry } from "@solve-js/telemetry/AllocationTracker";
import { BUILTIN_PACKAGES, createStocksPackage, createKnowledgePackage } from "@solve-js/packages/builtins";
import { OSRS_PACKAGE } from "@solve-js-examples/osrs/OsrsPackage";

/**
 * OSRS is an example package (not a built-in) demonstrating the packages
 * framework — registered here so the playground demo keeps working.
 *
 * Stocks/Knowledge are opt-in, pluggable-provider packages (see their own
 * module docs) — registered here with NO fetchQuote/answerQuery configured
 * so the demo's "stock(AAPL)"/"<query> = ?" gallery examples actually parse
 * and evaluate to the real, honest "provider not configured" error, rather
 * than failing at parse time with an unrelated "unknown token" error
 * because the function/grammar was never registered at all.
 */
export const PLAYGROUND_PACKAGES = [...BUILTIN_PACKAGES, OSRS_PACKAGE, createStocksPackage(), createKnowledgePackage()];
export type { ParseletInfo, Token };
import {
	buildDocumentStats,
	buildLineStats,
	buildVmTrace,
	buildDiagnosticEvents,
	buildQueryCacheState,
	formatLineResultValue,
	isUnrecognizedBareWord,
} from "./engineShared.js";

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

	cacheSnapshot: CacheSnapshot;
	diagnosticEvents: DiagnosticEventInfo[];
	/** Structured pipeline stages from engine's DiagnosticPipelineResult (available in diagnostic mode) — last evaluated line only */
	pipelineStages: PipelineStageResult[];
	/** Structured pipeline stages per line number — lets the Pipeline tab show the real stages for whichever line is selected, not just the last one evaluated */
	pipelineStagesByLine: Record<number, PipelineStageResult[]>;
	/** DAG dependency graph snapshot */
	dagSnapshot: DagSnapshot;
	/** VM checkpoints snapshot */
	checkpoints: CheckpointSnapshot[];
	/** Batcher metrics for async resolution */
	batcherMetrics: BatcherMetrics;    /** Page heatmap entries */
    pageHeatmap: PageHeatmapEntry[];
    /** Allocation tracker pipeline telemetry (per-stage wall time + bytes). */
    pipelineTelemetry: PipelineTelemetry | null;
    /** ValueArena stats from bump-allocator (usage/capacity). */
    arenaStats: ArenaStats;	/** TanStack Query cache entries — per-query status, staleness, TTL. */
	queryCache: QueryCacheEntry[];
	/** QueryClient default configuration (staleTime, gcTime). */
	queryClientConfig: QueryClientConfig;
	/** Registered parselets from the engine's ParseletRegistry. */
    parseletRegistry?: {
        prefix: Array<{ tokenType: string; bindingPower: number; category?: string }>;
        infix: Array<{ tokenType: string; leftBindingPower: number; rightBindingPower: number; category?: string }>;
    };
}

/** TanStack Query cache entry for diagnostic rendering. */
export interface QueryCacheEntry {
	queryKey: string;
	/** Raw query key array (e.g. ['osrs', 'item', '1267']) for expanded detail view. */
	queryKeyArray: string[];
	status: 'fresh' | 'stale' | 'fetching' | 'error';
	dataType: string;
	updatedAt: number;
	staleTime: number;
	cacheTime: number;
	/** Short string preview of the cached data payload. */
	dataPreview: string;
}

/** QueryClient default configuration surfaced for diagnostics. */
export interface QueryClientConfig {
	staleTime: number;
	gcTime: number;
}

// ── Arena Stats ───────────────────────────────────────────────────────────
export interface ArenaStats {
  /** Whether the arena was active during evaluation */
  enabled: boolean;
  /** Number of Values currently allocated from arena */
  usage: number;
  /** Total pre-allocated capacity of the arena */
  capacity: number;
}

export interface LineResult {
	lineNumber: number;
	expression: string;
	result: string;
	type: string;
	parselet: string;
	/** Category -> count of every parselet this line's own parse matched (e.g. {arithmetic: 2, conditionals: 1}) — not just the first one `parselet` names. Empty on a cache hit (no new parse ran). */
	parseletCategories: Record<string, number>;
	error?: string;
	/**
	 * Structured error detail, additive alongside `error` (which stays a
	 * plain string for existing consumers) — sourced from the engine's
	 * `EngineError` when available (a thrown parse/execution failure via
	 * `evaluateLineWithDebug()`'s `engineError` field), or partially from a
	 * `ValueType.Error` Value's code (an async-resolution failure surfacing
	 * after the line already rendered — `errorValue()` only carries a
	 * code+message, not category/expected/found/suggestion, so those stay
	 * undefined for that path). All undefined when `error` itself is unset.
	 */
	errorCode?: string;
	errorCategory?: string;
	errorExpected?: string;
	errorFound?: string;
	errorSuggestion?: string;
	errorRecoverable?: boolean;
	opcodeCount: number;
	wasCached: boolean;
	/** Set when an async resolver timed out — the result is a 0-gp fallback, not real data. */
	timedOut?: boolean;
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
	/**
	 * Present on "async_resolved" events: the freshly re-evaluated line
	 * result, so the main thread can patch DiagnosticReportStore's
	 * lineResults (what the editor and Output tab actually render) instead
	 * of only logging a description string to the Stream tab. Without this,
	 * an async value (OSRS price, currency rate) resolves inside the
	 * worker's engine but the UI never learns about it — the line stays
	 * "Pending" forever even though the underlying fetch succeeded.
	 */
	lineUpdate?: {
		lineNumber: number;
		result: string;
		type: string;
		timedOut?: boolean;
		/**
		 * The line's fresh pipeline stages from the re-evaluation that
		 * resolved this async value — without this, the Pipeline tab kept
		 * showing the original "pending" Async Preflight/VM Execute stages
		 * for this line forever, even after the real value arrived, because
		 * only `lineResults` (the Output tab) was patched, never the
		 * per-line stage data the Pipeline tab reads.
		 */
		stages?: PipelineStageResult[];
	} & Partial<ErrorFields>;
	/**
	 * Present on "async_resolved" events: a fresh cache/query-cache snapshot
	 * taken AFTER the resolving re-evaluation. `lineUpdate` above only
	 * refreshes the editor's displayed value — the Cache tab's Async
	 * Resolver Cache and Query Cache (TanStack) panels read `cacheSnapshot`/
	 * `queryCache` off the diagnostic report, which is otherwise only ever
	 * populated once from the INITIAL synchronous `result` (still showing
	 * "fetching" / in-flight, since that snapshot was taken before the async
	 * data resolved) and never refreshed again for the lifetime of the
	 * streaming session.
	 */
	cacheUpdate?: {
		cacheSnapshot: CacheSnapshot;
		queryCache: QueryCacheEntry[];
	};
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

// ── LRU line access tracking for page heatmap ──────────────────────────
/** Records the last evaluation sequence number for each line. Persists across evaluations for LRU tracking. */
const lineAccessSeq = new Map<number, number>();
/** Incrementing counter for access sequence numbers. */
let nextAccessSeq = 0;



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

// Built once — formatType() runs once per evaluated line, per evaluation
// pass, so rebuilding this object on every call was a real, avoidable
// allocation on a per-keystroke (debounced) path.
const VALUE_TYPE_NAMES: Record<number, string> = {
	[ValueType.Number]: "Number",
	[ValueType.Hex]: "Hex",
	[ValueType.BigInt]: "BigInt",
	[ValueType.String]: "String",
	[ValueType.Datetime]: "Datetime",
	[ValueType.Percentage]: "Percentage",
	[ValueType.Uom]: "Uom",
	[ValueType.Matrix]: "Matrix",
	[ValueType.Range]: "Range",
	[ValueType.Symbolic]: "Symbolic",
	[ValueType.Boolean]: "Boolean",
	[ValueType.Unit]: "Unit",
	[ValueType.Pending]: "Pending",
	[ValueType.Error]: "Error",
};

function formatType(val: Value): string {
	const t = VALUE_TYPE_NAMES[val.type] ?? "Value";
	return val.unit ? `${t} (${val.unit})` : t;
}

/** The structured-error subset of {@link LineResult} — see that field's own doc comment. */
type ErrorFields = Pick<
	LineResult,
	"error" | "errorCode" | "errorCategory" | "errorExpected" | "errorFound" | "errorSuggestion" | "errorRecoverable"
>;

/**
 * Build the structured-error fields for a `LineResult` from whichever error
 * source is actually available. `engineError` (the real `EngineError` a
 * throw carried) wins when present — it has the full picture. Falling back
 * to the plain `error` string, or to a `ValueType.Error` Value's code, keeps
 * every existing call site working even though those two carry less detail.
 *
 * The `softErrorValue` fallback matters on its own: a VM-level soft error
 * (e.g. `errorValue("INCOMPATIBLE_UNITS", ...)` from an ADD/SUB between two
 * currencies with no fetched rate, or `CURRENCY_RATE_UNAVAILABLE` from
 * UOM_CONVERT_TO/_IN) returns normally as the line's final Value — it never
 * throws, so `error`/`engineError` are both unset for it. Without this
 * fallback such a line looked like a successful result and displayed the
 * raw error CODE via `formatValue()`'s fallback (e.g.
 * "= CURRENCY_RATE_UNAVAILABLE") instead of getting real error styling.
 */
function buildErrorFields(
	error: string | undefined,
	engineError: EngineError | undefined,
	softErrorValue: Value | undefined,
): ErrorFields | undefined {
	if (engineError) {
		return {
			error: engineError.message,
			errorCode: engineError.code,
			errorCategory: engineError.category,
			errorExpected: engineError.expected,
			errorFound: engineError.found,
			errorSuggestion: engineError.suggestion,
			errorRecoverable: engineError.recoverable,
		};
	}
	if (error !== undefined) {
		return { error };
	}
	if (softErrorValue && softErrorValue.type === ValueType.Error) {
		return {
			error: softErrorValue.unit ?? String(softErrorValue.value),
			errorCode: typeof softErrorValue.value === "string" ? softErrorValue.value : undefined,
		};
	}
	return undefined;
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
 * Opcodes that carry a single operand (index into numbers/strings/variables):
 *   PUSH_NUMBER(10), PUSH_BIGINT(11), PUSH_HEX(12),
 *   PUSH_STRING(13), PUSH_BOOLEAN(14), PUSH_VARIABLE(15)
 *   LOAD_VAR(60), STORE_VAR(61), LOAD_GLOBAL_VAR(62), STORE_GLOBAL_VAR(63)
 *   DEFINE_USER_FUNCTION(150) — index into bytecode.userFunctionBodies
 *
 * Opcodes that carry TWO operands —
 * see VM.ts's CALL_PLUGIN/CALL_BUILTIN/CALL_USER_FUNCTION handlers, which
 * read `opcodes[ip++]` twice before popping args off the stack:
 *   CALL_PLUGIN(50), CALL_BUILTIN(51) — (registry index, arg count)
 *   CALL_USER_FUNCTION(151) — (name index, arg count)
 *   MAT_NEW(152) — (rows, cols)
 *
 * Opcodes that carry THREE operands — see VM.ts's MAP_INVOKE/REDUCE_INVOKE
 * handlers:
 *   MAP_INVOKE(157) — (kind, ref, collectionCount)
 *   REDUCE_INVOKE(158) — (kind, ref, hasInitial)
 *
 * All other opcodes (arithmetic, comparison, stack ops, MAT_INDEX1/2, etc.)
 * have zero operands — every argument is already on the value stack.
 */
export function decodeOpcodeArgs(
	op: number,
	opcodeArray: Uint8Array,
	ip: number
): number[] {
	if (op === OpCode.MAP_INVOKE || op === OpCode.REDUCE_INVOKE) {
		const args: number[] = [];
		if (ip + 1 < opcodeArray.length) args.push(opcodeArray[ip + 1]);
		if (ip + 2 < opcodeArray.length) args.push(opcodeArray[ip + 2]);
		if (ip + 3 < opcodeArray.length) args.push(opcodeArray[ip + 3]);
		return args;
	}
	if (op === OpCode.CALL_PLUGIN || op === OpCode.CALL_BUILTIN || op === OpCode.CALL_USER_FUNCTION || op === OpCode.MAT_NEW) {
		const args: number[] = [];
		if (ip + 1 < opcodeArray.length) args.push(opcodeArray[ip + 1]);
		if (ip + 2 < opcodeArray.length) args.push(opcodeArray[ip + 2]);
		return args;
	}
	// Opcodes that take exactly 1 operand (an index)
	const hasOperand =
		(op >= OpCode.PUSH_NUMBER && op <= OpCode.PUSH_VARIABLE) ||
		(op >= OpCode.LOAD_VAR && op <= OpCode.STORE_GLOBAL_VAR) ||
		op === OpCode.DEFINE_USER_FUNCTION;
	if (hasOperand && ip + 1 < opcodeArray.length) {
		return [opcodeArray[ip + 1]];
	}
	return [];
}


// ── Line classification helper ──────────────────────────────────────────

/**
 * Determine whether a line of markdown text should be evaluated as an expression.
 *
 * Uses the engine's lexer to classify the line (headings, blockquotes, code
 * fences, comments, horizontal rules, tables, wikilinks are all skipped).
 * Additionally, skips pure-prose lines that contain no expression indicators
 * (digits, operators, equals, colon, currency, backticks) UNLESS the line's
 * own normalized token stream proves it's real, registered vocabulary
 * anyway (see the second check below) — this is what makes all-word
 * expressions like "weather in Tokyo" or "average of 2, 4, 6" evaluate
 * correctly instead of being silently treated as prose just because they
 * contain no digit or symbol.
 *
 * Lines with inline solve markers (`s`...``) are always evaluated.
 */
function shouldEvaluateLine(engine: ExpressionEngine, text: string): boolean {
	// Use the engine's lexer for markdown structure classification.
	const classification = engine.getLexer().classifyLine(text);
	if (classification.skip) return false;

	// Inline solves always evaluate — they contain explicit expression markers.
	if (classification.hasInlineSolve) return true;

	// Prose gating: a multi-word line without digits, operators, currency,
	// equals, colon, or backticks LOOKS like prose (e.g. "Hello my name is
	// dave") — but that's only a cheap first guess, not proof. Confirm it
	// with the real lexer/normalizer before rejecting: any word tokenizes
	// as the generic IDENT fallback if nothing more specific claims it, but
	// a genuinely registered keyword or fused multi-word phrase (weather
	// in <city>, time in <city>, average of X Y Z, if/then/else, ...)
	// normalizes to its OWN specific token type instead. Only bail out as
	// prose when even that check finds nothing recognized — this is what
	// lets all-word expressions with no digit/symbol evaluate correctly
	// instead of being silently dropped before ever reaching the engine.
	if (!/[0-9+\-*/^%=<>!&|~(){}\[\],;?#`$£€:\\]/.test(text) && text.includes(' ')) {
		const tokens = engine.tokenizeForClassification(text).filter(
			(t) => t.type !== "WS" && t.type !== "NEWLINE"
		);
		const firstType = tokens[0]?.type;
		if (!firstType || firstType === "IDENT") return false;
	}

	return true;
}

// ── Page heatmap extraction helper ──────────────────────────────────────

/**
 * Extract page heatmap from the diagnostic cache snapshot.
 *
 * Pages are 128-line chunks. Temperature is inferred from the
 * line cache entries — lines with cached results are "hot", those
 * with only bytecode are "warm", and those with nothing are "cold".
 *
 * accessSeq is calculated from the module-level `lineAccessSeq` map,
 * which records real LRU access order as lines are evaluated.
 * Higher accessSeq = more recently accessed.
 */
function extractPageHeatmap(
	cacheSnapshot: CacheSnapshot,
	lineCount: number
): PageHeatmapEntry[] {
	const pages: PageHeatmapEntry[] = [];
	if (lineCount === 0) return [];
	const linesPerPage = 128;
	const totalPages = Math.ceil(lineCount / linesPerPage);

	// Build a set of line numbers from the cache snapshot's lineCache entries
	const cachedLines = new Set<number>();
	for (const entry of cacheSnapshot.lineCache) {
		cachedLines.add(entry.lineNumber);
	}

	// Compute global max accessSeq for normalization
	let maxSeq = 0;
	for (const seq of lineAccessSeq.values()) {
		if (seq > maxSeq) maxSeq = seq;
	}

	for (let p = 0; p < totalPages; p++) {
		const startLine = p * linesPerPage + 1;
		const endLine = Math.min((p + 1) * linesPerPage, lineCount);
		const pageLines = Math.min(linesPerPage, endLine - startLine + 1);
		// Direct membership check per line, mirroring the pageMaxSeq loop just
		// below — avoids reallocating the whole cachedLines set into an array
		// (and re-filtering it) once per page.
		let cachedCount = 0;
		for (let ln = startLine; ln <= endLine; ln++) {
			if (cachedLines.has(ln)) cachedCount++;
		}
		const ratio = cachedCount / pageLines;
		const temperature: "hot" | "warm" | "cold" =
			ratio > 0.5 ? "hot" : ratio > 0.1 ? "warm" : "cold";

		// Compute LRU-based accessSeq: the most recent access sequence number
		// among lines in this page. Higher = more recently accessed.
		let pageMaxSeq = 0;
		for (let ln = startLine; ln <= endLine; ln++) {
			const seq = lineAccessSeq.get(ln);
			if (seq !== undefined && seq > pageMaxSeq) pageMaxSeq = seq;
		}
		// Normalize to 0..100 scale for consistent UI rendering
		const accessSeq = maxSeq > 0 ? Math.round((pageMaxSeq / maxSeq) * 100) : 0;

		pages.push({
			pageNum: p,
			startLine,
			endLine,
			temperature,
			accessSeq,
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
): {
	result: DebugResult;
	stream: ReadableStream<DiagnosticEventInfo>;
} {
	const opcodeCountsByLine = new Map<number, number>();
	let engine: ExpressionEngine | null = null;
	/** AbortController for the pipeThrough/pipeTo pipeline. Aborted to cancel the stream. */
	let pipeAbortController: AbortController | null = null;

	// ── Enable Value Arena for zero-allocation Value reuse ──
	const arena = enableValueArena(512);

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
	const pipelineStagesByLine: Record<number, PipelineStageResult[]> = {};
	let lastDiagnostic: DiagnosticPipelineResult | undefined;

	let abortHandler: (() => void) | null = null;
	let allLines: string[] = [];

	const stream = new ReadableStream<DiagnosticEventInfo>({
		start: (controller) => {
		const streamStartNs = performance.now() * 1e6;

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
			// Abort the pipeThrough/pipeTo pipeline
			if (pipeAbortController) {
				pipeAbortController.abort();
				pipeAbortController = null;
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
				}, undefined, PLAYGROUND_PACKAGES);
				// Cross-line data access (packages/lines: prev, line<N>, sum/
				// total/average ranges, total above) needs a DocumentModel
				// wired in — see runEngine()'s matching fix above for the
				// full reasoning. Declared here (not just inside the "Evaluate
				// all lines" block below) so the async-resolution
				// re-evaluation path (the "lines-updated" transform a few
				// lines down) can also update it.
				const streamDocumentModel = new DocumentModel();
				streamDocumentModel.setDocument(expression);
				engine.setDocumentModel(streamDocumentModel);
				// ── Pipe batcher events through a TransformStream to convert
				// AsyncResolutionEvent → DiagnosticEventInfo, eliminating the
				// manual async IIFE reader loop. The pipeline uses Web Streams
				// API pipeThrough/pipeTo for backpressure, cancellation, and
				// proper resource cleanup.
				const eng = engine;
				pipeAbortController = new AbortController();

				// TransformStream: AsyncResolutionEvent → DiagnosticEventInfo
				const asyncToDiagnostic: TransformStream<AsyncResolutionEvent, DiagnosticEventInfo> = new TransformStream({
				transform(asyncEvent, transformController) {
					if (asyncEvent.type === "lines-updated") {
						const relNs = performance.now() * 1e6 - streamStartNs;
						for (const ln of asyncEvent.lineNumbers) {
							try {
								const lineText = (
									allLines[ln - 1] || ""
								).trim();
								lineAccessSeq.set(ln, ++nextAccessSeq);
								const reResult = eng.evaluateLineWithDebug(
									ln,
									lineText
								);
								const reLineState = streamDocumentModel.getLineAt(ln);
								if (reLineState) reLineState.result = reResult.value;
								const reErrorFields = buildErrorFields(reResult.error, reResult.engineError, reResult.value);
								const resultValue = reErrorFields
									? reErrorFields.error!
									: formatLineResultValue(reResult.value);
								// Re-read the query cache from the (still-alive) engine and
								// take the fresh cacheSnapshot off this re-evaluation's own
								// diagnostic result — both now reflect the just-resolved
								// data, unlike the closure-level `cacheSnapshot`/`queryCache`
								// captured once before this async value existed.
								const { queryCache: freshQueryCache } = buildQueryCacheState(eng);
								const freshCacheSnapshot = reResult.diagnostic?.cacheSnapshot ?? cacheSnapshot;
								transformController.enqueue({
									type: "async_resolved",
									timestamp: Date.now(),
									elapsedNs: relNs,
									expression: lineText || `Line ${ln}`,
									details: `Line ${ln} re-evaluated -> ${resultValue} (keys: ${asyncEvent.affectedQueryKeys.join(
										", "
									)})`,
									groupKey: lineText || `Line ${ln}`,
									// Carry the fresh value back so the main thread can
									// patch dr.lineResults — without this, an async
									// resolution updates the worker's own engine state
									// but the UI (which only saw the initial Pending
									// value) never learns about it and stays stuck.
									// Always populated now, even on failure (previously
									// `undefined` when the re-evaluation itself errored —
									// the line stayed stuck showing "Pending" forever
									// instead of surfacing the real failure).
									lineUpdate: {
										lineNumber: ln,
										result: reErrorFields ? "" : resultValue,
										type: reErrorFields ? "Error" : formatType(reResult.value),
										timedOut: (reResult.value as any).timedOut ?? false,
										stages: reResult.diagnostic?.stages,
										...reErrorFields,
									},
									// See DiagnosticEventInfo.cacheUpdate — without this the
									// Cache tab's Async Resolver Cache / Query Cache panels
									// stay frozen showing "fetching" / in-flight forever.
									cacheUpdate: {
										cacheSnapshot: freshCacheSnapshot,
										queryCache: freshQueryCache,
									},
								});
								// Also update the closure-level map/snapshot so the initial
								// synchronous result (if read again) and any later logic
								// sees the fresh stages and cache state.
								if (reResult.diagnostic) {
									pipelineStagesByLine[ln] = reResult.diagnostic.stages;
									cacheSnapshot = freshCacheSnapshot;
								}
							} catch {
								transformController.enqueue({
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
						transformController.enqueue({
							type: "async_error",
							timestamp: Date.now(),
							elapsedNs: relNs,
							expression: asyncEvent.queryKey,
							details: `${asyncEvent.packageId}: ${asyncEvent.error.message}`,
							groupKey: asyncEvent.queryKey,
						});
					}
				}
			});

			// WritableStream: enqueue DiagnosticEventInfo into the output stream
			const outputSink = new WritableStream<DiagnosticEventInfo>({
				write(chunk) {
					controller.enqueue(chunk);
				}
			});

			// Pipe: batcher events → transform → output stream
			// Cancellation via pipeAbortController.abort() in abortHandler/cancel.
			eng.getEventStream()
				.pipeThrough(asyncToDiagnostic, { signal: pipeAbortController.signal })
				.pipeTo(outputSink, { signal: pipeAbortController.signal })
				.catch(() => {
					// Expected during cleanup/abort — pipe is torn down.
				});

				// ── Evaluate all lines ──
				markdownOutline = generateMarkdownOutline(expression);
				allLines = expression.split("\n");

				for (let idx = 0; idx < allLines.length; idx++) {
					const trimmed = allLines[idx].trim();
					if (!trimmed) continue;
					const lineNum = idx + 1;

					// Skip markdown structure and pure-prose lines.
					if (!shouldEvaluateLine(engine!, trimmed)) continue;

					const result = engine!.evaluateLineWithDebug(
						lineNum,
						trimmed
					);
					const lineState = streamDocumentModel.getLineAt(lineNum);
					if (lineState) lineState.result = result.value;

					// An unrecognized bare word (e.g. a stray "hello") is
					// ambiguous prose, not a broken expression — ignore it
					// rather than surfacing "Undefined variable: hello".
					if (isUnrecognizedBareWord(trimmed, result.error)) continue;

					const parselet =
						(result.debug?.parselets?.[0] as any)?.parseletType ??
						"Expression";
					const parseletCategories = result.debug?.summary?.parseCategories ?? {};

					// Record LRU access sequence for page heatmap
					lineAccessSeq.set(lineNum, ++nextAccessSeq);

				// Collect structured pipeline stages, keyed by line so any line can be inspected, not just whichever ran last.
				if (result.diagnostic) {
					lastDiagnostic = result.diagnostic;
					lastPipelineStages = result.diagnostic.stages;
					pipelineStagesByLine[lineNum] = result.diagnostic.stages;
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

					const errorFields = buildErrorFields(result.error, result.engineError, result.value);
					if (errorFields) {
						lineResults.push({
							lineNumber: lineNum,
							expression: trimmed,
							result: "",
							type: "Error",
							parselet,
							parseletCategories,
							...errorFields,
							opcodeCount: perLineOpCount,
							wasCached,
						});
						errors.push(errorFields.error!);
					} else {
						lineResults.push({
							lineNumber: lineNum,
							expression: trimmed,
							result: formatLineResultValue(result.value),
							type: formatType(result.value),
							parselet,
							parseletCategories,
							opcodeCount: perLineOpCount,
							wasCached,
							timedOut: result.value.timedOut ?? false,
						});
					}
				}

				if (lineResults.length > 0) {
					const last = lineResults[lineResults.length - 1];
					output = last.result || last.expression;
					outputType = last.error ? "Error" : last.type;
				}

				{
					// Built once instead of calling lineResults.find() per
					// outline node — that was an O(lines²) pattern (a linear
					// scan of lineResults for every single outline node).
					const lineResultByNumber = new Map(lineResults.map((r) => [r.lineNumber, r]));
					markdownOutline = markdownOutline.map((node, idx) => {
						const lr = lineResultByNumber.get(idx + 1);
						return {
							...node,
							hasRun: !!lr && !lr.error,
							result: lr ? lr.result : undefined,
						};
					});
				}

				const varTokens = rawTokens.filter((t) => t.type === "IDENT");
				variables = [...new Set(varTokens.map((t) => t.value))];
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
			// Abort the pipeThrough/pipeTo pipeline
			if (pipeAbortController) {
				pipeAbortController.abort();
				pipeAbortController = null;
			}
			if (engine) {
				engine.clear();
				engine = null;
			}
		},
	});

	const lineStats: LineStats[] = buildLineStats(lineEventSnapshots);
	const stats: PerformanceStats = buildDocumentStats(lastDebugEvents, lineStats);
	const vmTrace: VmTraceStep[] = buildVmTrace(lastDebugEvents);

	// TanStack Query cache entries for Workers tab display
	const { queryCache, queryClientConfig } = buildQueryCacheState(engine);

	const diagnosticEvents: DiagnosticEventInfo[] =
		buildDiagnosticEvents(lastDebugEvents);

	// ── Read all snapshot data from the last line's diagnostic result ──
	cacheSnapshot = lastDiagnostic?.cacheSnapshot ?? cacheSnapshot;
	const dagSnapshot = lastDiagnostic?.dagSnapshot ?? {
		consumers: {},
		writes: {},
		reads: {},
		dataSourceDeps: {},
		dataSourceConsumers: {},
	};
	const checkpoints = lastDiagnostic?.checkpoints ?? [];
	const batcherMetrics = lastDiagnostic?.batcherMetrics ?? {
		pendingCount: 0,
		dedupCount: 0,
		workerOffloadCount: 0,
		listenerCount: 0,
	};
	const pageHeatmap = extractPageHeatmap(cacheSnapshot, allLines.length);
	// Capture into a stable local first — `engine` is a mutable `let` that
	// closures elsewhere in this function (e.g. `abortHandler`) also
	// reassign, which some type-checker configurations narrow less
	// precisely across a `let` than a `const` (same reasoning as the
	// existing `const eng = engine` a few lines up).
	const engineRef = engine;
	const pipelineTelemetry = engineRef
		? engineRef.getLastTelemetry()
		: null;

	// ── Capture arena stats, then release the arena ──
	const arenaStats: ArenaStats = arena ? {
		enabled: true,
		usage: arena.usage,
		capacity: arena.capacity,
	} : { enabled: false, usage: 0, capacity: 0 };

	// All synchronous evaluation is done by this point; everything below is
	// formatting. Unlike runEngine(), this path used to return with the
	// module-level arena still ACTIVE, which leaked in two ways. The arena
	// is only ever rewound by enableValueArena()'s reset() — i.e. on the
	// next keystroke — so every async re-evaluation in the TransformStream
	// above (an OSRS price or currency rate settling, potentially for as
	// long as the document stays open) kept bump-allocating past the end of
	// the block, and ValueArena.acquire() grows its backing array on
	// overflow and never shrinks. An idle document resolving async values
	// therefore grew the arena without bound. It also meant the NEXT run's
	// reset() recycled Value objects out from under the still-live previous
	// run, since the arena is a single non-reentrant module-level block.
	disableValueArena();

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
		queryCache,
		queryClientConfig,
		cacheSnapshot,
		diagnosticEvents,
		pipelineTelemetry,
		pipelineStages: lastPipelineStages,
		pipelineStagesByLine,
		dagSnapshot,
		checkpoints,
		batcherMetrics,
		pageHeatmap,
		arenaStats,
		parseletRegistry: engineRef ? engineRef.getParseletRegistry() : undefined,
	};

	// ── Return the stream directly — no tee() needed.
	// The engine store's onmessage handler receives stream events and
	// populates the StreamStore (and any other consumers) directly.
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
	const pipelineStagesByLine: Record<number, PipelineStageResult[]> = {};
	let lastDiagnostic: DiagnosticPipelineResult | undefined;

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

	// ── Declare stats/lineStats here so both try and catch paths can reference them ──
	let stats: PerformanceStats = { lexerTime: 0, parserTime: 0, bytecodeTime: 0, executionTime: 0, totalTime: 0 };
	let lineStats: LineStats[] = [];
	let vmTrace: VmTraceStep[] = [];
	let queryCache: QueryCacheEntry[] = [];
	let diagnosticEvents: DiagnosticEventInfo[] = [];

	try {
		// ── Enable allocation tracking for per-stage telemetry ──
		AllocationTracker.enable();

		// ── Enable Value Arena for zero-allocation Value reuse ──
		const arena = enableValueArena(512);

		const engine = new ExpressionEngine("en", true, {
			diagnostic: { enabled: true, vmTraceEnabled: true },
		}, undefined, PLAYGROUND_PACKAGES);

		// Cross-line data access (packages/lines: prev, line<N>, sum/total/
		// average(line X : line Y), total above) reads another line's cached
		// result via ExpressionEngine.documentModel (see makeLineContext()) —
		// without a DocumentModel wired here, every cross-line reference would
		// error with "no document" even though this loop DOES evaluate a real
		// multi-line document, just without the incremental-caching machinery
		// (ThreeTierEvaluator) that normally owns DocumentModel updates. Set
		// each line's result directly on the LIVE LineState object getLineAt()
		// returns (not a copy — see DocumentModel.ts) after it evaluates,
		// mirroring the one field ThreeTierEvaluator's own updateLineResult()
		// writes that getLineResult()/isLineBoundary() actually read; the rest
		// of that heavier API (bytecodes/reads/writes bookkeeping) exists for
		// the incremental cache this simpler debug harness doesn't use.
		const documentModel = new DocumentModel();
		documentModel.setDocument(expression);
		engine.setDocumentModel(documentModel);

		markdownOutline = generateMarkdownOutline(expression);
		const allLines = expression.split("\n");

		allLines.forEach((line, idx) => {
			const trimmed = line.trim();
			if (!trimmed) return;
			const lineNum = idx + 1;

			// Skip markdown structure and pure-prose lines.
			if (!shouldEvaluateLine(engine, trimmed)) return;

			const result = engine.evaluateLineWithDebug(lineNum, trimmed);
			const lineState = documentModel.getLineAt(lineNum);
			if (lineState) lineState.result = result.value;

			// An unrecognized bare word (e.g. a stray "hello") is ambiguous
			// prose, not a broken expression — ignore it rather than
			// surfacing "Undefined variable: hello" as an error.
			if (isUnrecognizedBareWord(trimmed, result.error)) return;

			const parselet =
				(result.debug?.parselets?.[0] as any)?.parseletType ??
				"Expression";
			const parseletCategories = result.debug?.summary?.parseCategories ?? {};

			// Record LRU access sequence for page heatmap
			lineAccessSeq.set(lineNum, ++nextAccessSeq);

			// Collect structured pipeline stages, keyed by line so any line can be inspected, not just whichever ran last.
			if (result.diagnostic) {
				lastDiagnostic = result.diagnostic;
				lastPipelineStages = result.diagnostic.stages;
				pipelineStagesByLine[lineNum] = result.diagnostic.stages;
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

			const errorFields = buildErrorFields(result.error, result.engineError, result.value);
			if (errorFields) {
				lineResults.push({
					lineNumber: lineNum,
					expression: trimmed,
					result: "",
					type: "Error",
					parselet,
					parseletCategories,
					...errorFields,
					opcodeCount: perLineOpCount,
					wasCached,
				});
				errors.push(errorFields.error!);
			} else {
				lineResults.push({
					lineNumber: lineNum,
					expression: trimmed,
					result: formatLineResultValue(result.value),
					type: formatType(result.value),
					parselet,
					parseletCategories,
					opcodeCount: perLineOpCount,
					wasCached,
					timedOut: (result.value as any).timedOut ?? false,
				});
			}
		});

		if (lineResults.length > 0) {
			const last = lineResults[lineResults.length - 1];
			output = last.result || last.expression;
			outputType = last.error ? "Error" : last.type;
		}

		{
			// Built once instead of calling lineResults.find() per outline
			// node — that was an O(lines²) pattern (a linear scan of
			// lineResults for every single outline node).
			const lineResultByNumber = new Map(lineResults.map((r) => [r.lineNumber, r]));
			markdownOutline = markdownOutline.map((node, idx) => {
				const lr = lineResultByNumber.get(idx + 1);
				return {
					...node,
					hasRun: !!lr && !lr.error,
					result: lr ? lr.result : undefined,
				};
			});
		}

		// Collect variables from tokens
		const varTokens = rawTokens.filter((t) => t.type === "IDENT");
		variables = [...new Set(varTokens.map((t) => t.value))];

		// Collect cache snapshot from the last line's diagnostic result
		cacheSnapshot = lastDiagnostic?.cacheSnapshot ?? { bytecode: [], lineCache: [], asyncCache: [] };

		// ── Extract DAG, checkpoint, batcher from last diagnostic ──
		const dagSnap = lastDiagnostic?.dagSnapshot ?? {
			consumers: {},
			writes: {},
			reads: {},
			dataSourceDeps: {},
			dataSourceConsumers: {},
		};
		const ckpts = lastDiagnostic?.checkpoints ?? [];
		const bm = lastDiagnostic?.batcherMetrics ?? {
			pendingCount: 0,
			dedupCount: 0,
			workerOffloadCount: 0,
			listenerCount: 0,
		};
		const ph = extractPageHeatmap(cacheSnapshot, allLines.length);

		// ── Capture arena stats ──
		const arenaStats: ArenaStats = {
			enabled: true,
			usage: arena.usage,
			capacity: arena.capacity,
		};
		disableValueArena();

		// ── Compute stats before returning from try block ──
		lineStats = buildLineStats(lineEventSnapshots);
		stats = buildDocumentStats(lastDebugEvents, lineStats);
		vmTrace = buildVmTrace(lastDebugEvents);

		const qcState = buildQueryCacheState(engine);
		queryCache = qcState.queryCache;

		diagnosticEvents = buildDiagnosticEvents(lastDebugEvents);

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
			queryCache,
			queryClientConfig: qcState.queryClientConfig,
			cacheSnapshot,
			diagnosticEvents,
			pipelineTelemetry: engine.getLastTelemetry(),
			pipelineStages: lastPipelineStages,
			pipelineStagesByLine,
			dagSnapshot: dagSnap,
			checkpoints: ckpts,
			batcherMetrics: bm,
			pageHeatmap: ph,
			arenaStats,
			parseletRegistry: engine.getParseletRegistry(),
		};
	} catch (error) {
		errors.push(error instanceof Error ? error.message : String(error));
	}

	// Error path — assemble what we can from the last accumulated events.
	lineStats = buildLineStats(lineEventSnapshots);
	stats = buildDocumentStats(lastDebugEvents, lineStats);
	vmTrace = buildVmTrace(lastDebugEvents);
	diagnosticEvents = buildDiagnosticEvents(lastDebugEvents);

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
		queryCache: [],
		queryClientConfig: { staleTime: 0, gcTime: 0 },
		cacheSnapshot,
		diagnosticEvents,
		pipelineTelemetry: null,
		pipelineStages: lastPipelineStages,
		pipelineStagesByLine,
			dagSnapshot,
			checkpoints,
			batcherMetrics,
			pageHeatmap,
			arenaStats: { enabled: false, usage: 0, capacity: 0 },
			parseletRegistry: { prefix: [], infix: [] },
		};
}

