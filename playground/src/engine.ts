import { ExpressionEngine } from '@/engine/engine/ExpressionEngine';
import { formatValue } from '@/engine/format/FormatEngine';
import { getOpCodeName } from '@/engine/parser/OpCode';
import { Value, ValueType } from '@/engine/vm/Value';
import type { Token } from '@/engine/lexer/Token';

export type { Token };

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
    markdownOutline: MarkdownNode[];
    lineResults: LineResult[];
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
export interface DagNode { id: string; label: string; type: string; lineNumber: number; }
export interface DagEdge { source: string; target: string; }
export interface MarkdownNode { id: string; type: string; content: string; children: MarkdownNode[]; hasRun: boolean; depth: number; result?: string; }

function getNanoTime(): number {
    if (typeof performance !== 'undefined' && performance.now) return performance.now() * 1_000_000;
    return Date.now() * 1_000_000;
}

function formatType(val: Value): string {
    const typeNames: Record<number, string> = {
        0: 'Number', 1: 'Hex', 2: 'BigInt', 3: 'String',
        4: 'Datetime', 5: 'Percentage', 6: 'Uom',
        7: 'Vector2', 8: 'Vector3', 9: 'Vector4',
        10: 'Boolean', 11: 'Unit'
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

export function runEngine(expression: string): DebugResult {
    const errors: string[] = [];
    let rawTokens: Token[] = [];
    let tokens: Token[] = [];
    let ast = '';
    let output = '';
    let outputType = 'unknown';
    let opcodes: OpcodeInfo[] = [];
    let constants: ConstantInfo[] = [];
    let variables: string[] = [];
    let markdownOutline: MarkdownNode[] = [];
    let lineResults: LineResult[] = [];

    const stats: PerformanceStats = { lexerTime: 0, parserTime: 0, bytecodeTime: 0, executionTime: 0, totalTime: 0 };
    const totalStart = getNanoTime();

    try {
        // Use the main ExpressionEngine
        const engine = new ExpressionEngine("en");
        
        markdownOutline = generateMarkdownOutline(expression);
        const allLines = expression.split('\n');

        const executionStart = getNanoTime();

        allLines.forEach((line, idx) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            const lineNum = idx + 1;

            const result = engine.evaluateLineWithDebug(lineNum, trimmed);
            const parselet = engine.getParseletType(trimmed);
            
            if (result.error) {
                lineResults.push({ lineNumber: lineNum, expression: trimmed, result: '', type: 'Error', parselet, error: result.error });
                errors.push(result.error);
            } else {
                lineResults.push({ lineNumber: lineNum, expression: trimmed, result: formatValue(result.value), type: formatType(result.value), parselet });
            }

            // Always collect debug data in playground environment
            if (result.tokens) {
                rawTokens.push(...result.tokens);
            }
            if (result.program) {
                // Collect opcodes
                const opcodeArray = new Uint8Array(result.program.opcodes);
                let ip = 0;
                while (ip < opcodeArray.length) {
                    const op = opcodeArray[ip];
                    // Use the engine's helper function to get the opcode name
                    const name = getOpCodeName(op);
                    const args: number[] = [];
                    if (op >= 10 && op <= 15) { if (ip + 1 < opcodeArray.length) args.push(opcodeArray[ip + 1]); }
                    else if (op >= 60 && op <= 62) { if (ip + 1 < opcodeArray.length) args.push(opcodeArray[ip + 1]); }
                    opcodes.push({ name, value: op, args });
                    ip += 1 + args.length;
                }

                // Collect constants
                const numbers = new Float64Array(result.program.numbers);
                const strings = result.program.strings;
                numbers.forEach((num, idx) => { constants.push({ type: 'number', value: num, index: idx }); });
                strings.forEach((str, idx) => { constants.push({ type: 'string', value: str, index: idx }); });

                // AST
                ast = JSON.stringify(result.program, null, 2);
            }
        });

        stats.executionTime = getNanoTime() - executionStart;

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

    stats.totalTime = getNanoTime() - totalStart;
    return { tokens, rawTokens, ast, output, outputType, errors, opcodes, constants, variables, stats, markdownOutline, lineResults };
}
