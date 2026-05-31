import { ExpressionEngine } from '@/solve-js/src/engine/ExpressionEngine';
import { formatValue } from '@/solve-js/src/format/FormatEngine';
import { getOpCodeName, OpCode } from '@/solve-js/src/parser/OpCode';
import { Value, ValueType } from '@/solve-js/src/vm/Value';
import type { BytecodeProgram } from '@/solve-js/src/parser/BytecodeBuilder';
import type { Token } from '@/solve-js/src/lexer/Token';
import type { ParseletInfo } from '@/solve-js/src/types/ParsingResult';
import { dataQueryService } from '@solve-js/services/DataQueryService';

export type { Token };
export type { ParseletInfo };

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
    lineStats: LineStats[];   /* per-line stage timings for multi-line docs */
    markdownOutline: MarkdownNode[];
    lineResults: LineResult[];
    parselets: ParseletInfo[];
    vmTrace: VmTraceStep[];
    dqMetrics: DQMetrics;
}

export interface LineResult {
    lineNumber: number;
    expression: string;
    result: string;
    type: string;
    parselet: string;
    error?: string;
}

export interface OpcodeInfo { name: string; value: number; args: number[]; }
export interface ConstantInfo { type: 'number' | 'string' | 'bigint' | 'hex'; value: any; index: number; }
export interface PerformanceStats { lexerTime: number; parserTime: number; bytecodeTime: number; executionTime: number; totalTime: number; }
export interface LineStats { lineNumber: number; stats: PerformanceStats; }
export interface VmTraceStep { ip: number; opcodeName: string; opcode: number; stackDepth: number; instructionNumber: number; elapsedNs: number; }
export interface DQMetrics { queryCount: number; pendingQueries: number; dataSources: number; cacheSize: number; }
export interface DagNode { id: string; label: string; type: string; lineNumber: number; }
export interface DagEdge { source: string; target: string; }
export interface MarkdownNode { id: string; type: string; content: string; children: MarkdownNode[]; hasRun: boolean; depth: number; result?: string; }

function formatType(val: Value): string {
    const typeNames: Record<number, string> = {
        [ValueType.Number]: 'Number',
        [ValueType.Hex]: 'Hex',
        [ValueType.BigInt]: 'BigInt',
        [ValueType.String]: 'String',
        [ValueType.Datetime]: 'Datetime',
        [ValueType.Percentage]: 'Percentage',
        [ValueType.Uom]: 'Uom',
        [ValueType.Array]: 'Array',
        [ValueType.Boolean]: 'Boolean',
        [ValueType.Unit]: 'Unit',
        [ValueType.Pending]: 'Pending',
        [ValueType.Error]: 'Error',
    };
    const t = typeNames[val.type] ?? 'Value';
    return val.unit ? `${t} (${val.unit})` : t;
}

function generateMarkdownOutline(text: string): MarkdownNode[] {
    const nodes: MarkdownNode[] = [];
    const lines = text.split('\n');
    let idCounter = 0;
    lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        const headerMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (headerMatch) {
            nodes.push({ id: `node-${idCounter++}`, type: 'header', content: headerMatch[2], children: [], hasRun: false, depth: headerMatch[1].length });
        } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            nodes.push({ id: `node-${idCounter++}`, type: 'list-item', content: trimmed.substring(2), children: [], hasRun: true, depth: 1 });
        } else {
            nodes.push({ id: `node-${idCounter++}`, type: 'paragraph', content: trimmed, children: [], hasRun: true, depth: 0 });
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
function decodeOpcodeArgs(op: number, opcodeArray: Uint8Array, ip: number): number[] {
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
function extractLineTimings(events: readonly { type: string; elapsedNs: number }[]): PerformanceStats {
    if (events.length === 0) {
        return { lexerTime: 0, parserTime: 0, bytecodeTime: 0, executionTime: 0, totalTime: 0 };
    }

    const firstEvent = events[0];
    const lastEvent = events[events.length - 1];

    const firstToken = events.find(e => e.type === 'token_emitted');
    const lastToken = [...events].reverse().find(e => e.type === 'token_emitted');
    const firstParselet = events.find(e => e.type === 'parselet_matched');
    const lastParselet = [...events].reverse().find(e => e.type === 'parselet_matched');
    const bytecodeBuilt = events.find(e => e.type === 'bytecode_built');
    const firstVmStep = events.find(e => e.type === 'vm_step');
    const lastVmHalt = [...events].reverse().find(e => e.type === 'vm_halt');

    const lexStart = firstToken?.elapsedNs ?? firstEvent.elapsedNs;
    const lexEnd = lastToken?.elapsedNs ?? lexStart;
    const parseStart = lexEnd;
    const parseEnd = bytecodeBuilt?.elapsedNs ?? (lastParselet?.elapsedNs ?? parseStart);
    const compileStart = lastParselet?.elapsedNs ?? parseEnd;
    const compileEnd = parseEnd;
    const vmStart = firstVmStep?.elapsedNs ?? (bytecodeBuilt?.elapsedNs ?? parseEnd);
    const vmEnd = lastVmHalt?.elapsedNs ?? lastEvent.elapsedNs;

    return {
        lexerTime: Math.max(0, lexEnd - lexStart),
        parserTime: Math.max(0, parseEnd - parseStart),
        bytecodeTime: Math.max(0, compileEnd - compileStart),
        executionTime: Math.max(0, vmEnd - vmStart),
        totalTime: Math.max(0, lastEvent.elapsedNs - firstEvent.elapsedNs),
    };
}

function extractStageTimings(events: readonly { type: string; elapsedNs: number }[]): PerformanceStats {
    const hasCacheHit = events.some(e => e.type === 'cache_hit');

    const byType = {
        tokenEmitted: events.filter(e => e.type === 'token_emitted'),
        parseletMatched: events.filter(e => e.type === 'parselet_matched'),
        bytecodeBuilt: events.find(e => e.type === 'bytecode_built'),
        vmStep: events.filter(e => e.type === 'vm_step'),
        vmHalt: events.find(e => e.type === 'vm_halt'),
        pipelineStart: events.find(e => e.type === 'pipeline_start'),
        pipelineEnd: events.find(e => e.type === 'pipeline_end'),
    };

    if (hasCacheHit) {
        // Cache hit: lexer/parser/compiler were skipped entirely.
        // Only VM execution and total wall-clock time are meaningful.
        const vmStart = byType.vmStep[0]?.elapsedNs ?? (byType.bytecodeBuilt?.elapsedNs ?? 0);
        const vmEnd = byType.vmHalt?.elapsedNs ?? (byType.pipelineEnd?.elapsedNs ?? vmStart);
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
    const lexEnd = byType.tokenEmitted[byType.tokenEmitted.length - 1]?.elapsedNs ?? lexStart;

    // Parser: last token → bytecode built
    const parseStart = lexEnd;
    const parseEnd = byType.bytecodeBuilt?.elapsedNs ?? parseStart;

    // Compiler tail: last parselet matched → bytecode built
    const lastParselet = byType.parseletMatched[byType.parseletMatched.length - 1];
    const compileStart = lastParselet?.elapsedNs ?? parseEnd;
    const compileEnd = parseEnd;

    // VM: first vm_step (or bytecode built) → vm_halt
    const vmStart = byType.vmStep[0]?.elapsedNs ?? parseEnd;
    const vmEnd = byType.vmHalt?.elapsedNs ?? (byType.pipelineEnd?.elapsedNs ?? vmStart);

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

export function runEngine(expression: string): DebugResult {
    const errors: string[] = [];
    let rawTokens: Token[] = [];
    let ast = '';
    let output = '';
    let outputType = 'unknown';
    let opcodes: OpcodeInfo[] = [];
    let constants: ConstantInfo[] = [];
    let variables: string[] = [];
    let markdownOutline: MarkdownNode[] = [];
    let lineResults: LineResult[] = [];
    let parselets: ParseletInfo[] = [];

    // The TimelineDiagnosticCollector accumulates events across ALL
    // evaluateLineWithDebug() calls without resetting, so line N's
    // debug.events includes lines 1..N. We capture per-line snapshots
    // to compute per-line stage timings, plus the last line's events
    // for the aggregate timing.
    let lastDebugEvents: readonly { type: string; elapsedNs: number }[] | null = null;
    const lineEventSnapshots: { lineNumber: number; events: readonly { type: string; elapsedNs: number }[] }[] = [];

    try {
        const engine = new ExpressionEngine('en', true, {
            diagnostic: { enabled: true, vmTraceEnabled: true },
        });

        markdownOutline = generateMarkdownOutline(expression);
        const allLines = expression.split('\n');

        allLines.forEach((line, idx) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            const lineNum = idx + 1;

            const result = engine.evaluateLineWithDebug(lineNum, trimmed);
            const parselet = (result.debug?.parselets?.[0] as any)?.parseletType ?? 'Expression';

            // Capture per-line event snapshot + last valid set (accumulated across all lines)
            if (result.debug?.events && result.debug.events.length > 0) {
                lastDebugEvents = result.debug.events;
                lineEventSnapshots.push({ lineNumber: lineNum, events: result.debug.events });
            }

            if (result.error) {
                lineResults.push({ lineNumber: lineNum, expression: trimmed, result: '', type: 'Error', parselet, error: result.error });
                errors.push(result.error);
            } else {
                lineResults.push({ lineNumber: lineNum, expression: trimmed, result: formatValue(result.value), type: formatType(result.value), parselet });
            }

            // Collect tokens
            if (result.tokens) {
                const tokensWithLine = result.tokens.map(t => ({
                    ...t,
                    line: (t as any).line ?? lineNum,
                    col: (t as any).col ?? 0,
                    lineBreaks: (t as any).lineBreaks ?? 0,
                } as Token));
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

            if (result.program) {
                const opcodeArray = new Uint8Array(result.program.opcodes);
                let ip = 0;
                while (ip < opcodeArray.length) {
                    const op = opcodeArray[ip];
                    const name = getOpCodeName(op);
                    const args = decodeOpcodeArgs(op, opcodeArray, ip);
                    opcodes.push({ name, value: op, args });
                    ip += 1 + args.length;
                }

                // Collect constants
                const numbers = new Float64Array(result.program.numbers);
                const strings = result.program.strings;
                numbers.forEach((num, idx) => { constants.push({ type: 'number', value: num, index: idx }); });
                strings.forEach((str: string, idx: number) => { constants.push({ type: 'string', value: str, index: idx }); });

                // AST approximation
                ast = JSON.stringify({
                    opcodes: opcodes.length,
                    numbers: numbers.length,
                    strings: strings.length,
                    hasAsync: result.program.hasAsync,
                }, null, 2);
            }
        });

        if (lineResults.length > 0) {
            const last = lineResults[lineResults.length - 1];
            output = last.result || last.expression;
            outputType = last.error ? 'Error' : last.type;
        }

        markdownOutline = markdownOutline.map((node, idx) => {
            const lr = lineResults.find(r => r.lineNumber === idx + 1);
            return { ...node, hasRun: !!lr && !lr.error, result: lr ? lr.result : undefined };
        });

        // Collect variables from tokens
        const varTokens = rawTokens.filter(t => t.type === 'IDENT');
        variables = [...new Set(varTokens.map(t => t.value))];
    } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
    }

    // Extract aggregate per-stage timings from the last accumulated event set.
    const stats: PerformanceStats = lastDebugEvents
        ? extractStageTimings(lastDebugEvents)
        : { lexerTime: 0, parserTime: 0, bytecodeTime: 0, executionTime: 0, totalTime: 0 };

    // Extract per-line timings from event snapshot deltas.
    // Each snapshot is cumulative; we slice the delta between consecutive snapshots
    // to get the events that belong to each line.
    const lineStats: LineStats[] = [];
    let prevEventCount = 0;
    for (const snap of lineEventSnapshots) {
        const lineOnlyEvents = snap.events.slice(prevEventCount);
        prevEventCount = snap.events.length;
        lineStats.push({ lineNumber: snap.lineNumber, stats: extractLineTimings(lineOnlyEvents) });
    }

    // Extract VM trace steps from the last accumulated event set
    const vmTrace: VmTraceStep[] = lastDebugEvents
        ? lastDebugEvents
            .filter(e => e.type === 'vm_step')
            .map(e => {
                const step = e as { type: 'vm_step'; ip: number; opcodeName: string; opcode: number; stackDepth: number; instructionNumber: number; elapsedNs: number };
                return {
                    ip: step.ip,
                    opcodeName: step.opcodeName,
                    opcode: step.opcode,
                    stackDepth: step.stackDepth,
                    instructionNumber: step.instructionNumber,
                    elapsedNs: step.elapsedNs,
                };
            })
        : [];

    // Collect real DataQueryService metrics for the worker telemetry panel
    const m = dataQueryService.getMetrics();
    const dqMetrics: DQMetrics = { queryCount: m.queryCount, pendingQueries: m.pendingQueries, dataSources: m.dataSources, cacheSize: m.cacheSize };

    return { tokens: rawTokens, rawTokens, ast, output, outputType, errors, opcodes, constants, variables, stats, lineStats, markdownOutline, lineResults, parselets, vmTrace, dqMetrics };
}
