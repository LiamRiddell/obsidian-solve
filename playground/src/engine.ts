import { ExpressionLexer } from '@/engine/lexer/ExpressionLexer';
import { Parser } from '@/engine/parser/Parser';
import { ParseletRegistry } from '@/engine/parser/registry/ParseletRegistry';
import { BytecodeBuilder } from '@/engine/parser/BytecodeBuilder';
import { createVM, executeBytecode } from '@/engine/vm/VM';
import { sharedOpRegistry } from '@/engine/vm/OpRegistry';
import { OpCode } from '@/engine/parser/OpCode';
import { Value, ValueType } from '@/engine/vm/Value';
import type { Token } from '@/engine/lexer/Token';
import type { BytecodeProgram } from '@/engine/parser/BytecodeBuilder';

import { registerArithmeticParselets } from '@/providers/arithmetic/parselets/index';
import { registerPercentageParselets } from '@/providers/percentage/parselets/index';
import { registerFunctionParselets } from '@/providers/function/parselets/index';
import { registerDatetimeParselets } from '@/providers/datetime/parselets/index';
import { registerDiceParselets } from '@/providers/dice/parselets/index';
import { registerVariableParselets } from '@/providers/variables/parselets/index';
import { registerUomParselets } from '@/providers/uom/parselets/index';
import { registerVectorParselets } from '@/providers/vector/parselets/index';
import { registerBigIntParselets } from '@/providers/biginteger/parselets/index';

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
export interface MarkdownNode { id: string; type: string; content: string; children: MarkdownNode[]; hasRun: boolean; depth: number; result?: string; }

let registryCache: ParseletRegistry | null = null;

function getRegistry(): ParseletRegistry {
    if (!registryCache) {
        registryCache = new ParseletRegistry();
        registerArithmeticParselets(registryCache);
        registerPercentageParselets(registryCache);
        registerFunctionParselets(registryCache);
        registerDatetimeParselets(registryCache);
        registerDiceParselets(registryCache);
        registerVariableParselets(registryCache);
        registerUomParselets(registryCache);
        registerVectorParselets(registryCache);
        registerBigIntParselets(registryCache);
    }
    return registryCache;
}

function getOpCodeName(value: number): string {
    for (const [key, val] of Object.entries(OpCode)) {
        if (val === value) return key;
    }
    return `UNKNOWN_${value}`;
}

function getNanoTime(): number {
    if (typeof performance !== 'undefined' && performance.now) return performance.now() * 1_000_000;
    return Date.now() * 1_000_000;
}

function formatValue(val: Value): string {
    switch (val.type) {
        case ValueType.Number: return String(val.value);
        case ValueType.BigInt: return String(val.value) + 'n';
        case ValueType.String: return String(val.value);
        case ValueType.Datetime: return new Date(val.value as number).toISOString();
        case ValueType.Percentage: return `${val.value}%`;
        case ValueType.Uom: return `${val.value} ${val.unit}`;
        case ValueType.Hex: return `0x${(val.value as number).toString(16)}`;
        case ValueType.Boolean: return String(val.value);
        case ValueType.Vector2:
        case ValueType.Vector3:
        case ValueType.Vector4: return `[${(val.value as number[]).join(', ')}]`;
        default: return String(val.value);
    }
}

function formatType(val: Value): string {
    const typeNames: Record<number, string> = {
        0: 'Number', 1: 'Hex', 2: 'BigInt', 3: 'String',
        4: 'Datetime', 5: 'Percentage', 6: 'Timespan',
        7: 'Vector2', 8: 'Vector3', 9: 'Vector4',
        10: 'Boolean', 11: 'Unit'
    };
    const t = typeNames[val.type] ?? 'Value';
    return val.unit ? `${t} (${val.unit})` : t;
}

function detectParselet(tokens: Token[]): string {
    for (const t of tokens) {
        if (t.type === 'PERCENT') return 'Percentage';
        if (t.type === 'UNIT') return 'UoM';
        if (t.type === 'CONVERT' || t.type === 'TO' || t.type === 'BEST') return 'UoM';
        if (t.type === 'FUNC') return 'Function';
        if (t.type === 'ROLL') return 'Dice';
        if (t.type === 'NOW' || t.type === 'TODAY' || t.type === 'TOMORROW' || t.type === 'YESTERDAY' || t.type === 'DURATION_DAY' || t.type === 'DURATION_WEEK' || t.type === 'DURATION_MONTH' || t.type === 'DURATION_YEAR' || t.type === 'DURATION_HOUR' || t.type === 'DURATION_MINUTE' || t.type === 'DURATION_SECOND') return 'Date/Time';
        if (t.type === 'VEC2' || t.type === 'VEC3' || t.type === 'VEC4') return 'Vector';
        if (t.type === 'BIGINT') return 'BigInt';
        if (t.type === 'COLON' || t.type === 'EQUALS') return 'Variable';
        if (t.type === 'INCREASE' || t.type === 'DECREASE' || t.type === 'INCREASE_BY' || t.type === 'DECREASE_BY') return 'Percentage';
    }
    if (tokens.some(t => t.type === 'NUMBER')) return 'Arithmetic';
    if (tokens.some(t => t.type === 'PI' || t.type === 'E')) return 'Arithmetic';
    return 'Expression';
}

function executeLine(expression: string, registry: ParseletRegistry, varValues: Map<string, Value>): { result?: Value; error?: string; tokens?: Token[] } {
    try {
        const lexer = new ExpressionLexer();
        lexer.reset(expression);
        const raw: Token[] = [];
        let tok = lexer.next();
        while (tok) { raw.push(tok); tok = lexer.next(); }
        const tokens = raw.filter(t => t.type !== 'WS' && t.type !== 'NEWLINE');
        if (tokens.length === 0) return { tokens };

        const parser = new Parser(registry);
        parser.load(tokens);
        const builder = new BytecodeBuilder();
        parser.parseExpression(0, builder);
        const prog = builder.build();

        const vm = createVM(sharedOpRegistry);
        for (const [k, v] of varValues) vm.setVar(k, v);

        const bc = { opcodes: new Uint8Array(prog.opcodes), numbers: new Float64Array(prog.numbers), strings: prog.strings };
        const result = executeBytecode(bc, vm);

        const assignIdx = tokens.findIndex(t => t.type === 'EQUALS');
        if (assignIdx > 0) {
            for (let j = 0; j < assignIdx; j++) {
                if (tokens[j] && tokens[j].type === 'COLON' && tokens[j + 1] && tokens[j + 1].type === 'IDENT') {
                    const varName = ':' + tokens[j + 1].value;
                    if (result !== undefined) varValues.set(varName, result);
                    break;
                }
            }
            if (result !== undefined) return { result, tokens };
            const popped = vm.pop();
            if (popped !== undefined) return { result: popped, tokens };
        }

        if (result !== undefined) return { result, tokens };
        const popped = vm.pop();
        if (popped !== undefined) return { result: popped, tokens };
        return { tokens };
    } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
    }
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
        markdownOutline = generateMarkdownOutline(expression);
        const allLines = expression.split('\n');

        const lexerStart = getNanoTime();
        const lexer = new ExpressionLexer();
        lexer.reset(expression);
        let tok = lexer.next();
        while (tok) { rawTokens.push(tok); tok = lexer.next(); }
        tokens = rawTokens.filter(t => t.type !== 'WS' && t.type !== 'NEWLINE');
        stats.lexerTime = getNanoTime() - lexerStart;

        const parserStart = getNanoTime();
        const registry = getRegistry();
        const parser = new Parser(registry);
        parser.load(tokens);
        const builder = new BytecodeBuilder();
        parser.parseExpression(0, builder);
        stats.parserTime = getNanoTime() - parserStart;

        const bytecodeStart = getNanoTime();
        const bytecodeProgram: BytecodeProgram = builder.build();
        ast = JSON.stringify(bytecodeProgram, null, 2);
        stats.bytecodeTime = getNanoTime() - bytecodeStart;

        const opcodeArray = new Uint8Array(bytecodeProgram.opcodes);
        let ip = 0;
        while (ip < opcodeArray.length) {
            const op = opcodeArray[ip];
            const name = getOpCodeName(op);
            const args: number[] = [];
            if (op >= 10 && op <= 15) { if (ip + 1 < opcodeArray.length) args.push(opcodeArray[ip + 1]); }
            else if (op >= 60 && op <= 62) { if (ip + 1 < opcodeArray.length) args.push(opcodeArray[ip + 1]); }
            opcodes.push({ name, value: op, args });
            ip += 1 + args.length;
        }

        const numbers = new Float64Array(bytecodeProgram.numbers);
        const strings = bytecodeProgram.strings;
        numbers.forEach((num, idx) => { constants.push({ type: 'number', value: num, index: idx }); });
        strings.forEach((str, idx) => { constants.push({ type: 'string', value: str, index: idx }); });

        const varTokens = tokens.filter(t => t.type === 'IDENT');
        variables = [...new Set(varTokens.map(t => t.value))];

        const executionStart = getNanoTime();

        const varValues = new Map<string, Value>();
        allLines.forEach((line, idx) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            const lineNum = idx + 1;

            const { result, error, tokens: lineToks } = executeLine(trimmed, registry, varValues);
            const parselet = lineToks ? detectParselet(lineToks) : 'Expression';
            if (result !== undefined) {
                lineResults.push({ lineNumber: lineNum, expression: trimmed, result: formatValue(result), type: formatType(result), parselet });
            } else if (error) {
                lineResults.push({ lineNumber: lineNum, expression: trimmed, result: '', type: 'Error', parselet, error });
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

        stats.executionTime = getNanoTime() - executionStart;
    } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
    }

    stats.totalTime = getNanoTime() - totalStart;
    return { tokens, rawTokens, ast, output, outputType, errors, opcodes, constants, variables, stats, markdownOutline, lineResults };
}