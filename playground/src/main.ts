import { EditorView, keymap, placeholder, Decoration, WidgetType, ViewUpdate } from '@codemirror/view';
import { EditorState, StateField, RangeSetBuilder, RangeSet, StateEffect } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { SolveHighlightProvider } from '@/app/codemirror/SolveHighlightProvider';
import type { DebugResult, Token, OpcodeInfo, ConstantInfo, PerformanceStats, LineStats, LineResult, ParseletInfo, VmTraceStep, DQMetrics } from './engine.js';
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
const flowValidateOutput = $('flow-validate-output');
const flowCacheOutput = $('flow-cache-output');
const flowParserOutput = $('flow-parser-output');
const flowCompilerOutput = $('flow-compiler-output');
const flowAsyncOutput = $('flow-async-output');
const flowVmOutput = $('flow-vm-output');
const flowResultOutput = $('flow-result-output');
const flowTimeLexer = $('flow-time-lexer');
const flowTimeValidate = $('flow-time-validate');
const flowTimeCache = $('flow-time-cache');
const flowTimeParser = $('flow-time-parser');
const flowTimeCompiler = $('flow-time-compiler');
const flowTimeAsync = $('flow-time-async');
const flowTimeVm = $('flow-time-vm');
const flowTimeTotal = $('flow-time-total');
const detailTokens = $('detail-tokens');
const detailOpcodes = $('detail-opcodes');
const detailNumbers = $('detail-numbers');
const detailStrings = $('detail-strings');
const detailCache = $('detail-cache');
const detailAsync = $('detail-async');
const perfFlamegraph = $('perf-flamegraph');
const perfFlamegraphLegend = $('perf-flamegraph-legend');
const perfHeatmap = $('perf-heatmap');
const perfHistoryChart = $('perf-history-chart');
const vmtraceDisplay = $('vmtrace-display');
const vmtraceCount = $('vmtrace-count');
const pipelineLineSelect = $('pipeline-line-select') as HTMLSelectElement;
let pipelineLineListenerAttached = false;

/* Errors bar DOM refs */
const errorsBar = $('errors-bar');
const errorsBarCount = $('errors-bar-count');
const errorsBarHeader = $('errors-bar-header');

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
let selectedPipelineLine: number | null = null;

/* ── Flamegraph Click Filter ──────────────────────────────────── */
let flamegraphFilter: string | null = null;

/* Map flamegraph segment labels to the stat card labels they should highlight.
   Each flamegraph stage corresponds to one or more stat cards. */
const FLAMEGRAPH_TO_CARD_LABELS: Record<string, string[]> = {
    'Lexer':     ['Lexer'],
    'Parser':    ['Parser'],
    'Compile':   ['Compiler'],
    'VM':        ['VM Execute'],
    'Overhead':  ['Validation', 'Cache Check', 'Async Preflight', 'Overhead'],
};

/* Per-line stage timings for multi-line flamegraph */
let currentLineStats: LineStats[] | null = null;

function clearFlamegraphFilter(): void {
    flamegraphFilter = null;
    if (currentResult) renderStats(currentResult.stats, currentLineStats ?? undefined);
}

function setFlamegraphFilter(stageLabel: string): void {
    if (flamegraphFilter === stageLabel) {
        clearFlamegraphFilter();
    } else {
        flamegraphFilter = stageLabel;
        if (currentResult) renderStats(currentResult.stats, currentLineStats ?? undefined);
    }
}

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
                /* Track cursor line for pipeline line selector */
                if (update.selectionSet) {
                    const pos = update.state.selection.main.head;
                    const line = update.state.doc.lineAt(pos);
                    const newLine = line.number;
                    if (newLine !== lastCursorLine) {
                        lastCursorLine = newLine;
                        updatePipelineLineSelection(newLine);
                    }
                }
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

/* ── Pipeline Line Tracking ────────────────────────────────────── */
let lastCursorLine = 1;

function updatePipelineLineSelection(lineNumber: number): void {
    const sel = pipelineLineSelect;
    /* Check if this line number exists as an option */
    for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === String(lineNumber)) {
            sel.value = String(lineNumber);
            selectedPipelineLine = lineNumber;
            return;
        }
    }
    /* Line not in options — fall back to All Lines */
    sel.value = '0';
    selectedPipelineLine = null;
}

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
    currentLineStats = result.lineStats ?? null;
    renderStats(result.stats, result.lineStats);

    renderPipelineLineSelector(result);
    /* After selector is populated, re-apply cursor-driven selection */
    const cursorLine = editor.state.doc.lineAt(editor.state.selection.main.head).number;
    updatePipelineLineSelection(cursorLine);
    renderPipelineFlow(result);

    /* Wire up manual dropdown selection — clicking triggers a full re-render */
    if (!pipelineLineListenerAttached) {
        pipelineLineSelect.addEventListener('change', () => {
            const val = pipelineLineSelect.value;
            selectedPipelineLine = val === '0' ? null : Number(val);
            if (currentResult) renderPipelineFlow(currentResult);
        });
        pipelineLineListenerAttached = true;
    }
    renderInlineResults(result.lineResults);
    renderVmTrace(result.vmTrace);

    /* Update DQ telemetry state from result */
    dqActiveRequests = result.dqMetrics.pendingQueries;
    dqFetches = result.dqMetrics.queryCount;
    dqSources = result.dqMetrics.dataSources;
    dqLastActivityTs = Date.now();
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

/* ── Errors Bar Toggle ──────────────────────────────────────────── */
errorsBarHeader.addEventListener('click', () => {
    const isCollapsed = errorsBar.classList.contains('collapsed');
    if (isCollapsed) {
        errorsBar.classList.remove('collapsed');
    } else {
        errorsBar.classList.add('collapsed');
    }
});

/* ── Errors ────────────────────────────────────────────────────── */
function renderErrors(errors: string[]): void {
    errorsDisplay.innerHTML = '';
    errorsBarCount.textContent = String(errors.length);
    errorsBarCount.classList.toggle('has-errors', errors.length > 0);

    if (errors.length === 0) {
        errorsDisplay.innerHTML = '<div class="no-errors">\u2713 No errors</div>';
        return;
    }

    /* Auto-expand the errors bar when errors arrive */
    errorsBar.classList.remove('collapsed');

    errors.forEach(err => {
        const div = document.createElement('div');
        div.className = 'error-item';
        div.textContent = err;
        errorsDisplay.appendChild(div);
    });
}

/* ── Performance ───────────────────────────────────────────────── */

/* Map display labels to PerformanceStats property names for sparkline lookup */
const STAT_LABEL_TO_KEY: Record<string, keyof PerformanceStats> = {
    'Lexer': 'lexerTime',
    'Parser': 'parserTime',
    'Compiler': 'bytecodeTime',
    'VM Execute': 'executionTime',
    'Total': 'totalTime',
};

/* Stages with real diagnostic timestamps vs overhead */
const TIMED_KEYS: (keyof PerformanceStats)[] = ['lexerTime', 'parserTime', 'bytecodeTime', 'executionTime'];

function computeOverhead(stats: PerformanceStats): number {
    const sumTimed = TIMED_KEYS.reduce((acc, k) => acc + (stats[k] || 0), 0);
    return Math.max(0, stats.totalTime - sumTimed);
}

function renderStats(stats: PerformanceStats, lineStats?: LineStats[]): void {
    statsHistory.push({ ...stats });
    if (statsHistory.length > MAX_HISTORY) statsHistory.shift();

    renderFlamegraph(stats, lineStats);
    renderPipelineHeatmap();
    statsDisplay.innerHTML = '';

    const overhead = computeOverhead(stats);

    const cardEntries: { label: string; value: number; color: string; icon: string; isOverhead?: boolean }[] = [
        { label: 'Lexer', value: stats.lexerTime, color: '#5ac8fa', icon: '#5ac8fa' },
        { label: 'Validation', value: overhead, color: '#dcdcaa', icon: '#dcdcaa', isOverhead: true },
        { label: 'Cache Check', value: overhead, color: '#569cd6', icon: '#569cd6', isOverhead: true },
        { label: 'Parser', value: stats.parserTime, color: '#9b7bec', icon: '#9b7bec' },
        { label: 'Compiler', value: stats.bytecodeTime, color: '#4ec9b0', icon: '#4ec9b0' },
        { label: 'Async Preflight', value: overhead, color: '#ce9178', icon: '#ce9178', isOverhead: true },
        { label: 'VM Execute', value: stats.executionTime, color: '#ffd866', icon: '#ffd866' },
        { label: 'Overhead', value: overhead, color: '#6b6b75', icon: '#6b6b75', isOverhead: true },
        { label: 'Total', value: stats.totalTime, color: '#29ce99', icon: '#29ce99' },
    ];

    const activeFilter = flamegraphFilter;
    const visibleCardLabels = activeFilter ? FLAMEGRAPH_TO_CARD_LABELS[activeFilter] ?? [] : null;

    cardEntries.forEach(card => {
        const div = document.createElement('div');
        const isDimmed = visibleCardLabels !== null && !visibleCardLabels.includes(card.label);
        const isHighlighted = visibleCardLabels !== null && visibleCardLabels.includes(card.label);
        let cardClass = 'stat-card' + (card.isOverhead ? ' stat-card-overhead' : '');
        if (isDimmed) cardClass += ' stat-card-dimmed';
        if (isHighlighted) cardClass += ' stat-card-highlighted';
        div.className = cardClass;
        /* Use proper key lookup for sparkline data */
        const statKey = STAT_LABEL_TO_KEY[card.label];
        const vals = card.isOverhead
            ? statsHistory.map(s => computeOverhead(s))
            : statKey
                ? statsHistory.map(s => s[statKey] || 0)
                : [];
        const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        const sparkline = vals.length >= 2 ? renderSparklineSvg(vals, card.color) : '';

        const displayTime = card.isOverhead && card.label !== 'Overhead'
            ? '<span style="font-size:10px;opacity:0.6">in overhead</span>'
            : fmt(card.value);
        const displayAvg = card.isOverhead && card.label !== 'Overhead'
            ? ''
            : '<div class="stat-card-avg" style="color:' + card.color + '">avg ' + fmt(avg) + '</div>';

        div.innerHTML =
            '<div class="stat-card-header"><span class="stat-card-label">' + card.label + '</span>' +
            '<span class="stat-card-icon" style="background:' + card.icon + '"></span></div>' +
            '<div class="stat-card-value" style="color:' + card.color + '">' + displayTime + '</div>' +
            displayAvg +
            (sparkline ? '<div class="stat-card-spark">' + sparkline + '</div>' : '');
        statsDisplay.appendChild(div);
    });

    renderPerfHistory();
}

function renderFlamegraph(stats: PerformanceStats, lineStats?: LineStats[]): void {
    /* For multi-line documents, show per-line flamegraph segments */
    if (lineStats && lineStats.length >= 2) {
        renderLineFlamegraph(stats, lineStats);
        return;
    }
    const overhead = computeOverhead(stats);
    const total = stats.totalTime || 1;

    // Only timed stages + a single combined Overhead segment.
    // Individual untimed stages (Validation, Cache, Async) are not rendered
    // as separate segments to avoid double-counting the overhead time.
    const allTimes = [
        { time: stats.lexerTime, color: '#5ac8fa' },
        { time: stats.parserTime, color: '#9b7bec' },
        { time: stats.bytecodeTime, color: '#4ec9b0' },
        { time: stats.executionTime, color: '#ffd866' },
        { time: overhead, color: '#6b6b75' },
    ];

    let segments: { label: string; time: number; color: string }[] = [];

    const timedLabels = ['Lexer', 'Parser', 'Compile', 'VM', 'Overhead'];
    allTimes.forEach((t, i) => {
        if (t.time > 0) {
            segments.push({
                label: timedLabels[i],
                time: t.time,
                color: t.color,
            });
        }
    });

    // Merge tiny segments (< 3% of total) into a combined "Other" segment
    const totalTime = segments.reduce((a, s) => a + s.time, 0) || 1;
    let merged: typeof segments = [];
    let otherTime = 0;
    for (const seg of segments) {
        const pct = (seg.time / totalTime) * 100;
        if (pct < 3) {
            otherTime += seg.time;
        } else {
            merged.push(seg);
        }
    }
    if (otherTime > 0) {
        merged.push({ label: 'Other', time: otherTime, color: '#4a4a55' });
    }

    if (merged.length === 0) {
        perfFlamegraph.innerHTML = '<div class="empty" style="width:100%;display:flex;align-items:center;justify-content:center">No timing data</div>';
        perfFlamegraphLegend.innerHTML = '';
        return;
    }

    const mergedTotal = merged.reduce((a, s) => a + s.time, 0) || 1;
    let html = '';
    const legendItems: { label: string; color: string }[] = [];
    const activeFilter = flamegraphFilter;

    merged.forEach(seg => {
        const pct = (seg.time / mergedTotal) * 100;
        const width = pct < 2 ? Math.max(2, pct) : pct;
        const timeStr = fmt(seg.time);
        const pctStr = pct.toFixed(1) + '%';
        const showLabel = pct >= 10;
        const isDimmed = activeFilter !== null && seg.label !== activeFilter && seg.label !== 'Other';
        const isHighlighted = activeFilter !== null && seg.label === activeFilter;

        html += '<div class="perf-flamegraph-bar' +
            (isHighlighted ? ' flamegraph-bar-highlighted' : '') +
            (isDimmed ? ' flamegraph-bar-dimmed' : '') +
            '" data-stage="' + seg.label + '" style="width:' + width + '%;background:' + seg.color + '">' +
            (showLabel ? '<span class="perf-flamegraph-bar-label">' + seg.label + '</span>' : '') +
            '<div class="perf-flamegraph-tooltip">' +
            '<div class="perf-flamegraph-tooltip-name" style="color:' + seg.color + '">' + seg.label + '</div>' +
            '<span class="perf-flamegraph-tooltip-time">' + timeStr + '</span>' +
            '<span class="perf-flamegraph-tooltip-pct">' + pctStr + '</span>' +
            '</div></div>';

        legendItems.push({ label: seg.label, color: seg.color });
    });

    perfFlamegraph.innerHTML = html;

    /* Attach click listeners to each flamegraph bar */
    perfFlamegraph.querySelectorAll('.perf-flamegraph-bar').forEach(bar => {
        const stageLabel = (bar as HTMLElement).dataset.stage;
        if (stageLabel) {
            bar.addEventListener('click', (e) => {
                e.stopPropagation();
                setFlamegraphFilter(stageLabel);
            });
        }
    });

    /* Build legend with optional clear-filter button */
    let legendHtml = legendItems.map(item =>
        '<span class="perf-flamegraph-legend-item' +
        (activeFilter === item.label ? ' legend-item-active' : '') +
        '">' +
        '<span class="perf-flamegraph-legend-swatch" style="background:' + item.color + '"></span>' +
        item.label +
        '</span>'
    ).join('');

    if (activeFilter) {
        legendHtml += '<span class="flamegraph-active-label" style="font-size:9px;opacity:0.7;margin-left:8px">Filter: <strong>' + activeFilter + '</strong></span>';
        legendHtml += '<button class="flamegraph-clear-filter" title="Clear filter">\u2716 Clear filter</button>';
    }

    perfFlamegraphLegend.innerHTML = legendHtml;
    /* Bind the clear filter button click */
    const clearBtn = perfFlamegraphLegend.querySelector('.flamegraph-clear-filter');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearFlamegraphFilter);
    }
}

/* ── Per-Line Flamegraph (multi-line documents) ──────────────────── */

/* Stage color map for dominant-stage coloring */
const STAGE_COLORS: Record<string, string> = {
    'Lexer':     '#5ac8fa',
    'Parser':    '#9b7bec',
    'Compile':   '#4ec9b0',
    'VM':        '#ffd866',
    'Overhead':  '#6b6b75',
};

function getDominantStage(s: PerformanceStats): string {
    const stages: [string, number][] = [
        ['Lexer', s.lexerTime],
        ['Parser', s.parserTime],
        ['Compile', s.bytecodeTime],
        ['VM', s.executionTime],
        ['Overhead', computeOverhead(s)],
    ];
    let maxVal = -1;
    let dominant = 'Overhead';
    for (const [label, val] of stages) {
        if (val > maxVal) { maxVal = val; dominant = label; }
    }
    return dominant;
}

function renderLineFlamegraph(aggregateStats: PerformanceStats, lineStats: LineStats[]): void {
    const totalAggregate = aggregateStats.totalTime || 1;
    const lineCount = lineStats.length;

    if (lineCount === 0) {
        perfFlamegraph.innerHTML = '<div class="empty" style="width:100%;display:flex;align-items:center;justify-content:center">No timing data</div>';
        perfFlamegraphLegend.innerHTML = '';
        return;
    }

    const mergedTotal = lineStats.reduce((a, ls) => a + ls.stats.totalTime, 0) || 1;
    const activeFilter = flamegraphFilter;

    let html = '';
    const legendItems: { label: string; color: string }[] = [];

    lineStats.forEach((ls, i) => {
        const s = ls.stats;
        const lineNumber = ls.lineNumber;
        const pct = (s.totalTime / mergedTotal) * 100;
        const width = pct < 1.5 ? Math.max(1.5, pct) : pct;
        const dominant = getDominantStage(s);
        const color = STAGE_COLORS[dominant] ?? '#6b6b75';
        const timeStr = fmt(s.totalTime);
        const pctStr = pct.toFixed(1) + '%';
        const showLabel = pct >= 8 && lineCount <= 15;
        const isDimmed = activeFilter !== null && dominant !== activeFilter;
        const isHighlighted = activeFilter !== null && dominant === activeFilter;

        /* Per-stage breakdown tooltip */
        const tooltipBreakdown =
            '<div style="font-size:9px;margin-top:3px;padding-top:3px;border-top:1px solid rgba(255,255,255,0.1)">' +
            '<div>Lx ' + fmt(s.lexerTime) + '</div>' +
            '<div>Pr ' + fmt(s.parserTime) + '</div>' +
            '<div>Cp ' + fmt(s.bytecodeTime) + '</div>' +
            '<div>VM ' + fmt(s.executionTime) + '</div>' +
            '<div>Ov ' + fmt(computeOverhead(s)) + '</div>' +
            '</div>';

        html += '<div class="perf-flamegraph-bar' +
            (isHighlighted ? ' flamegraph-bar-highlighted' : '') +
            (isDimmed ? ' flamegraph-bar-dimmed' : '') +
            '" data-stage="' + dominant + '" style="width:' + width + '%;background:' + color + '">' +
            (showLabel ? '<span class="perf-flamegraph-bar-label">L' + lineNumber + '</span>' : '') +
            '<div class="perf-flamegraph-tooltip">' +
            '<div class="perf-flamegraph-tooltip-name" style="color:' + color + '">Line ' + lineNumber + ' &middot; ' + dominant + '</div>' +
            '<span class="perf-flamegraph-tooltip-time">' + timeStr + '</span>' +
            '<span class="perf-flamegraph-tooltip-pct">' + pctStr + '</span>' +
            tooltipBreakdown +
            '</div></div>';

        if (!legendItems.find(item => item.label === dominant)) {
            legendItems.push({ label: dominant, color });
        }
    });

    perfFlamegraph.innerHTML = html;

    /* Attach click listeners — chain to setFlamegraphFilter with dominant stage */
    perfFlamegraph.querySelectorAll('.perf-flamegraph-bar').forEach(bar => {
        const stageLabel = (bar as HTMLElement).dataset.stage;
        if (stageLabel) {
            bar.addEventListener('click', (e) => {
                e.stopPropagation();
                setFlamegraphFilter(stageLabel);
            });
        }
    });

    /* Legend: per-line mode indicator + dominant stage legend + clear filter */
    let legendHtml = '<span class="perf-flamegraph-legend-item" style="opacity:0.5;font-size:8px;letter-spacing:0.5px">' +
        lineCount + ' lines &middot; colored by dominant stage</span>';

    legendHtml += legendItems.map(item =>
        '<span class="perf-flamegraph-legend-item' +
        (activeFilter === item.label ? ' legend-item-active' : '') +
        '">' +
        '<span class="perf-flamegraph-legend-swatch" style="background:' + item.color + '"></span>' +
        item.label +
        '</span>'
    ).join('');

    if (activeFilter) {
        legendHtml += '<span class="flamegraph-active-label" style="font-size:9px;opacity:0.7;margin-left:8px">Filter: <strong>' + activeFilter + '</strong></span>';
        legendHtml += '<button class="flamegraph-clear-filter" title="Clear filter">\u2716 Clear filter</button>';
    }

    perfFlamegraphLegend.innerHTML = legendHtml;
    const clearBtn = perfFlamegraphLegend.querySelector('.flamegraph-clear-filter');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearFlamegraphFilter);
    }
}

/* ── Pipeline Heatmap ────────────────────────────────────────── */
function renderPipelineHeatmap(): void {
    perfHeatmap.innerHTML = '';

    const entries = statsHistory;
    if (entries.length < 2) {
        perfHeatmap.innerHTML = '<div class="empty">Need 2+ evaluations</div>';
        return;
    }

    // Last 50 entries, newest on top (reversed so top = most recent)
    const slice = entries.slice(-50).reverse();

    const stages: { label: string; getValue: (s: PerformanceStats) => number; color: string }[] = [
        { label: 'Lexer',   getValue: s => s.lexerTime,      color: '#5ac8fa' },
        { label: 'Parser',  getValue: s => s.parserTime,     color: '#9b7bec' },
        { label: 'Compile', getValue: s => s.bytecodeTime,   color: '#4ec9b0' },
        { label: 'VM',      getValue: s => s.executionTime,  color: '#ffd866' },
        { label: 'Overhead', getValue: s => computeOverhead(s), color: '#6b6b75' },
    ];

    const activeFilter = flamegraphFilter;

    let html = '';

    // ── Header row ───────────────────────────────────────────────
    html += '<div class="perf-heatmap-header">';
    html += '<div class="perf-heatmap-header-label">#</div>';
    for (const s of stages) {
        const isDimmed = activeFilter !== null && s.label !== activeFilter;
        html += `<div class="perf-heatmap-header-label" style="color:${s.color};opacity:${isDimmed ? 0.25 : 1}">${s.label}</div>`;
    }
    html += '</div>';

    // ── Data rows ────────────────────────────────────────────────
    for (let i = 0; i < slice.length; i++) {
        const stats = slice[i];
        const total = stats.totalTime || 1;
        const evalNum = entries.length - i;

        html += '<div class="perf-heatmap-row">';
        html += `<div class="perf-heatmap-row-label" title="Evaluation #${evalNum}">#${evalNum}</div>`;

        for (const stage of stages) {
            const val = stage.getValue(stats);
            const pct = (val / total) * 100;
            // Intensity: 0% → opacity 0.06, 50%+ of total → opacity 0.92
            const pctNorm = Math.min(1, pct / 50);
            const opacity = 0.06 + pctNorm * 0.86;
            // When a flamegraph filter is active, cap dimmed columns to a low opacity
            const isDimmed = activeFilter !== null && stage.label !== activeFilter;
            const finalOpacity = isDimmed ? Math.min(0.08, opacity) : opacity;
            const timeStr = fmt(val);
            const pctStr = pct.toFixed(1) + '%';

            html += '<div class="perf-heatmap-cell" style="background:' + stage.color + ';opacity:' + finalOpacity + '">' +
                '<div class="perf-heatmap-cell-tooltip">' +
                '<div class="perf-heatmap-cell-tooltip-name" style="color:' + stage.color + '">' + stage.label + '</div>' +
                '<span class="perf-heatmap-cell-tooltip-time">' + timeStr + '</span>' +
                '<span class="perf-heatmap-cell-tooltip-pct">' + pctStr + '</span>' +
                '</div></div>';
        }

        html += '</div>';
    }

    perfHeatmap.innerHTML = html;
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

/* ── Line Selector ────────────────────────────────────────────── */
function renderPipelineLineSelector(result: DebugResult): void {
    const sel = pipelineLineSelect;
    const currentValue = sel.value;
    let html = '<option value="0">All Lines (aggregate)</option>';
    for (const lr of result.lineResults) {
        const label = 'Line ' + lr.lineNumber + ': ' + escHtml(lr.expression.slice(0, 30)) + (lr.expression.length > 30 ? '…' : '');
        html += '<option value="' + lr.lineNumber + '">' + label + '</option>';
    }
    sel.innerHTML = html;
    /* Restore previous selection if still valid */
    if (currentValue && Array.from(sel.options).some(o => o.value === currentValue)) {
        sel.value = currentValue;
    } else {
        sel.value = '0';
        selectedPipelineLine = null;
    }
}

/* ── Pipeline Flow ─────────────────────────────────────────────── */
function renderPipelineFlow(result: DebugResult): void {
    const selectedLine = selectedPipelineLine;

    /* Determine per-line data if a specific line is selected */
    const perLineResult = selectedLine !== null
        ? result.lineResults.find(lr => lr.lineNumber === selectedLine) ?? null
        : null;
    const perLineStats = selectedLine !== null
        ? (currentLineStats ?? []).find(ls => ls.lineNumber === selectedLine)?.stats ?? null
        : null;

    /* Aggregate vs per-line timings */
    const s = perLineStats ?? result.stats;

    flowTimeLexer.textContent = fmt(s.lexerTime);
    flowTimeParser.textContent = fmt(s.parserTime);
    flowTimeCompiler.textContent = fmt(s.bytecodeTime);
    flowTimeVm.textContent = fmt(s.executionTime);
    flowTimeTotal.textContent = fmt(s.totalTime);

    // Validation (safety checks) + cache + async don't have individual
    // diagnostic event timestamps, so show "—" instead of fabricated values.
    flowTimeValidate.textContent = '—';
    flowTimeCache.textContent = '—';
    flowTimeAsync.textContent = '—';

    // Filter data based on selected line
    const lineTokens = selectedLine !== null
        ? result.rawTokens.filter(t => (t as any).line === selectedLine)
        : result.rawTokens;
    const hasTokens = lineTokens.length > 0;
    const hasParselets = result.parselets && result.parselets.length > 0;
    const wasCached = !hasParselets && result.rawTokens.length > 0;
    const hasErrors = perLineResult?.error ? true : (selectedLine === null && result.errors.length > 0);
    const hasAsync = selectedLine !== null
        ? perLineResult?.type === 'Pending'
        : result.lineResults.some(lr => lr.type === 'Pending');

    // Lexer output: first 8 tokens
    const firstTokens = lineTokens.slice(0, 8);
    flowLexerOutput.innerHTML = firstTokens.length > 0
        ? firstTokens.map(t => '<span class="token token-' + t.type.toLowerCase() + '" style="font-size:9px;cursor:default">' + escHtml(t.value) + '</span>').join(' ')
        : '<span class="empty">\u2014</span>';

    // Validation output: token count + safety status
    flowValidateOutput.innerHTML = firstTokens.length > 0
        ? '<span style="color:' + (hasErrors ? '#f48771' : '#4ec9b0') + ';font-size:10px">' +
          (hasErrors ? 'Failed' : firstTokens.length + ' tokens ✓') + '</span>'
        : '<span class="empty">\u2014</span>';

    // Cache output: Hit / Miss (derived from parselets presence)
    const cacheLabel = wasCached ? 'Hit' : (hasErrors ? '—' : 'Miss');
    const cacheColor = wasCached ? '#4ec9b0' : '#5ac8fa';
    flowCacheOutput.innerHTML = firstTokens.length > 0
        ? '<span style="color:' + cacheColor + ';font-size:10px;font-weight:600">' + cacheLabel + '</span>'
        : '<span class="empty">\u2014</span>';

    // Parser output: unique parselet types
    const parseletNames = [...new Set(result.parselets?.map((p: ParseletInfo) => p.parseletType) ?? [])];
    flowParserOutput.innerHTML = parseletNames.length > 0
        ? parseletNames.map((p: string) => '<span class="token token-keyword" style="font-size:9px;cursor:default">' + escHtml(p) + '</span>').join(' ')
        : (wasCached ? '<span style="color:#6b6b75;font-size:10px">Skipped (cache hit)</span>' : '<span class="empty">\u2014</span>');

    // Compiler output: first 4 unique opcode names
    const opcodeNames = [...new Set(result.opcodes.map(o => o.name))].slice(0, 4);
    flowCompilerOutput.innerHTML = opcodeNames.length > 0
        ? opcodeNames.map(n => '<span class="token token-func" style="font-size:9px;cursor:default">' + escHtml(n) + '</span>').join(' ')
        : (wasCached ? '<span style="color:#6b6b75;font-size:10px">Skipped (cache hit)</span>' : '<span class="empty">\u2014</span>');

    // Async preflight output
    flowAsyncOutput.innerHTML = hasAsync
        ? '<span style="color:#ffd866;font-size:10px">Pending resolution</span>'
        : '<span style="color:#6b6b75;font-size:10px">Sync path</span>';

    // VM output: first result type
    const firstResult = result.lineResults[0];
    flowVmOutput.innerHTML = firstResult
        ? '<span style="color:#29ce99;font-size:10px">' + (firstResult.error ? 'Error' : firstResult.type) + '</span>'
        : '<span class="empty">\u2014</span>';

    // Result output: last line's final value
    const lastResult = result.lineResults[result.lineResults.length - 1];
    flowResultOutput.innerHTML = lastResult
        ? '<span style="color:' + (lastResult.error ? '#f48771' : '#29ce99') + '">' + escHtml(lastResult.error || lastResult.result) + '</span>'
        : '<span class="empty">\u2014</span>';

    detailTokens.textContent = String(result.rawTokens.length);
    detailOpcodes.textContent = String(result.opcodes.length);
    detailNumbers.textContent = String(result.constants.filter(c => c.type === 'number').length);
    detailStrings.textContent = String(result.constants.filter(c => c.type === 'string').length);
    detailCache.textContent = wasCached ? 'hit' : (hasParselets ? 'miss' : '—');
    detailAsync.textContent = hasAsync ? 'yes' : 'no';
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

/* ── Escape key clears flamegraph filter ───────────────────────── */
document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && flamegraphFilter !== null) {
        e.preventDefault();
        clearFlamegraphFilter();
    }
});

/* ── Init ──────────────────────────────────────────────────────── */
renderExamplesSidebar();
populateFullDocExamples();
editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: '10 + 5 * 2' } });
