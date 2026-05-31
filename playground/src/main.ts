import { EditorView, keymap, placeholder, Decoration, WidgetType, ViewUpdate } from '@codemirror/view';
import { EditorState, StateField, RangeSetBuilder, RangeSet, StateEffect } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { SolveHighlightProvider } from '@/app/codemirror/SolveHighlightProvider';
import type { DebugResult, Token, OpcodeInfo, ConstantInfo, PerformanceStats, LineResult, ParseletInfo, VmTraceStep } from './engine.js';
import { exampleData, fullDocumentExamples } from './examples.js';

/* ── DOM Refs ──────────────────────────────────────────────────── */
const $ = (id: string) => document.getElementById(id) as HTMLElement;
const statusIndicator = $('status-indicator');
const pipelineMini = $('pipeline-mini');
const pipelineTiming = $('pipeline-timing');
const footerStatus = $('footer-status');
const footerExpression = $('footer-expression');
const sidebar = $('sidebar');
const editorContainer = $('editor-container');
const examplesSidebar = $('examples-sidebar');
const fullDocSelect = $('full-doc-select') as HTMLSelectElement;

const lineResultsDisplay = $('line-results-display');
const tokensDisplay = $('tokens-display');
const opcodesDisplay = $('opcodes-display');
const constantsDisplay = $('constants-display');
const variablesDisplay = $('variables-display');
const errorsDisplay = $('errors-display');
const statsDisplay = $('stats-display');
const tokenCount = $('token-count');
const bytecodeCount = $('bytecode-count');
const groupTokensCheckbox = $('group-tokens') as HTMLInputElement;

const flowLexerOutput = $('flow-lexer-output');
const flowParserOutput = $('flow-parser-output');
const flowCompilerOutput = $('flow-compiler-output');
const flowVmOutput = $('flow-vm-output');
const flowResultOutput = $('flow-result-output');
const flowTimeLexer = $('flow-time-lexer');
const flowTimeParser = $('flow-time-parser');
const flowTimeCompiler = $('flow-time-compiler');
const flowTimeVm = $('flow-time-vm');
const flowTimeTotal = $('flow-time-total');
const detailTokens = $('detail-tokens');
const detailOpcodes = $('detail-opcodes');
const detailNumbers = $('detail-numbers');
const detailStrings = $('detail-strings');
const detailCache = $('detail-cache');
const detailAsync = $('detail-async');
const perfHistoryChart = $('perf-history-chart');
const vmtraceDisplay = $('vmtrace-display');
const vmtraceCount = $('vmtrace-count');

/* Worker telemetry DOM refs */
const workerEngineStatus = $('worker-engine-status');
const workerEngineLatency = $('worker-engine-latency');
const workerEngineQueue = $('worker-engine-queue');
const workerEngineLastRun = $('worker-engine-last-run');
const workerEngineLatencyBar = $('worker-engine-latency-bar');
const workerEngineMsgs = $('worker-engine-msgs');
const workerDqStatus = $('worker-dq-status');
const workerDqActive = $('worker-dq-active');
const workerDqSources = $('worker-dq-sources');
const workerDqLastActivity = $('worker-dq-last-activity');
const workerDqFetches = $('worker-dq-fetches');
const workerLogEntries = $('worker-log-entries');

const highlightProvider = new SolveHighlightProvider();

let runId = 0;
let currentResult: DebugResult | null = null;
const statsHistory: PerformanceStats[] = [];
const MAX_HISTORY = 50;

/* ── Worker Telemetry State ────────────────────────────────────── */
let engineMsgCount = 0;
let engineQueueDepth = 0;
let engineLastRunTime = 0;
let engineRoundTripTimes: number[] = [];
const MAX_RTT_HISTORY = 20;
let dqActiveRequests = 0;
let dqFetches = 0;
let dqSources = 0;
let dqLastActivityTs = 0;
interface WorkerLogEntry { ts: number; source: 'engine' | 'dataquery'; msg: string; error?: boolean; }
const workerLog: WorkerLogEntry[] = [];
const MAX_LOG_ENTRIES = 100;

/* ── Workers ───────────────────────────────────────────────────── */
const engineWorker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
engineWorker.onmessage = (e: MessageEvent<{ id: number; result?: DebugResult; error?: string }>) => {
    const { id, result, error } = e.data;
    if (id !== runId) {
        /* stale response — still count for telemetry */
        engineMsgCount++;
        engineQueueDepth = Math.max(0, engineQueueDepth - 1);
        updateEngineWorkerTelemetry();
        return;
    }

    const rtt = performance.now() - engineLastRunTime;
    engineRoundTripTimes.push(rtt);
    if (engineRoundTripTimes.length > MAX_RTT_HISTORY) engineRoundTripTimes.shift();
    engineMsgCount++;
    engineQueueDepth = Math.max(0, engineQueueDepth - 1);

    setStatus('ready');
    logWorkerActivity('engine', error ? `Error: ${error}` : `Completed in ${fmt(result?.stats?.totalTime ?? 0)}`);
    updateEngineWorkerTelemetry();

    if (error) {
        logWorkerActivity('engine', error, true);
        renderErrors([error]);
        return;
    }
    if (!result) return;
    currentResult = result;
    renderAll(result);
};

/* ── Inline Widget ─────────────────────────────────────────────── */
class ResultWidget extends WidgetType {
    constructor(readonly text: string, readonly type: string) { super(); }
    toDOM() {
        const span = document.createElement('span');
        span.className = 'os-result-inline';
        span.textContent = '\u2192 ' + this.text;
        span.title = this.type;
        return span;
    }
}

const resultEffect = StateEffect.define<{ from: number; to: number; deco: Decoration }[]>();
const resultField = StateField.define<RangeSet<Decoration>>({
    create() { return Decoration.none; },
    update(set, tr) {
        for (const e of tr.effects) {
            if (e.is(resultEffect)) {
                const builder = new RangeSetBuilder<Decoration>();
                for (const { from, to, deco } of e.value) builder.add(from, to, deco);
                return builder.finish();
            }
        }
        return set.map(tr.changes);
    },
    provide: f => EditorView.decorations.from(f),
});

const solveHighlightPlugin = StateField.define<RangeSet<Decoration>>({
    create(state) {
        const builder = new RangeSetBuilder<Decoration>();
        const doc = state.doc;
        for (let i = 1; i <= doc.lines; i++) {
            const line = doc.line(i);
            for (const range of highlightProvider.getLineHighlights(line.text, i)) {
                builder.add(line.from + range.from, line.from + range.to, Decoration.mark({ class: range.className }));
            }
        }
        return builder.finish();
    },
    update(decorations, tr) {
        if (!tr.docChanged) return decorations;
        const builder = new RangeSetBuilder<Decoration>();
        const doc = tr.state.doc;
        for (let i = 1; i <= doc.lines; i++) {
            const line = doc.line(i);
            for (const range of highlightProvider.getLineHighlights(line.text, i)) {
                builder.add(line.from + range.from, line.from + range.to, Decoration.mark({ class: range.className }));
            }
        }
        return builder.finish();
    },
    provide: f => EditorView.decorations.from(f),
});

/* ── Editor ────────────────────────────────────────────────────── */
const editor = new EditorView({
    state: EditorState.create({
        doc: '',
        extensions: [
            basicSetup, markdown(), oneDark, solveHighlightPlugin, resultField,
            placeholder('Enter an expression\u2026  e.g. 10 + 5 * 2'),
            EditorView.updateListener.of((update: ViewUpdate) => {
                if (update.docChanged) run();
            }),
            keymap.of([{ key: 'Ctrl-Enter', run: () => { run(); return true; } }]),
            EditorView.theme({ '&': { height: '100%' }, '.cm-scroller': { overflow: 'auto' } }),
        ],
    }),
    parent: editorContainer,
});

/* ── Tab Navigation ────────────────────────────────────────────── */
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = (btn as HTMLElement).dataset.tab!;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        document.getElementById('panel-' + tab)?.classList.add('active');
    });
});

/* ── Header Buttons ────────────────────────────────────────────── */
$('btn-sidebar-toggle').addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    $('btn-sidebar-toggle').classList.toggle('active');
});

$('btn-collapse-all').addEventListener('click', () => {
    document.querySelectorAll('.flow-stage-body, .example-category-content').forEach(el => {
        (el as HTMLElement).style.display = 'none';
    });
});

$('btn-expand-all').addEventListener('click', () => {
    document.querySelectorAll('.flow-stage-body, .example-category-content').forEach(el => {
        (el as HTMLElement).style.display = '';
    });
    document.querySelectorAll('.example-category-content.collapsed').forEach(el => {
        el.classList.remove('collapsed');
    });
});

groupTokensCheckbox.addEventListener('change', () => {
    if (currentResult) renderTokens(currentResult.rawTokens);
});

/* ── Status ────────────────────────────────────────────────────── */
function setStatus(s: 'ready' | 'busy' | 'error'): void {
    statusIndicator.className = 'status-dot status-' + s;
    footerStatus.textContent = s === 'ready' ? 'Ready' : s === 'busy' ? 'Evaluating\u2026' : 'Error';
    if (s === 'busy') {
        pipelineMini.classList.add('active');
        pipelineTiming.textContent = '\u2026';
    }
}

/* ── Debounced Run ─────────────────────────────────────────────── */
let runTimeout: ReturnType<typeof setTimeout> | null = null;
function run(): void {
    if (runTimeout) clearTimeout(runTimeout);
    runTimeout = setTimeout(() => {
        const expression = editor.state.doc.toString().trim();
        if (!expression) {
            footerExpression.textContent = 'No expression';
            return;
        }
        highlightProvider.invalidateCache();
        setStatus('busy');
        runId++;
        engineQueueDepth++;
        engineLastRunTime = performance.now();
        footerExpression.textContent = expression.slice(0, 60) + (expression.length > 60 ? '\u2026' : '');
        logWorkerActivity('engine', `Enqueued run #${runId}: ${expression.slice(0, 40)}${expression.length > 40 ? '…' : ''}`);
        updateEngineWorkerTelemetry();
        engineWorker.postMessage({ id: runId, expression });
    }, 150);
}

/* ── Main Render ───────────────────────────────────────────────── */
function renderAll(result: DebugResult): void {
    renderLineResults(result.lineResults);
    renderErrors(result.errors);
    renderTokens(result.rawTokens);
    renderOpcodesDisasm(result.opcodes);
    renderConstants(result.constants);
    renderVariables(result.variables);
    renderStats(result.stats);
    renderPipelineFlow(result);
    renderInlineResults(result.lineResults);
    renderVmTrace(result.vmTrace);
    updateDataQueryWorkerTelemetry();

    pipelineTiming.textContent = fmt(result.stats.totalTime);
    pipelineMini.querySelectorAll('.pipeline-stage').forEach(s => s.classList.add('executed'));
    pipelineMini.classList.remove('active');
    document.querySelectorAll('.flow-stage').forEach(s => s.classList.add('executed'));
}

/* ── Line Results ──────────────────────────────────────────────── */
function renderLineResults(lineResults: LineResult[]): void {
    lineResultsDisplay.innerHTML = '';
    if (lineResults.length === 0) {
        lineResultsDisplay.innerHTML = '<span class="empty">No results</span>';
        return;
    }
    const container = document.createElement('div');
    container.className = 'line-results';
    lineResults.forEach(lr => {
        const row = document.createElement('div');
        row.className = 'line-result-row' + (lr.error ? ' error' : '');
        row.innerHTML =
            '<span class="line-result-num">L' + lr.lineNumber + '</span>' +
            '<span class="line-result-expr">' + escHtml(lr.expression) + '</span>' +
            '<span class="line-result-parselet">' + escHtml(lr.parselet) + '</span>' +
            '<span class="line-result-type">' + escHtml(lr.type) + '</span>' +
            '<span class="line-result-value">' + (lr.error ? escHtml(lr.error) : escHtml(lr.result)) + '</span>';
        container.appendChild(row);
    });
    lineResultsDisplay.appendChild(container);
}

function renderInlineResults(lineResults: LineResult[]): void {
    const effects: { from: number; to: number; deco: Decoration }[] = [];
    for (const lr of lineResults) {
        if (!lr.result || lr.error) continue;
        const line = editor.state.doc.line(lr.lineNumber);
        effects.push({ from: line.to, to: line.to, deco: Decoration.widget({ widget: new ResultWidget(lr.result, lr.type), side: 1 }) });
    }
    if (effects.length > 0) editor.dispatch({ effects: resultEffect.of(effects) });
}

/* ── Tokens ────────────────────────────────────────────────────── */
function renderTokens(tokens: Token[]): void {
    tokensDisplay.innerHTML = '';
    tokenCount.textContent = tokens.length + ' tokens';

    if (tokens.length === 0) {
        tokensDisplay.innerHTML = '<span class="empty">No tokens</span>';
        return;
    }

    const groupByLine = groupTokensCheckbox.checked;
    if (groupByLine) {
        const lines = new Map<number, Token[]>();
        for (const t of tokens) {
            if (t.type === 'WS' || t.type === 'NEWLINE') continue;
            const ln = t.line || 1;
            if (!lines.has(ln)) lines.set(ln, []);
            lines.get(ln)!.push(t);
        }
        const wrapper = document.createElement('div');
        Array.from(lines.entries()).sort((a, b) => a[0] - b[0]).forEach(([ln, lineTokens]) => {
            const group = document.createElement('div');
            group.className = 'token-line-group';
            group.innerHTML = '<div class="token-line-header">Line ' + ln + '</div>';
            const content = document.createElement('div');
            content.className = 'token-line-content';
            lineTokens.forEach(t => {
                const span = document.createElement('span');
                span.className = 'token token-' + t.type.toLowerCase();
                span.textContent = t.value;
                span.title = 'Type: ' + t.type + '\nValue: ' + t.value + '\nPos: ' + t.offset;
                content.appendChild(span);
            });
            group.appendChild(content);
            wrapper.appendChild(group);
        });
        tokensDisplay.appendChild(wrapper);
    } else {
        const container = document.createElement('div');
        container.className = 'token-list';
        tokens.forEach(t => {
            if (t.type === 'WS' || t.type === 'NEWLINE') return;
            const span = document.createElement('span');
            span.className = 'token token-' + t.type.toLowerCase();
            span.textContent = t.value;
            span.title = 'Type: ' + t.type + '\nValue: ' + t.value + '\nPos: ' + t.offset;
            container.appendChild(span);
        });
        tokensDisplay.appendChild(container);
    }
}

/* ── Bytecode Disassembly ──────────────────────────────────────── */
function renderOpcodesDisasm(opcodes: OpcodeInfo[]): void {
    opcodesDisplay.innerHTML = '';
    bytecodeCount.textContent = opcodes.length + ' opcodes';

    if (opcodes.length === 0) {
        opcodesDisplay.innerHTML = '<span class="empty">No opcodes</span>';
        return;
    }

    opcodes.forEach((op, i) => {
        const row = document.createElement('div');
        row.className = 'opcode-row';
        const hex = '0x' + op.value.toString(16).toUpperCase().padStart(2, '0');
        const operand = op.args.length > 0 ? op.args.join(', ') : '\u2014';
        const desc = describeOpcode(op.value, op.args);
        row.innerHTML =
            '<span class="opcode-col-ip">' + i + '</span>' +
            '<span class="opcode-col-hex">' + hex + '</span>' +
            '<span class="opcode-col-mnem">' + escHtml(op.name) + '</span>' +
            '<span class="opcode-col-operand">' + operand + '</span>' +
            '<span class="opcode-col-desc">' + desc + '</span>';
        opcodesDisplay.appendChild(row);
    });
}

function describeOpcode(op: number, args: number[]): string {
    if (op >= 10 && op <= 15) return 'Push: ' + describePush(op);
    if (op >= 20 && op <= 27) return describeArith(op) + ' \u2192 stack';
    if (op === 1) return 'Halt';
    if (op === 2) return 'Swap top 2';
    if (op === 3) return 'Dup top';
    if (op === 50) return 'Call plugin fn[' + (args[0] ?? '?') + ']';
    if (op === 51) return 'Call builtin fn[' + (args[0] ?? '?') + ']';
    if (op === 60) return 'Load var[' + (args[0] ?? '?') + '] \u2192 stack';
    if (op === 61) return 'Store \u2192 var[' + (args[0] ?? '?') + ']';
    if (op === 200) return 'Plugin custom handler';
    return 'Op ' + op;
}

function describePush(op: number): string {
    switch (op) { case 10: return 'number'; case 11: return 'bigint'; case 12: return 'hex'; case 13: return 'string'; case 14: return 'boolean'; case 15: return 'variable'; default: return '?'; }
}

function describeArith(op: number): string {
    switch (op) { case 20: return 'Add'; case 21: return 'Sub'; case 22: return 'Mul'; case 23: return 'Div'; case 24: return 'Mod'; case 25: return 'Exp'; case 26: return 'Neg'; case 27: return 'Pos'; default: return '?'; }
}

/* ── Constants ─────────────────────────────────────────────────── */
function renderConstants(constants: ConstantInfo[]): void {
    constantsDisplay.innerHTML = '';
    if (constants.length === 0) {
        constantsDisplay.innerHTML = '<span class="empty">No constants</span>';
        return;
    }
    constants.forEach(c => {
        const chip = document.createElement('span');
        chip.className = 'constant-chip ' + c.type;
        chip.textContent = String(c.type === 'string' ? '"' + c.value + '"' : c.value);
        chip.title = 'Index: ' + c.index + '\nType: ' + c.type;
        constantsDisplay.appendChild(chip);
    });
}

/* ── Variables ─────────────────────────────────────────────────── */
function renderVariables(variables: string[]): void {
    variablesDisplay.innerHTML = '';
    if (variables.length === 0) {
        variablesDisplay.innerHTML = '<span class="empty">No variables</span>';
        return;
    }
    variables.forEach(v => {
        const chip = document.createElement('span');
        chip.className = 'variable-chip';
        chip.textContent = ':' + v;
        chip.title = 'Variable: :' + v;
        variablesDisplay.appendChild(chip);
    });
}

/* ── Errors ────────────────────────────────────────────────────── */
function renderErrors(errors: string[]): void {
    errorsDisplay.innerHTML = '';
    if (errors.length === 0) {
        errorsDisplay.innerHTML = '<div class="no-errors">\u2713 No errors</div>';
        return;
    }
    errors.forEach(err => {
        const div = document.createElement('div');
        div.className = 'error-item';
        div.textContent = err;
        errorsDisplay.appendChild(div);
    });
}

/* ── Performance ───────────────────────────────────────────────── */
function renderStats(stats: PerformanceStats): void {
    statsHistory.push({ ...stats });
    if (statsHistory.length > MAX_HISTORY) statsHistory.shift();

    statsDisplay.innerHTML = '';

    const cards: { label: string; key: keyof PerformanceStats; color: string; icon: string }[] = [
        { label: 'Lexer', key: 'lexerTime', color: '#5ac8fa', icon: '#5ac8fa' },
        { label: 'Parser', key: 'parserTime', color: '#9b7bec', icon: '#9b7bec' },
        { label: 'Compiler', key: 'bytecodeTime', color: '#4ec9b0', icon: '#4ec9b0' },
        { label: 'VM Execute', key: 'executionTime', color: '#ffd866', icon: '#ffd866' },
        { label: 'Total', key: 'totalTime', color: '#29ce99', icon: '#29ce99' },
    ];

    cards.forEach(card => {
        const div = document.createElement('div');
        div.className = 'stat-card';
        const vals = statsHistory.map(s => s[card.key]);
        const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        const sparkline = vals.length >= 2 ? renderSparklineSvg(vals, card.color) : '';
        div.innerHTML =
            '<div class="stat-card-header"><span class="stat-card-label">' + card.label + '</span>' +
            '<span class="stat-card-icon" style="background:' + card.icon + '"></span></div>' +
            '<div class="stat-card-value" style="color:' + card.color + '">' + fmt(stats[card.key]) + '</div>' +
            '<div class="stat-card-avg" style="color:' + card.color + '">avg ' + fmt(avg) + '</div>' +
            (sparkline ? '<div class="stat-card-spark">' + sparkline + '</div>' : '');
        statsDisplay.appendChild(div);
    });

    renderPerfHistory();
}

function renderPerfHistory(): void {
    perfHistoryChart.innerHTML = '';
    if (statsHistory.length < 2) return;
    const maxTotal = Math.max(...statsHistory.map(s => s.totalTime), 1);
    statsHistory.slice(-50).forEach(s => {
        const bar = document.createElement('div');
        const h = Math.max(2, (s.totalTime / maxTotal) * 48);
        bar.style.cssText = 'width:3px;height:' + h + 'px;background:#29ce99;border-radius:1px;opacity:' + (0.3 + (s.totalTime / maxTotal) * 0.7);
        bar.title = fmt(s.totalTime);
        perfHistoryChart.appendChild(bar);
    });
}

function renderSparklineSvg(values: number[], color: string): string {
    if (values.length < 2) return '';
    const w = 120, h = 28;
    const max = Math.max(...values, 1);
    const pts = values.map((v, i) => (i / (values.length - 1)) * w + ',' + (h - (v / max) * h)).join(' ');
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const avgY = h - (avg / max) * h;
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" style="display:block">' +
        '<polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="1.2" stroke-linecap="round"/>' +
        '<line x1="0" y1="' + avgY + '" x2="' + w + '" y2="' + avgY + '" stroke="' + color + '" stroke-width="0.5" stroke-dasharray="2,2" opacity="0.4"/>' +
        '</svg>';
}

/* ── Pipeline Flow ─────────────────────────────────────────────── */
function renderPipelineFlow(result: DebugResult): void {
    const s = result.stats;

    flowTimeLexer.textContent = fmt(s.lexerTime);
    flowTimeParser.textContent = fmt(s.parserTime);
    flowTimeCompiler.textContent = fmt(s.bytecodeTime);
    flowTimeVm.textContent = fmt(s.executionTime);
    flowTimeTotal.textContent = fmt(s.totalTime);

    const firstTokens = result.rawTokens.slice(0, 8);
    flowLexerOutput.innerHTML = firstTokens.length > 0
        ? firstTokens.map(t => '<span class="token token-' + t.type.toLowerCase() + '" style="font-size:9px;cursor:default">' + escHtml(t.value) + '</span>').join(' ')
        : '<span class="empty">\u2014</span>';

    const parseletNames = [...new Set(result.parselets?.map((p: ParseletInfo) => p.parseletType) ?? [])];
    flowParserOutput.innerHTML = parseletNames.length > 0
        ? parseletNames.map((p: string) => '<span class="token token-keyword" style="font-size:9px;cursor:default">' + escHtml(p) + '</span>').join(' ')
        : '<span class="empty">\u2014</span>';

    const opcodeNames = [...new Set(result.opcodes.map(o => o.name))].slice(0, 4);
    flowCompilerOutput.innerHTML = opcodeNames.length > 0
        ? opcodeNames.map(n => '<span class="token token-func" style="font-size:9px;cursor:default">' + escHtml(n) + '</span>').join(' ')
        : '<span class="empty">\u2014</span>';

    const firstResult = result.lineResults[0];
    flowVmOutput.innerHTML = firstResult
        ? '<span style="color:#29ce99;font-size:10px">' + (firstResult.error ? 'Error' : firstResult.type) + '</span>'
        : '<span class="empty">\u2014</span>';

    const lastResult = result.lineResults[result.lineResults.length - 1];
    flowResultOutput.innerHTML = lastResult
        ? '<span style="color:' + (lastResult.error ? '#f48771' : '#29ce99') + '">' + escHtml(lastResult.error || lastResult.result) + '</span>'
        : '<span class="empty">\u2014</span>';

    detailTokens.textContent = String(result.rawTokens.length);
    detailOpcodes.textContent = String(result.opcodes.length);
    detailNumbers.textContent = String(result.constants.filter(c => c.type === 'number').length);
    detailStrings.textContent = String(result.constants.filter(c => c.type === 'string').length);
    detailCache.textContent = 'n/a';
    detailAsync.textContent = result.lineResults.some(lr => lr.type === 'Pending') ? 'yes' : 'no';
}

/* ── Utils ─────────────────────────────────────────────────────── */
function fmt(ns: number): string {
    if (ns < 1_000) return ns.toFixed(0) + ' ns';
    if (ns < 1_000_000) return (ns / 1_000).toFixed(1) + ' \u00b5s';
    if (ns < 1_000_000_000) return (ns / 1_000_000).toFixed(2) + ' ms';
    return (ns / 1_000_000_000).toFixed(3) + ' s';
}

function escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── Sidebar ───────────────────────────────────────────────────── */
function renderExamplesSidebar(): void {
    examplesSidebar.innerHTML = '';
    exampleData.forEach(category => {
        const catEl = document.createElement('div');
        catEl.className = 'example-category';

        const header = document.createElement('div');
        header.className = 'example-category-header';
        header.innerHTML = '<span class="category-name">' + escHtml(category.name) + '</span><span class="category-toggle">\u25b6</span>';

        const content = document.createElement('div');
        content.className = 'example-category-content collapsed';

        category.examples.forEach(ex => {
            const item = document.createElement('div');
            item.className = 'example-item';
            item.innerHTML =
                '<div class="example-name">' + escHtml(ex.name) + '</div>' +
                '<div class="example-expression">' + escHtml(ex.expression) + '</div>' +
                '<div class="example-description">' + escHtml(ex.description) + '</div>';
            item.addEventListener('click', () => {
                editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: ex.expression } });
            });
            content.appendChild(item);
        });

        header.addEventListener('click', () => {
            content.classList.toggle('collapsed');
            header.querySelector('.category-toggle')!.textContent = content.classList.contains('collapsed') ? '\u25b6' : '\u25bc';
        });

        catEl.appendChild(header);
        catEl.appendChild(content);
        examplesSidebar.appendChild(catEl);
    });
}

function populateFullDocExamples(): void {
    fullDocumentExamples.forEach(doc => {
        const option = document.createElement('option');
        option.value = doc.content;
        option.textContent = doc.name;
        fullDocSelect.appendChild(option);
    });
    fullDocSelect.addEventListener('change', () => {
        if (fullDocSelect.value) {
            editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: fullDocSelect.value } });
            fullDocSelect.value = '';
        }
    });
}

/* ── VM Trace ──────────────────────────────────────────────────── */
function renderVmTrace(steps: VmTraceStep[]): void {
    vmtraceDisplay.innerHTML = '';
    vmtraceCount.textContent = steps.length + ' steps';

    if (steps.length === 0) {
        vmtraceDisplay.innerHTML = '<span class="empty">No trace data — enable vmTraceEnabled mode</span>';
        return;
    }

    const maxStackDepth = Math.max(...steps.map(s => s.stackDepth), 1);

    steps.forEach((step, i) => {
        const row = document.createElement('div');
        const isLast = i === steps.length - 1;
        row.className = 'vm-trace-row' + (isLast ? ' halt' : '');

        const barPct = Math.max(2, (step.stackDepth / Math.max(maxStackDepth, 1)) * 100);
        const timeStr = step.elapsedNs < 1_000
            ? step.elapsedNs.toFixed(0) + 'ns'
            : (step.elapsedNs / 1_000).toFixed(1) + 'µs';

        row.innerHTML =
            '<span class="vm-trace-col-step">' + step.instructionNumber + '</span>' +
            '<span class="vm-trace-col-ip">' + step.ip + '</span>' +
            '<span class="vm-trace-col-op" title="Opcode 0x' + step.opcode.toString(16).toUpperCase().padStart(2, '0') + '">' + escHtml(step.opcodeName) + '</span>' +
            '<span class="vm-trace-col-stack">' +
                '<span class="vm-trace-stack-bar" style="width:' + barPct + '%"></span>' +
                '<span class="vm-trace-stack-depth">' + step.stackDepth + '</span>' +
            '</span>' +
            '<span class="vm-trace-col-time">' + timeStr + '</span>';
        vmtraceDisplay.appendChild(row);
    });
}

/* ── Worker Telemetry ──────────────────────────────────────────── */
function logWorkerActivity(source: 'engine' | 'dataquery', msg: string, isError = false): void {
    workerLog.push({ ts: Date.now(), source, msg, error: isError });
    if (workerLog.length > MAX_LOG_ENTRIES) workerLog.shift();

    /* deduplicate consecutive identical entries */
    if (workerLog.length >= 2) {
        const prev = workerLog[workerLog.length - 2];
        const last = workerLog[workerLog.length - 1];
        if (prev.source === last.source && prev.msg === last.msg) {
            /* first duplicate — append counter */
            prev.msg = last.msg + ' (×2)';
            workerLog.pop();
            return;
        }
        /* already has counter — increment it */
        const counterMatch = prev.msg.match(/\s+\(×(\d+)\)$/);
        if (counterMatch && prev.source === last.source &&
            prev.msg.slice(0, counterMatch.index!) === last.msg) {
            const count = parseInt(counterMatch[1]) + 1;
            prev.msg = last.msg + ` (×${count})`;
            workerLog.pop();
            return;
        }
    }

    renderWorkerLog();
}

function renderWorkerLog(): void {
    workerLogEntries.innerHTML = '';
    if (workerLog.length === 0) {
        workerLogEntries.innerHTML = '<span class="empty">No worker activity yet</span>';
        return;
    }
    const entries = workerLog.slice(-30);
    for (const entry of entries) {
        const row = document.createElement('div');
        row.className = 'worker-log-entry';
        const time = new Date(entry.ts);
        const timeStr = time.getHours().toString().padStart(2, '0') + ':' +
            time.getMinutes().toString().padStart(2, '0') + ':' +
            time.getSeconds().toString().padStart(2, '0') + '.' +
            time.getMilliseconds().toString().padStart(3, '0');
        row.innerHTML =
            '<span class="worker-log-time">' + timeStr + '</span>' +
            '<span class="worker-log-source ' + entry.source + '">' + entry.source + '</span>' +
            '<span class="worker-log-msg' + (entry.error ? ' error' : '') + '">' + escHtml(entry.msg) + '</span>';
        workerLogEntries.appendChild(row);
    }
    workerLogEntries.scrollTop = workerLogEntries.scrollHeight;
}

function updateEngineWorkerTelemetry(): void {
    const status = engineQueueDepth > 0 ? 'busy' : 'idle';
    workerEngineStatus.textContent = status;
    workerEngineStatus.className = 'worker-card-status' + (status === 'busy' ? ' status-busy' : '');

    /* round-trip latency */
    if (engineRoundTripTimes.length > 0) {
        const avg = engineRoundTripTimes.reduce((a, b) => a + b, 0) / engineRoundTripTimes.length;
        workerEngineLatency.textContent = avg < 1 ? '<1 ms' : avg.toFixed(1) + ' ms';
    } else {
        workerEngineLatency.textContent = '—';
    }

    /* queue depth */
    workerEngineQueue.textContent = String(engineQueueDepth);

    /* last run timestamp */
    if (engineLastRunTime > 0) {
        const ago = Date.now() - engineLastRunTime;
        workerEngineLastRun.textContent = ago < 60_000
            ? (ago < 1_000 ? '<1s ago' : (ago / 1_000).toFixed(0) + 's ago')
            : (ago / 60_000).toFixed(0) + 'm ago';
    } else {
        workerEngineLastRun.textContent = '—';
    }

    /* latency bar — latest RTT as percentage of 100ms threshold */
    const latestRtt = engineRoundTripTimes[engineRoundTripTimes.length - 1] ?? 0;
    const pct = Math.min(100, latestRtt);
    workerEngineLatencyBar.style.width = Math.max(1, pct) + '%';
    workerEngineLatencyBar.className = 'worker-latency-fill' +
        (latestRtt > 50 ? ' slow' : latestRtt > 25 ? ' warn' : '');

    /* message count */
    workerEngineMsgs.textContent = String(engineMsgCount);
}

function updateDataQueryWorkerTelemetry(): void {
    const hasData = dqFetches > 0 || dqActiveRequests > 0 || dqSources > 0;
    workerDqStatus.textContent = hasData ? 'active' : 'inactive';
    workerDqStatus.className = 'worker-card-status' + (hasData ? '' : ' status-offline');

    workerDqActive.textContent = String(dqActiveRequests);
    workerDqSources.textContent = String(dqSources);
    if (dqLastActivityTs > 0) {
        const ago = Date.now() - dqLastActivityTs;
        workerDqLastActivity.textContent = ago < 60_000
            ? (ago < 1_000 ? '<1s ago' : (ago / 1_000).toFixed(0) + 's ago')
            : (ago / 60_000).toFixed(0) + 'm ago';
    } else {
        workerDqLastActivity.textContent = '—';
    }
    workerDqFetches.textContent = String(dqFetches);
}

/* ── Init ──────────────────────────────────────────────────────── */
renderExamplesSidebar();
populateFullDocExamples();
editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: '10 + 5 * 2' } });
