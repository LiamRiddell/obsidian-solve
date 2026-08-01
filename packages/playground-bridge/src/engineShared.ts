/**
 * Shared assembly helpers for the playground engine bridge.
 *
 * runEngine() and runEngineWithStreaming() previously duplicated these
 * blocks (three copies of some — success, streaming, and error paths).
 * Extracted here so the two entry points differ only in control flow.
 *
 * Imports from './engine.js' are type-only, so this module introduces no
 * runtime import cycle even though engine.ts imports functions from here.
 */

import type { ExpressionEngine } from '@solve-js/engine/ExpressionEngine';
import { formatValue } from '@solve-js/format/FormatEngine';
import { Value, ValueType } from '@solve-js/vm/Value';
import type {
	PerformanceStats,
	LineStats,
	VmTraceStep,
	DiagnosticEventInfo,
	QueryCacheEntry,
	QueryClientConfig,
} from './engine.js';

/** Minimal diagnostic event shape consumed by the extractors. */
export type TimedEvent = { type: string; elapsedNs: number };

/**
 * Decide what text to actually send to the engine for a whole-document
 * evaluation pass (runEngine/runEngineWithStreaming). Returns the
 * document's text completely UNCHANGED unless it's entirely blank
 * (whitespace-only), in which case it returns "" to signal "nothing to
 * evaluate" (the caller's abort-on-empty path).
 *
 * Deliberately does NOT trim leading/trailing whitespace from a non-blank
 * document. Every line number reported anywhere in the evaluation
 * pipeline comes from splitting this exact string on "\n" and using the
 * 1-based index directly (see runEngine's/runEngineWithStreaming's
 * per-line loop) — trimming leading blank lines here would silently
 * renumber every real line after them, decoupling the reported
 * lineNumber from the actual position the expression sits at in the
 * document the user is looking at. This was a real, reported bug: typing
 * blank lines above an expression left its result widget stuck on the
 * (now blank) original line, because the engine was never told those
 * blank lines existed. Blank lines are already handled correctly at the
 * per-line level regardless (the loop skips them via `if (!trimmed)
 * continue` while still counting them for subsequent lines' numbering),
 * so no document-level trim was ever necessary.
 */
export function prepareEvaluationInput(docText: string): string {
	return docText.trim().length === 0 ? '' : docText;
}

/**
 * Whether a line's evaluation error was just an unrecognized bare word
 * (e.g. a stray "hello" used as ordinary prose) rather than a genuine
 * mistake in an intended expression.
 *
 * Bare single-identifier lines — no `:` prefix, no operators, no other
 * expression markers — are inherently ambiguous: they could be prose, or
 * a typo'd variable reference. Colon-prefixed references (`:foo`) are an
 * explicit, deliberate expression marker and still error normally when
 * undefined; only the unprefixed bare-word case is treated as ignorable.
 */
export function isUnrecognizedBareWord(trimmed: string, error: string | undefined): boolean {
	if (!error || !error.startsWith('Undefined variable:')) return false;
	return /^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed);
}

const ZERO_STATS: PerformanceStats = {
	lexerTime: 0,
	parserTime: 0,
	bytecodeTime: 0,
	executionTime: 0,
	totalTime: 0,
};

/**
 * Extract per-stage wall-clock timings from the diagnostic event timeline.
 *
 * Each event carries a real `elapsedNs` stamp (set by TimelineDiagnosticCollector)
 * relative to `pipeline_start`. We derive four back-to-back, non-overlapping
 * spans (each stage's time is real wall-clock time nobody else also claims,
 * so the four sum to the true elapsed time between lexing and VM halt):
 *   - lexerTime:    first `token_emitted` → last `token_emitted`
 *   - parserTime:   last `token_emitted` → last `parselet_matched`
 *   - bytecodeTime: last `parselet_matched` → `bytecode_built` (compilation tail)
 *   - executionTime: first `vm_step` (or `bytecode_built`) → `vm_halt`
 *   - totalTime: `pipeline_start` → `pipeline_end`
 *
 * When a bytecode cache hit occurs, lexer/parser/compiler stages are skipped
 * entirely — we report zero for those and only capture VM + total time.
 */
export function extractStageTimings(
	events: readonly TimedEvent[]
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

	// Compiler tail: last parselet matched → bytecode built. Computed
	// first so parserTime (below) can stop exactly where it starts —
	// previously parserTime ran all the way to bytecodeBuilt too, so the
	// [lastParselet, bytecodeBuilt] span was counted in BOTH parserTime
	// and bytecodeTime. That inflated their sum past totalTime, which
	// silently zeroed out "Overhead" (computeOverhead clamps negative
	// results to 0) and made the flamegraph/heatmap show a breakdown
	// that couldn't actually add up to the real end-to-end time.
	const lastParselet =
		byType.parseletMatched[byType.parseletMatched.length - 1];
	const compileStart = lastParselet?.elapsedNs ?? byType.bytecodeBuilt?.elapsedNs ?? lexEnd;
	const compileEnd = byType.bytecodeBuilt?.elapsedNs ?? compileStart;

	// Parser: last token → last parselet matched (pure parsing, ending
	// exactly where the compiler tail above begins — no overlap).
	const parseStart = lexEnd;
	const parseEnd = compileStart;

	// VM: first vm_step (or bytecode built) → vm_halt
	const vmStart = byType.vmStep[0]?.elapsedNs ?? compileEnd;
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

/**
 * Find the last event of a given type without allocating a reversed copy
 * of the array — `extractLineTimings` used to call `[...events].reverse().find(...)`
 * three times per line, each spreading + reversing the whole events array
 * just to find one element from the end.
 */
function findLast(events: readonly TimedEvent[], type: TimedEvent["type"]): TimedEvent | undefined {
	for (let i = events.length - 1; i >= 0; i--) {
		if (events[i].type === type) return events[i];
	}
	return undefined;
}

/**
 * Extract per-stage timings from a single line's diagnostic events.
 * This is a simpler version of extractStageTimings that doesn't depend
 * on pipeline_start/pipeline_end events (which only appear once globally).
 * The total time for the line is derived from the first-to-last event span.
 */
export function extractLineTimings(
	events: readonly TimedEvent[]
): PerformanceStats {
	if (events.length === 0) {
		return { ...ZERO_STATS };
	}

	const firstEvent = events[0];
	const lastEvent = events[events.length - 1];

	const firstToken = events.find((e) => e.type === "token_emitted");
	const lastToken = findLast(events, "token_emitted");
	const lastParselet = findLast(events, "parselet_matched");
	const bytecodeBuilt = events.find((e) => e.type === "bytecode_built");
	const firstVmStep = events.find((e) => e.type === "vm_step");
	const lastVmHalt = findLast(events, "vm_halt");

	const lexStart = firstToken?.elapsedNs ?? firstEvent.elapsedNs;
	const lexEnd = lastToken?.elapsedNs ?? lexStart;
	// Same non-overlapping split as extractStageTimings above: the
	// compiler tail [lastParselet, bytecodeBuilt] must not also be
	// counted inside parserTime, or the four stage times sum to more
	// than the line's real total span.
	const compileStart = lastParselet?.elapsedNs ?? bytecodeBuilt?.elapsedNs ?? lexEnd;
	const compileEnd = bytecodeBuilt?.elapsedNs ?? compileStart;
	const parseStart = lexEnd;
	const parseEnd = compileStart;
	const vmStart =
		firstVmStep?.elapsedNs ?? compileEnd;
	const vmEnd = lastVmHalt?.elapsedNs ?? lastEvent.elapsedNs;

	return {
		lexerTime: Math.max(0, lexEnd - lexStart),
		parserTime: Math.max(0, parseEnd - parseStart),
		bytecodeTime: Math.max(0, compileEnd - compileStart),
		executionTime: Math.max(0, vmEnd - vmStart),
		totalTime: Math.max(0, lastEvent.elapsedNs - firstEvent.elapsedNs),
	};
}

/**
 * Format a line result's display string with the SAME contract the real
 * Obsidian widget uses (MarkdownEditorViewPlugin.buildDecorations):
 * `isPending ? "" : formatValue(value)`. solve-js's formatValue() has no
 * special case for Pending/Error Values — it falls through to
 * `= ${String(value.value)}`, which for a Pending Value is the internal
 * TanStack Query key (e.g. "osrs:item:1267"), not a result. Callers must
 * guard it; the playground previously didn't, so the raw query key was
 * shown to the user as if it were the answer.
 */
export function formatLineResultValue(value: Value): string {
	if (value.type === ValueType.Pending) return '';
	return formatValue(value);
}

/** Aggregate stage timings, or zeros when no diagnostic events exist. */
export function buildStats(
	events: readonly TimedEvent[] | null
): PerformanceStats {
	return events ? extractStageTimings(events) : { ...ZERO_STATS };
}

/**
 * Sums per-line PerformanceStats into one document-wide total — the correct
 * way to get a multi-line "Total" figure.
 *
 * `extractStageTimings()` (used by `buildStats()`) finds `pipeline_start`/
 * `pipeline_end` via `.find()` — the FIRST match in whatever event array
 * it's given. Within one evaluation pass, every line's diagnostic events
 * are appended to ONE growing array (see engine.ts's per-line loop), so
 * handing that combined array to `buildStats()` doesn't compute a
 * document-wide total at all — it silently returns line 1's OWN (typically
 * tiny) span, mislabeled as "Total". A five-line document where line 1 is a
 * cached, trivial expression reports a "Total" of a few hundred
 * nanoseconds regardless of how long the other four lines (or an async
 * settle) actually took.
 *
 * Each entry in `lineStats` (from `buildLineStats()`) is already correctly
 * isolated — its events were sliced to that line alone via cumulative
 * snapshot-length diffing, not `.find()` — so summing them gives the real
 * cross-line total. For a single-line document this is equivalent to
 * calling `buildStats()` directly (one line's total, summed with nothing).
 */
export function sumLineStats(lineStats: readonly LineStats[]): PerformanceStats {
	const total: PerformanceStats = { ...ZERO_STATS };
	for (const { stats } of lineStats) {
		total.lexerTime += stats.lexerTime;
		total.parserTime += stats.parserTime;
		total.bytecodeTime += stats.bytecodeTime;
		total.executionTime += stats.executionTime;
		total.totalTime += stats.totalTime;
	}
	return total;
}

/**
 * Document-wide stats, correctly summed across every evaluated line.
 * Prefer this over `buildStats(lastDebugEvents)` for a multi-line
 * "Total" figure — see `sumLineStats()`'s doc comment for why the naive
 * version silently reports only the first line's span. Falls back to
 * `buildStats()` when there's no per-line breakdown available at all
 * (e.g. zero evaluable lines).
 */
export function buildDocumentStats(
	lastDebugEvents: readonly TimedEvent[] | null,
	lineStats: readonly LineStats[]
): PerformanceStats {
	return lineStats.length > 0 ? sumLineStats(lineStats) : buildStats(lastDebugEvents);
}

/**
 * Per-line timings from cumulative event snapshots. Each snapshot holds
 * ALL events accumulated so far; the delta between consecutive snapshots
 * yields the events belonging to that line.
 */
export function buildLineStats(
	lineEventSnapshots: readonly {
		lineNumber: number;
		events: readonly TimedEvent[];
	}[]
): LineStats[] {
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
	return lineStats;
}

/** VM trace steps from the diagnostic event stream (vm_step events). */
export function buildVmTrace(
	events: readonly TimedEvent[] | null
): VmTraceStep[] {
	if (!events) return [];
	return events
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
		});
}

/** Flat diagnostic event list for the Events tab. */
export function buildDiagnosticEvents(
	events: readonly TimedEvent[] | null
): DiagnosticEventInfo[] {
	if (!events) return [];
	return events.map((e) => ({
		type: e.type,
		timestamp: Date.now(),
		elapsedNs: e.elapsedNs,
		expression: (e as any).expression ?? "",
		details: (e as any).details ?? "",
		groupKey: (e as any).expression ?? "",
	}));
}

/**
 * TanStack Query cache entries + client config for the Workers/Cache tabs.
 * Handles a null engine (error paths) by returning empty defaults.
 */
export function buildQueryCacheState(engine: ExpressionEngine | null): {
	queryCache: QueryCacheEntry[];
	queryClientConfig: QueryClientConfig;
} {
	const defaultStaleTime = engine?.queryClient.getDefaultOptions().queries?.staleTime ?? 0;
	const defaultCacheTime = engine?.queryClient.getDefaultOptions().queries?.gcTime ?? 0;
	const queryClientConfig: QueryClientConfig = {
		staleTime: typeof defaultStaleTime === 'number' ? defaultStaleTime : 0,
		gcTime: defaultCacheTime,
	};

	const queryCache: QueryCacheEntry[] = engine
		? engine.queryClient.getQueryCache().getAll().map(q => {
			const data = q.state.data;
			let dataPreview = '—';
			if (data == null) {
				dataPreview = 'null';
			} else if (typeof data === 'object') {
				const obj = data as any;
				if (obj.value !== undefined) dataPreview = String(obj.value) + (obj.unit ? ' ' + obj.unit : '');
				else dataPreview = JSON.stringify(data).slice(0, 120);
			} else {
				dataPreview = String(data);
			}
			return {
				queryKey: q.queryKey.join(':'),
				queryKeyArray: q.queryKey as string[],
				status: q.state.status === 'success' ? 'fresh' as const : q.state.status === 'error' ? 'error' as const : 'fetching' as const,
				dataType: data != null && typeof data === 'object' ? (data as any)?.unit || 'object' : typeof data,
				dataPreview,
				updatedAt: q.state.dataUpdatedAt,
				staleTime: queryClientConfig.staleTime,
				cacheTime: queryClientConfig.gcTime,
			};
		})
		: [];

	return { queryCache, queryClientConfig };
}
