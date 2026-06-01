import { EditorView, keymap, placeholder, Decoration, WidgetType, ViewUpdate } from '@codemirror/view';
import { EditorState, StateField, RangeSetBuilder, RangeSet, StateEffect } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { SolveHighlightProvider } from '@/app/codemirror/SolveHighlightProvider';
import type { DebugResult, Token, OpcodeInfo, ConstantInfo, PerformanceStats, LineStats, LineResult, ParseletInfo, VmTraceStep, VmStackValue, DQMetrics, CacheSnapshot, BytecodeCacheEntry, LineCacheEntryInfo, AsyncCachePackageInfo, DiagnosticEventInfo } from './engine.js';
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

const tokensDisplay = $('tokens-display');
const opcodesDisplay = $('opcodes-display');
const constantsDisplay = $('constants-display');
const variablesDisplay = $('variables-display');
const errorsDisplay = $('errors-display');
const statsDisplay = $('stats-display');
const tokenCount = $('token-count');
const bytecodeCount = $('bytecode-count');
const groupTokensCheckbox = $('group-tokens') as HTMLInputElement;
const tokenFilterInput = $('token-filter') as HTMLInputElement;

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
let pipelineDropdownManuallyChanged = false;

/* ── Live Stream Diagnostics State ───────────────────────────── */
/** Accumulated live stream events from async resolutions. */
let liveStreamEvents: DiagnosticEventInfo[] = [];
/** Whether streaming mode is active (auto-scroll to bottom). */
let streamingActive = false;

/* ── Per-line stage expansion state ───────────────────────────── */
const stageExpansionState = new Map<number, boolean[]>();

/** Track stage output snapshots per line for change detection on switch. */
const stageSnapshots = new Map<number, string[]>();

/** Stage output element IDs, in order. */
const STAGE_OUTPUT_IDS = [
    'flow-lexer-output',
    'flow-validate-output',
    'flow-cache-output',
    'flow-parser-output',
    'flow-compiler-output',
    'flow-async-output',
    'flow-vm-output',
    'flow-result-output',
];

/** Save the current collapsed state of each stage for a given line key. */
function saveStageExpansion(lineKey: number): void {
    const stages = document.querySelectorAll('.flow-stage');
    const state: boolean[] = [];
    stages.forEach(stage => state.push(!stage.classList.contains('collapsed')));
    stageExpansionState.set(lineKey, state);
}

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
engineWorker.onmessage = (e: MessageEvent<{ id: number; result?: DebugResult; error?: string; streamEvent?: DiagnosticEventInfo; stream?: boolean }>) => {
    const { id, result, error, streamEvent, stream } = e.data;

    // ── Handle streaming (incremental) events ──
    if (stream && streamEvent && id === runId) {
        liveStreamEvents.push(streamEvent);
        appendStreamEvent(streamEvent);
        return;
    }

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
        span.textContent = this.text;
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
$('btn-collapse-sidebar').addEventListener('click', toggleSidebar);

$('btn-collapse-all').addEventListener('click', () => {
    document.querySelectorAll('.flow-stage').forEach(el => el.classList.add('collapsed'));
    document.querySelectorAll('.example-category-content').forEach(el => {
        el.classList.add('collapsed');
    });
    saveStageExpansion(selectedPipelineLine ?? 0);
});

$('btn-expand-all').addEventListener('click', () => {
    document.querySelectorAll('.flow-stage').forEach(el => el.classList.remove('collapsed'));
    document.querySelectorAll('.example-category-content').forEach(el => {
        el.classList.remove('collapsed');
    });
    saveStageExpansion(selectedPipelineLine ?? 0);
});

let tokenFilterQuery = '';

tokenFilterInput.addEventListener('input', () => {
    tokenFilterQuery = tokenFilterInput.value;
    if (currentResult) renderTokens(currentResult.rawTokens);
});

groupTokensCheckbox.addEventListener('change', () => {
    if (currentResult) renderTokens(currentResult.rawTokens);
});

/* ── Pipeline Line Tracking ────────────────────────────────────── */
let lastCursorLine = 1;

function updatePipelineLineSelection(lineNumber: number, collapseStages = false): void {
    /* If the user has manually changed the dropdown, don't override it with cursor tracking */
    if (pipelineDropdownManuallyChanged) return;

    const sel = pipelineLineSelect;
    let newSelection: number | null = null;

    /* Check if this line number exists as an option */
    for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === String(lineNumber)) {
            sel.value = String(lineNumber);
            newSelection = lineNumber;
            break;
        }
    }

    /* Line not in options — fall back to All Lines */
    if (newSelection === null) {
        sel.value = '0';
    }

    /* Only re-render if the effective selection actually changed AND we're not
       in initial-render mode (collapseStages=true means renderAll will handle it). */
    if (selectedPipelineLine !== newSelection) {
        selectedPipelineLine = newSelection;
        if (!collapseStages && currentResult) {
            renderPipelineFlow(currentResult, false);
            renderTokens(currentResult.rawTokens, currentResult.lineResults, currentResult.opcodes);
        }
    }
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
            // Send abort to cancel any in-flight evaluation in the worker
            engineWorker.postMessage({ id: runId, abort: true });
            return;
        }

        // Clear accumulated stream events for fresh evaluation
        liveStreamEvents = [];
        streamingActive = true;
        const streamCountEl = document.getElementById('stream-event-count');
        if (streamCountEl) {
            streamCountEl.textContent = '0 events · ⟳ live';
            streamCountEl.classList.add('stream-live');
        }
        // Clear the stream display for fresh start
        const streamDisplay = document.getElementById('stream-display');
        if (streamDisplay) {
            streamDisplay.innerHTML = '<span class="empty" style="padding:12px;display:block;text-align:center">Listening for async events…</span>';
        }

        highlightProvider.invalidateCache();
        setStatus('busy');
        runId++;
        engineQueueDepth++;
        engineLastRunTime = performance.now();
        footerExpression.textContent = expression.slice(0, 60) + (expression.length > 60 ? '\u2026' : '');
        logWorkerActivity('engine', `Enqueued run #${runId}: ${expression.slice(0, 40)}${expression.length > 40 ? '…' : ''}`);
        updateEngineWorkerTelemetry();
        engineWorker.postMessage({ id: runId, expression, stream: true });
    }, 150);
}

/* ── Main Render ───────────────────────────────────────────────── */
function renderAll(result: DebugResult): void {
    renderErrors(result.errors);
    renderTokens(result.rawTokens, result.lineResults, result.opcodes);
    renderOpcodesDisasm(result.opcodes);
    renderConstants(result.constants);
    renderVariables(result.variables);
    currentLineStats = result.lineStats ?? null;
    renderStats(result.stats, result.lineStats);

    renderPipelineLineSelector(result);
    /* After selector is populated, re-apply cursor-driven selection */
    const cursorLine = editor.state.doc.lineAt(editor.state.selection.main.head).number;
    updatePipelineLineSelection(cursorLine, true); // sets selectedPipelineLine only, no render
    renderPipelineFlow(result, true); // render with collapsed stages

    /* Reset the manual-override flag on each fresh evaluation so cursor tracking resumes */
    pipelineDropdownManuallyChanged = false;

    /* Wire up manual dropdown selection — clicking triggers a full re-render */
    if (!pipelineLineListenerAttached) {
        pipelineLineSelect.addEventListener('change', () => {
            pipelineDropdownManuallyChanged = true;
            const val = pipelineLineSelect.value;
            selectedPipelineLine = val === '0' ? null : Number(val);
            if (currentResult) {
                renderPipelineFlow(currentResult, false);
                renderTokens(currentResult.rawTokens, currentResult.lineResults, currentResult.opcodes);
            }
        });
        pipelineLineListenerAttached = true;
    }
    renderInlineResults(result.lineResults);
    renderVmTrace(result.vmTrace);
    renderCacheTab(result);
    // Finalize streaming: show static events + any live ones accumulated
    streamingActive = false; // Initial result complete — live events still arrive
    renderStreamTab(result);

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
function matchToken(t: Token, query: string): boolean {
    if (!query) return true;
    const q = query.toLowerCase();
    return t.value.toLowerCase().includes(q) || t.type.toLowerCase().includes(q);
}

function renderTokens(tokens: Token[], lineResults?: LineResult[], opcodes?: OpcodeInfo[]): void {
    tokensDisplay.innerHTML = '';

    const hasFilter = tokenFilterQuery.length > 0;
    const totalCount = tokens.filter(t => t.type !== 'WS' && t.type !== 'NEWLINE').length;

    if (tokens.length === 0) {
        tokenCount.textContent = '0 tokens';
        tokensDisplay.innerHTML = '<span class="empty">No tokens</span>';
        return;
    }

    /* Build a line → result lookup for quick access */
    const resultByLine = new Map<number, LineResult>();
    if (lineResults) {
        for (const lr of lineResults) {
            resultByLine.set(lr.lineNumber, lr);
        }
    }

    const groupByLine = groupTokensCheckbox.checked;
    if (groupByLine) {
        const lines = new Map<number, Token[]>();
        for (const t of tokens) {
            if (t.type === 'WS' || t.type === 'NEWLINE') continue;
            if (hasFilter && !matchToken(t, tokenFilterQuery)) continue;
            const ln = t.line || 1;
            if (!lines.has(ln)) lines.set(ln, []);
            lines.get(ln)!.push(t);
        }

        let filteredTotal = 0;
        for (const [, lineTokens] of lines) filteredTotal += lineTokens.length;
        tokenCount.textContent = hasFilter
            ? filteredTotal + ' / ' + totalCount + ' tokens'
            : totalCount + ' tokens';

        if (filteredTotal === 0) {
            tokensDisplay.innerHTML = '<span class="empty">No tokens match &ldquo;' + escHtml(tokenFilterQuery) + '&rdquo;</span>';
            return;
        }

        const wrapper = document.createElement('div');
        Array.from(lines.entries()).sort((a, b) => a[0] - b[0]).forEach(([ln, lineTokens]) => {
            const group = document.createElement('div');
            const isSelected = selectedPipelineLine === ln;
            group.className = 'token-line-group' + (isSelected ? ' selected' : '');

            /* Line header with microstat badges + token/opcode counts */
            const tc = lineTokens.length;
            const lr = resultByLine.get(ln);
            const opcodeCount = lr?.opcodeCount ?? opcodes?.length ?? 0;

            /* Cache status */
            let cacheBadgeHtml = '';
            if (lr) {
                const cacheLabel = lr.wasCached ? 'HIT' : 'MISS';
                const cacheClass = lr.wasCached ? 'microstat-cache-hit' : 'microstat-cache-miss';
                cacheBadgeHtml = '<span class="microstat-badge ' + cacheClass + '">' + cacheLabel + '</span>';
            }

            /* Line status */
            let statusBadgeHtml = '';
            if (lr) {
                let statusLabel: string, statusClass: string;
                if (lr.error) {
                    statusLabel = 'ERROR';
                    statusClass = 'microstat-status-error';
                } else if (lr.type === 'Pending') {
                    statusLabel = 'PENDING';
                    statusClass = 'microstat-status-pending';
                } else {
                    statusLabel = 'OK';
                    statusClass = 'microstat-status-ok';
                }
                statusBadgeHtml = '<span class="microstat-badge ' + statusClass + '">' + statusLabel + '</span>';
            }

            let headerHtml = '<div class="token-line-header">' +
                '<span class="token-line-header-left">' +
                '<span>Line ' + ln + '</span>' +
                (cacheBadgeHtml || statusBadgeHtml ? '<span class="token-line-microstats">' + cacheBadgeHtml + statusBadgeHtml + '</span>' : '') +
                '</span>' +
                '<span class="token-line-counts">' +
                '<span class="token-count-badge">' + tc + ' token' + (tc !== 1 ? 's' : '') + '</span>' +
                '<span class="opcode-count-badge">' + opcodeCount + ' opcode' + (opcodeCount !== 1 ? 's' : '') + '</span>' +
                '</span>' +
                '</div>';

            /* Tokens row — inline label + chips */
            const tokensHtml = '<div class="token-line-content">' +
                '<span class="output-label-inline">Tokens</span>' +
                lineTokens.map(t => '<span class="token token-' + t.type.toLowerCase() + '" title="Type: ' + t.type + '\nValue: ' + t.value + '\nPos: ' + t.offset + '">' + escHtml(t.value) + '</span>').join('') +
                '</div>';

            /* Result badge row */
            let resultHtml = '';
            if (lr) {
                const typeColor = lr.error ? 'var(--error)' : lr.type === 'Pending' ? 'var(--stage-vm)' : 'var(--stage-parser)';
                const valueColor = lr.error ? 'var(--error)' : 'var(--accent)';
                const rawResult = lr.error ? lr.error : lr.result;
                const resultLabel = escHtml(rawResult);
                const copyLabel = escHtml(rawResult).replace(/"/g, '&quot;');
                resultHtml = '<div class="token-line-result">' +
                    '<span class="token-line-result-type" style="color:' + typeColor + '">' + escHtml(lr.type) + '</span>' +
                    '<span class="token-line-result-arrow">→</span>' +
                    '<span class="token-line-result-value" style="color:' + valueColor + '">' + resultLabel + '</span>' +
                    '<button class="token-line-result-copy" data-copy="' + copyLabel + '" title="Copy result">📋</button>' +
                    '</div>';
            }

            group.innerHTML = headerHtml + tokensHtml + resultHtml;
            wrapper.appendChild(group);
        });
        tokensDisplay.appendChild(wrapper);
    } else {
        let visibleTokens: Token[] = [];
        for (const t of tokens) {
            if (t.type === 'WS' || t.type === 'NEWLINE') continue;
            if (hasFilter && !matchToken(t, tokenFilterQuery)) continue;
            visibleTokens.push(t);
        }

        tokenCount.textContent = hasFilter
            ? visibleTokens.length + ' / ' + totalCount + ' tokens'
            : totalCount + ' tokens';

        if (visibleTokens.length === 0) {
            tokensDisplay.innerHTML = '<span class="empty">No tokens match &ldquo;' + escHtml(tokenFilterQuery) + '&rdquo;</span>';
            return;
        }

        const container = document.createElement('div');
        container.className = 'token-list';
        visibleTokens.forEach(t => {
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
function renderPipelineFlow(result: DebugResult, collapseStages = true): void {
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
    // Total always shows full document aggregate time regardless of line selection
    flowTimeTotal.textContent = fmt(result.stats.totalTime);

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

    // Lexer output
    const isAggregate = selectedLine === null;
    if (isAggregate && lineTokens.length > 0) {
        // Aggregate mode: show token-type breakdown counts
        const typeCounts = new Map<string, number>();
        for (const t of lineTokens) {
            if (t.type === 'WS' || t.type === 'NEWLINE') continue;
            typeCounts.set(t.type, (typeCounts.get(t.type) ?? 0) + 1);
        }
        const parts: string[] = [];
        typeCounts.forEach((count, type) => {
            parts.push('<span class="token token-' + type.toLowerCase() + '" style="font-size:9px;cursor:default">' + count + ' ' + type.toLowerCase() + '</span>');
        });
        flowLexerOutput.innerHTML = '<span style="color:var(--text-secondary);font-size:10px;font-weight:500">' + lineTokens.length + ' tokens &middot; </span>' + parts.join(' ');
    } else {
        // Per-line mode: show first 8 token chips
        const firstTokens = lineTokens.slice(0, 8);
        flowLexerOutput.innerHTML = firstTokens.length > 0
            ? firstTokens.map(t => '<span class="token token-' + t.type.toLowerCase() + '" style="font-size:9px;cursor:default">' + escHtml(t.value) + '</span>').join(' ')
            : '<span class="empty">\u2014</span>';
    }

    // Validation output
    const totalLines = result.lineResults.length;
    const passedLines = result.lineResults.filter(lr => !lr.error).length;
    const errorLines = totalLines - passedLines;
    if (isAggregate && totalLines > 1) {
        // Aggregate mode: show "X/Y lines passed"
        const statusColor = errorLines === 0 ? '#4ec9b0' : errorLines === totalLines ? '#f48771' : '#dcdcaa';
        flowValidateOutput.innerHTML = '<span style="color:' + statusColor + ';font-size:10px">' +
            passedLines + '/' + totalLines + ' lines passed' +
            (errorLines > 0 ? ' <span style="color:#f48771;font-weight:500">(' + errorLines + ' error' + (errorLines > 1 ? 's' : '') + ')</span>' : ' ✓') +
            '</span>';
    } else {
        // Per-line mode or single line
        const perLineTokens = lineTokens.filter(t => t.type !== 'WS' && t.type !== 'NEWLINE');
        flowValidateOutput.innerHTML = perLineTokens.length > 0
            ? '<span style="color:' + (hasErrors ? '#f48771' : '#4ec9b0') + ';font-size:10px">' +
              (hasErrors ? 'Failed' : perLineTokens.length + ' tokens ✓') + '</span>'
            : '<span class="empty">\u2014</span>';
    }

    // Cache output: Hit / Miss (derived from parselets presence)
    const cacheLabel = wasCached ? 'Hit' : (hasErrors ? '—' : 'Miss');
    const cacheColor = wasCached ? '#4ec9b0' : '#5ac8fa';
    const hasAnyTokens = lineTokens.filter(t => t.type !== 'WS' && t.type !== 'NEWLINE').length > 0;
    if (isAggregate && totalLines > 1) {
        // Aggregate mode: show cache hit/miss counts per line
        const hitLines = result.lineResults.filter(lr => !lr.parselet).length;
        const missLines = result.lineResults.filter(lr => lr.parselet).length;
        flowCacheOutput.innerHTML = '<span style="color:' + (hitLines > missLines ? '#4ec9b0' : '#5ac8fa') + ';font-size:10px;font-weight:600">' +
            'Hit ' + hitLines + ' / Miss ' + missLines + '</span>';
    } else {
        flowCacheOutput.innerHTML = hasAnyTokens
            ? '<span style="color:' + cacheColor + ';font-size:10px;font-weight:600">' + cacheLabel + '</span>'
            : '<span class="empty">\u2014</span>';
    }

    // Parser output: unique parselet types
    const parseletNames = [...new Set(result.parselets?.map((p: ParseletInfo) => p.parseletType) ?? [])];
    if (isAggregate && totalLines > 1 && parseletNames.length > 0) {
        // Aggregate mode: show unique parselet types count
        flowParserOutput.innerHTML = '<span style="color:#9b7bec;font-size:10px">' + parseletNames.length + ' parselet type' +
            (parseletNames.length > 1 ? 's' : '') + '</span>';
    } else {
        flowParserOutput.innerHTML = parseletNames.length > 0
            ? parseletNames.map((p: string) => '<span class="token token-keyword" style="font-size:9px;cursor:default">' + escHtml(p) + '</span>').join(' ')
            : (wasCached ? '<span style="color:#6b6b75;font-size:10px">Skipped (cache hit)</span>' : '<span class="empty">\u2014</span>');
    }

    // Compiler output: first 4 unique opcode names
    const opcodeNames = [...new Set(result.opcodes.map(o => o.name))];
    if (isAggregate && totalLines > 1 && opcodeNames.length > 0) {
        // Aggregate mode: show unique opcode count
        flowCompilerOutput.innerHTML = '<span style="color:#4ec9b0;font-size:10px">' + opcodeNames.length + ' unique opcode' +
            (opcodeNames.length > 1 ? 's' : '') +
            ' (' + result.opcodes.length + ' total)</span>';
    } else {
        const firstNames = opcodeNames.slice(0, 4);
        flowCompilerOutput.innerHTML = firstNames.length > 0
            ? firstNames.map(n => '<span class="token token-func" style="font-size:9px;cursor:default">' + escHtml(n) + '</span>').join(' ')
            : (wasCached ? '<span style="color:#6b6b75;font-size:10px">Skipped (cache hit)</span>' : '<span class="empty">\u2014</span>');
    }

    // Async preflight output
    if (isAggregate && totalLines > 1) {
        // Aggregate mode: show pending vs sync counts
        const pendingCount = result.lineResults.filter(lr => lr.type === 'Pending').length;
        const syncCount = totalLines - pendingCount;
        flowAsyncOutput.innerHTML = pendingCount > 0
            ? '<span style="color:#ffd866;font-size:10px">' + pendingCount + ' pending</span>' +
              (syncCount > 0 ? ' <span style="color:#6b6b75;font-size:10px">/ ' + syncCount + ' sync</span>' : '')
            : '<span style="color:#6b6b75;font-size:10px">' + syncCount + ' sync</span>';
    } else {
        flowAsyncOutput.innerHTML = hasAsync
            ? '<span style="color:#ffd866;font-size:10px">Pending resolution</span>'
            : '<span style="color:#6b6b75;font-size:10px">Sync path</span>';
    }

    // VM output
    if (isAggregate && totalLines > 1) {
        // Aggregate mode: show result count
        flowVmOutput.innerHTML = '<span style="color:#29ce99;font-size:10px">' + totalLines + ' result' + (totalLines > 1 ? 's' : '') +
            (errorLines > 0 ? ' (' + errorLines + ' error' + (errorLines > 1 ? 's' : '') + ')' : '') +
            '</span>';
    } else {
        // Per-line mode: show specific result type for the selected line
        const vmTarget = perLineResult ?? result.lineResults[0];
        flowVmOutput.innerHTML = vmTarget
            ? '<span style="color:#29ce99;font-size:10px">' + (vmTarget.error ? 'Error' : vmTarget.type) + '</span>'
            : '<span class="empty">\u2014</span>';
    }

    // Result output
    if (isAggregate && totalLines > 1) {
        // Aggregate mode: show value count summary
        const valueCount = passedLines;
        flowResultOutput.innerHTML = '<span style="color:#29ce99">' + valueCount + ' value' + (valueCount !== 1 ? 's' : '') +
            (errorLines > 0 ? ' <span style="color:#f48771">(' + errorLines + ' error' + (errorLines > 1 ? 's' : '') + ')</span>' : '') +
            '</span>';
    } else {
        // Per-line mode: show specific value for the selected line
        const resultTarget = perLineResult ?? result.lineResults[result.lineResults.length - 1];
        flowResultOutput.innerHTML = resultTarget
            ? '<span style="color:' + (resultTarget.error ? '#f48771' : '#29ce99') + '">' + escHtml(resultTarget.error || resultTarget.result) + '</span>'
            : '<span class="empty">\u2014</span>';
    }

    detailTokens.textContent = String(result.rawTokens.length);
    detailOpcodes.textContent = String(result.opcodes.length);
    detailNumbers.textContent = String(result.constants.filter(c => c.type === 'number').length);
    detailStrings.textContent = String(result.constants.filter(c => c.type === 'string').length);
    detailCache.textContent = wasCached ? 'hit' : (hasParselets ? 'miss' : '—');
    detailAsync.textContent = hasAsync ? 'yes' : 'no';

    /* ── Update active-line indicators ────────────────────────────── */
    const activeLineStr = selectedLine !== null ? 'Line ' + selectedLine : 'All Lines';
    const $badge = document.getElementById('pipeline-active-line-badge');
    if ($badge) $badge.textContent = activeLineStr;

    /* Per-stage line indicator — shows which line each stage's data belongs to */
    const stageLineIds = [
        'flow-lexer-line',
        'flow-validate-line',
        'flow-cache-line',
        'flow-parser-line',
        'flow-compiler-line',
        'flow-async-line',
        'flow-vm-line',
        'flow-result-line',
    ];
    const stageLabel = selectedLine !== null ? 'L' + selectedLine : 'All';
    for (const id of stageLineIds) {
        const el = document.getElementById(id);
        if (el) el.textContent = stageLabel;
    }

    const lineKey = selectedLine ?? 0;

    // Compute stage output snapshot for change detection (do this before expanding/collapsing)
    const newSnapshot: string[] = [];
    for (const id of STAGE_OUTPUT_IDS) {
        const el = document.getElementById(id);
        newSnapshot.push(el?.textContent ?? '');
    }

    // Restore or initialize per-line expansion state
    if (collapseStages) {
        // Initial render from renderAll — collapse all stages and save
        document.querySelectorAll('.flow-stage').forEach(el => el.classList.add('collapsed'));
        saveStageExpansion(lineKey);
        // Save snapshot so future switches can detect changes
        stageSnapshots.set(lineKey, newSnapshot);
    } else {
        // User-triggered line switch — restore saved expansion state for this line
        const savedState = stageExpansionState.get(lineKey);
        if (savedState) {
            document.querySelectorAll('.flow-stage').forEach((stage, i) => {
                if (i < savedState.length) {
                    stage.classList.toggle('collapsed', !savedState[i]);
                }
            });
        } else {
            // First visit to this line — start collapsed
            document.querySelectorAll('.flow-stage').forEach(el => el.classList.add('collapsed'));
            saveStageExpansion(lineKey);
        }

        // Compare snapshot with previous visit to detect changed stages & flash them
        const oldSnapshot = stageSnapshots.get(lineKey);
        if (oldSnapshot) {
            const stages = document.querySelectorAll('.flow-stage');
            stages.forEach((stage, i) => {
                if (i < oldSnapshot.length && i < newSnapshot.length) {
                    if (oldSnapshot[i] !== newSnapshot[i]) {
                        stage.classList.add('flash-pulse');
                        stage.addEventListener('animationend', () => {
                            stage.classList.remove('flash-pulse');
                        }, { once: true });

                        // Also pulse the header for a more targeted visual cue
                        const header = stage.querySelector('.flow-stage-header');
                        if (header) {
                            header.classList.add('header-pulse');
                            header.addEventListener('animationend', () => {
                                header.classList.remove('header-pulse');
                            }, { once: true });
                        }
                    }
                }
            });
        }
        // Save new snapshot for next comparison
        stageSnapshots.set(lineKey, newSnapshot);
    }
}

/* ── Pipeline Stage Click-to-Toggle ────────────────────────────── */
document.querySelectorAll('.flow-stage-header').forEach(header => {
    header.addEventListener('click', () => {
        const stage = header.closest('.flow-stage');
        if (stage) {
            stage.classList.toggle('collapsed');
            // Save expansion state for current line
            const lineKey = selectedPipelineLine ?? 0;
            saveStageExpansion(lineKey);
        }
    });
});

/* ── Utils ─────────────────────────────────────────────────────── */
function fmt(ns: number): string {
    return (ns / 1_000_000).toFixed(2) + ' ms';
}

function escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* Copy result button handler via event delegation */
tokensDisplay.addEventListener('click', (e: MouseEvent) => {
    const btn = (e.target as HTMLElement).closest('.token-line-result-copy') as HTMLElement | null;
    if (!btn) return;
    const text = btn.dataset.copy ?? '';
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        const orig = btn.textContent;
        btn.textContent = '✓';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.textContent = orig;
            btn.classList.remove('copied');
        }, 1000);
    }).catch(() => {
        /* fallback: select from a temp input */
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    });
});

$('btn-sidebar-toggle-mobile').addEventListener('click', toggleSidebar);

/* ── Sidebar Collapse / Expand ──────────────────────────────── */
function toggleSidebar(): void {
    const collapsed = sidebar.classList.toggle('collapsed');
    const btn = $('btn-collapse-sidebar');
    btn.classList.toggle('active');
    btn.textContent = collapsed ? '▶' : '◀';
    btn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    $('sidebar-right-tab').classList.toggle('active');
    $('btn-sidebar-toggle-mobile').classList.toggle('active');
    $('btn-sidebar-toggle-mobile').title = collapsed ? 'Show sidebar' : 'Hide sidebar';
}

$('sidebar-right-tab').addEventListener('click', toggleSidebar);

/* ── Resize Handles (drag-to-resize) ──────────────────────────── */
function makeResizable(
    handle: HTMLElement,
    prevEl: HTMLElement,
    nextEl: HTMLElement,
    direction: 'grow-prev' | 'grow-next'
): void {
    let startX = 0;
    let startPrevW = 0;
    let startNextW = 0;
    let isDragging = false;

    function onStart(e: MouseEvent): void {
        isDragging = true;
        handle.classList.add('active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        startX = e.clientX;
        startPrevW = prevEl.getBoundingClientRect().width;
        startNextW = nextEl.getBoundingClientRect().width;
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
    }

    function onMove(e: MouseEvent): void {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        if (direction === 'grow-prev') {
            const newPrev = Math.max(80, startPrevW + dx);
            prevEl.style.width = newPrev + 'px';
            prevEl.style.flexShrink = '0';
            nextEl.style.flex = '1';
        } else {
            const newNext = Math.max(80, startNextW - dx);
            // diagnostics has CSS 'flex: 1' (flex-basis: 0) which overrides width — use flex shorthand instead
            nextEl.style.flex = '0 0 ' + newNext + 'px';
            prevEl.style.flex = '1';
        }
    }

    function onEnd(): void {
        isDragging = false;
        handle.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
    }

    handle.addEventListener('mousedown', onStart);
}

const sidebarHandle = $('resize-handle-sidebar');
const editorHandle = $('resize-handle-editor');
makeResizable(sidebarHandle, sidebar, $('editor-pane'), 'grow-prev');
makeResizable(editorHandle, $('editor-pane'), $('diagnostics-pane'), 'grow-next');

/* ── Pane Collapse Buttons ─────────────────────────────────────── */
$('btn-collapse-editor').addEventListener('click', () => {
    const pane = $('editor-pane');
    const btn = $('btn-collapse-editor');
    pane.classList.toggle('collapsed');
    if (pane.classList.contains('collapsed')) {
        btn.textContent = '▶';
        btn.title = 'Expand editor';
    } else {
        btn.textContent = '◀';
        btn.title = 'Collapse editor';
    }
});

$('btn-collapse-diagnostics').addEventListener('click', () => {
    const pane = $('diagnostics-pane');
    const btn = $('btn-collapse-diagnostics');
    pane.classList.toggle('collapsed');
    if (pane.classList.contains('collapsed')) {
        btn.textContent = '◀';
        btn.title = 'Expand diagnostics';
    } else {
        btn.textContent = '▶';
        btn.title = 'Collapse diagnostics';
    }
});

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

/** Format a single stack value into a short, human-readable string. */
function formatStackValue(v: VmStackValue): string {
    switch (v.type) {
        case 0: /* Number */       return String((v.value as number).toFixed(4).replace(/\.?0+$/, ''));
        case 1: /* Hex */           return '0x' + (v.value as number).toString(16).toUpperCase();
        case 2: /* BigInt */        return String(v.value) + 'n';
        case 3: /* String */        return '"' + escHtml(String(v.value)).slice(0, 30) + '"';
        case 4: /* Datetime */      return new Date(v.value as number).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        case 5: /* Percentage */    return ((v.value as number) * 100).toFixed(1) + '%';
        case 6: /* Uom */           return (v.value as number).toFixed(2) + ' ' + (v.unit ?? '');
        case 7: /* Array */         return '[' + (v.value as number[]).map(n => n.toFixed(2).replace(/\.?0+$/, '')).join(', ') + ']';
        case 10: /* Boolean */      return v.value ? 'true' : 'false';
        case 11: /* Unit */         return v.unit ?? 'unit';
        case 12: /* Pending */      return '⏳';
        case 13: /* Error */        return '⚠' + String(v.unit ?? v.value ?? '');
        default:                    return '?' + String(v.value);
    }
}

/** Get a CSS class name for a stack value chip based on its ValueType. */
function stackValueTypeClass(type: number): string {
    switch (type) {
        case 0:  return 'vm-stack-number';
        case 1:  return 'vm-stack-hex';
        case 2:  return 'vm-stack-bigint';
        case 3:  return 'vm-stack-string';
        case 4:  return 'vm-stack-datetime';
        case 5:  return 'vm-stack-percentage';
        case 6:  return 'vm-stack-uom';
        case 7:  return 'vm-stack-array';
        case 10: return 'vm-stack-boolean';
        default: return 'vm-stack-other';
    }
}

function renderVmTrace(steps: VmTraceStep[]): void {
    vmtraceDisplay.innerHTML = '';
    vmtraceCount.textContent = steps.length + ' steps';

    if (steps.length === 0) {
        vmtraceDisplay.innerHTML = '<span class="empty">No trace data — enable vmTraceEnabled mode</span>';
        return;
    }

    steps.forEach((step, i) => {
        const row = document.createElement('div');
        const isLast = i === steps.length - 1;
        row.className = 'vm-trace-row' + (isLast ? ' halt' : '');

        const timeStr = (step.elapsedNs / 1_000_000).toFixed(2) + ' ms';

        /* Build stack chips HTML */
        const stack = step.stack ?? [];
        let chipsHtml = '';
        for (let si = 0; si < stack.length; si++) {
            const sv = stack[si];
            const label = formatStackValue(sv);
            const typeClass = stackValueTypeClass(sv.type);
            chipsHtml += '<span class="vm-stack-chip ' + typeClass + '" title="Type ' + sv.type + (sv.unit ? ' Unit: ' + escHtml(sv.unit) : '') + '">' + label + '</span>';
        }
        if (chipsHtml === '') {
            chipsHtml = '<span class="vm-stack-empty">∅</span>';
        }

        row.innerHTML =
            '<span class="vm-trace-col-step">' + step.instructionNumber + '</span>' +
            '<span class="vm-trace-col-ip">' + step.ip + '</span>' +
            '<span class="vm-trace-col-op" title="Opcode 0x' + step.opcode.toString(16).toUpperCase().padStart(2, '0') + '">' + escHtml(step.opcodeName) + '</span>' +
            '<span class="vm-trace-col-stack">' +
                '<span class="vm-trace-stack-depth-badge">' + step.stackDepth + '</span>' +
                '<span class="vm-trace-stack-chips">' + chipsHtml + '</span>' +
            '</span>' +
            '<span class="vm-trace-col-time">' + timeStr + '</span>';
        vmtraceDisplay.appendChild(row);
    });
}

/* ── Cache Tab ────────────────────────────────────────────────── */
function renderCacheTab(result: DebugResult): void {
    const cacheDisplay = document.getElementById('cache-display');
    if (!cacheDisplay) return;

    const cs = result.cacheSnapshot ?? { bytecode: [], lineCache: [], asyncCache: [] };
    cacheDisplay.innerHTML = '';

    // ── Bytecode Cache ───────────────────────────────────────────
    const bcSection = document.createElement('div');
    bcSection.className = 'cache-section';
    bcSection.innerHTML = '<div class="cache-section-header">' +
        '<span>⬡ Bytecode Cache</span>' +
        '<span class="cache-section-count">' + cs.bytecode.length + ' entries</span>' +
        '</div>';
    if (cs.bytecode.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'cache-entry';
        empty.innerHTML = '<span class="empty" style="padding:8px;display:block;width:100%;text-align:center">No bytecode cache entries</span>';
        bcSection.appendChild(empty);
    } else {
        for (const entry of cs.bytecode) {
            const row = document.createElement('div');
            row.className = 'cache-entry';
            const hasAsyncStr = entry.hasAsync ? ' async' : '';
            row.innerHTML =
                '<span class="cache-entry-expr">' + escHtml(entry.expression) + '</span>' +
                '<span class="cache-entry-meta">' + entry.opcodesLength + ' op · ' + entry.numbersLength + ' num · ' + entry.stringsLength + ' str' + hasAsyncStr + '</span>';
            bcSection.appendChild(row);
        }
    }
    cacheDisplay.appendChild(bcSection);

    // ── Line Cache ───────────────────────────────────────────────
    const lcSection = document.createElement('div');
    lcSection.className = 'cache-section';
    const resolvedCount = cs.lineCache.filter(e => e.resultType !== 'Pending').length;
    lcSection.innerHTML = '<div class="cache-section-header">' +
        '<span>⊞ Line Cache</span>' +
        '<span class="cache-section-count">' + cs.lineCache.length + ' entries · ' + resolvedCount + ' resolved</span>' +
        '</div>';
    if (cs.lineCache.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'cache-entry';
        empty.innerHTML = '<span class="empty" style="padding:8px;display:block;width:100%;text-align:center">No line cache entries</span>';
        lcSection.appendChild(empty);
    } else {
        for (const entry of cs.lineCache) {
            const row = document.createElement('div');
            row.className = 'cache-entry';
            const readsHtml = entry.reads.length > 0
                ? entry.reads.map(r => '<span class="cache-read-chip">' + escHtml(r) + '</span>').join('')
                : '';
            const writeInfo = entry.writeVar
                ? '<span class="cache-read-chip">→ ' + escHtml(entry.writeVar) + '</span>'
                : '';
            row.innerHTML =
                '<span class="cache-entry-key">L' + entry.lineNumber + '</span>' +
                '<span class="cache-entry-expr">' + escHtml(entry.resultValue) + '</span>' +
                '<span class="cache-entry-meta">' + escHtml(entry.resultType) + '</span>' +
                (readsHtml ? '<span class="cache-entry-reads">' + readsHtml + '</span>' : '') +
                (writeInfo ? '<span class="cache-entry-reads">' + writeInfo + '</span>' : '');
            lcSection.appendChild(row);
        }
    }
    cacheDisplay.appendChild(lcSection);

    // ── Async Cache ──────────────────────────────────────────────
    for (const pkg of cs.asyncCache) {
        const pkgSection = document.createElement('div');
        pkgSection.className = 'cache-section';
        const totalEntries = pkg.entries.length;
        pkgSection.innerHTML = '<div class="cache-section-header">' +
            '<span>⟳ ' + escHtml(pkg.packageId) + '</span>' +
            '<span class="cache-section-count">' + pkg.resolvedCount + ' ✓ · ' + pkg.inFlightCount + ' ⟳ · ' + pkg.errorCount + ' ✗</span>' +
            '</div>';
        if (totalEntries === 0) {
            const empty = document.createElement('div');
            empty.className = 'cache-entry';
            empty.innerHTML = '<span class="empty" style="padding:8px;display:block;width:100%;text-align:center">No async cache entries</span>';
            pkgSection.appendChild(empty);
        } else {
            for (const entry of pkg.entries) {
                const row = document.createElement('div');
                row.className = 'cache-entry';
                const statusClass = entry.status === 'resolved' ? 'resolved' : entry.status === 'error' ? 'error' : 'in_flight';
                const statusLabel = entry.status === 'resolved' ? '✓' : entry.status === 'error' ? '✗' : '⟳';
                row.innerHTML =
                    '<span class="cache-entry-expr">' + escHtml(entry.key) + '</span>' +
                    '<span class="cache-entry-status ' + statusClass + '">' + statusLabel + '</span>' +
                    (entry.errorMessage ? '<span class="cache-entry-meta" style="color:var(--error)">' + escHtml(entry.errorMessage) + '</span>' : '');
                pkgSection.appendChild(row);
            }
        }
        cacheDisplay.appendChild(pkgSection);
    }
}

/* ── Stream Diagnostics Tab ────────────────────────────────────── */
/* ── Stream Diagnostics Tab ────────────────────────────────────── */

/**
 * Group a list of diagnostic events by their groupKey.
 * Returns a Map<groupKey, DiagnosticEventInfo[]>.
 */
function groupEventsByKey(events: DiagnosticEventInfo[]): Map<string, DiagnosticEventInfo[]> {
    const groups = new Map<string, DiagnosticEventInfo[]>();
    for (const evt of events) {
        const key = evt.groupKey || 'General';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(evt);
    }
    return groups;
}

/**
 * Create a collapsible group section for a set of events sharing the same groupKey.
 */
function createStreamEventGroup(groupKey: string, events: DiagnosticEventInfo[]): HTMLElement {
    const section = document.createElement('div');
    section.className = 'stream-group';
    section.dataset.groupKey = groupKey;

    const collapsed = !events.some(e =>
        e.type === 'async_pending' || e.type === 'async_resolved' || e.type === 'async_error'
    );

    const header = document.createElement('div');
    header.className = 'stream-group-header' + (collapsed ? '' : ' expanded');
    header.addEventListener('click', () => {
        section.classList.toggle('collapsed');
        header.classList.toggle('expanded');
    });

    const hasAsync = events.some(e => e.type.startsWith('async_'));
    const badgeClass = hasAsync ? 'stream-group-badge-async' : 'stream-group-badge-event';
    const badgeIcon = hasAsync ? '⟳' : '#';

    header.innerHTML =
        '<span class="stream-group-toggle">' + (collapsed ? '▶' : '▼') + '</span>' +
        '<span class="stream-group-key ' + badgeClass + '">' + badgeIcon + ' ' + escHtml(groupKey) + '</span>' +
        '<span class="stream-group-count">' + events.length + ' event' + (events.length !== 1 ? 's' : '') + '</span>';

    section.appendChild(header);

    const content = document.createElement('div');
    content.className = 'stream-group-content';
    for (const evt of events) {
        content.appendChild(createStreamEventRow(evt));
    }
    section.appendChild(content);

    if (collapsed) {
        section.classList.add('collapsed');
    }

    return section;
}

function renderStreamTab(result: DebugResult): void {
    const streamDisplay = document.getElementById('stream-display');
    const streamCount = document.getElementById('stream-event-count');
    if (!streamDisplay) return;

    // Merge static diagnostic events with any live stream events
    const staticEvents = result.diagnosticEvents ?? [];
    const allEvents = [...staticEvents, ...liveStreamEvents];

    if (streamCount) {
        const liveLabel = streamingActive ? ' · ⟳ live' : '';
        streamCount.textContent = allEvents.length + ' events' + liveLabel;
        streamCount.classList.toggle('stream-live', streamingActive);
    }

    streamDisplay.innerHTML = '';

    if (allEvents.length === 0) {
        streamDisplay.innerHTML = '<span class="empty" style="padding:12px;display:block;text-align:center">No diagnostic events</span>';
        return;
    }

    // Group events by groupKey and render collapsible sections
    const groups = groupEventsByKey(allEvents);
    for (const [groupKey, gEvents] of groups) {
        const section = createStreamEventGroup(groupKey, gEvents);
        streamDisplay.appendChild(section);
    }

    // Auto-scroll to bottom after initial render
    streamDisplay.scrollTop = streamDisplay.scrollHeight;
}

/**
 * Append a single stream event to the Stream tab (called incrementally).
 * Finds or creates the appropriate group section by groupKey.
 */
function appendStreamEvent(evt: DiagnosticEventInfo): void {
    const streamDisplay = document.getElementById('stream-display');
    const streamCount = document.getElementById('stream-event-count');
    if (!streamDisplay) return;

    // Remove the "listening" placeholder if present
    const emptyEl = streamDisplay.querySelector('.empty');
    if (emptyEl) streamDisplay.innerHTML = '';

    const groupKey = evt.groupKey || 'General';

    // Try to find an existing group section with this key
    let groupSection = streamDisplay.querySelector(`[data-group-key="${CSS.escape(groupKey)}"]`) as HTMLElement | null;

    if (groupSection) {
        // Append the new event row to the existing group's content
        const content = groupSection.querySelector('.stream-group-content');
        if (content) {
            content.appendChild(createStreamEventRow(evt));
        }
        // Update the count badge
        const countEl = groupSection.querySelector('.stream-group-count');
        if (countEl) {
            const current = parseInt(countEl.textContent || '0', 10);
            countEl.textContent = (current + 1) + ' event' + (current + 1 !== 1 ? 's' : '');
        }
        // Auto-expand if group was collapsed (user likely wants to see new data)
        if (groupSection.classList.contains('collapsed')) {
            groupSection.classList.remove('collapsed');
            const header = groupSection.querySelector('.stream-group-header');
            if (header) header.classList.add('expanded');
        }
    } else {
        // Create a new group section for this key
        const section = createStreamEventGroup(groupKey, [evt]);
        streamDisplay.appendChild(section);
    }

    // Update the event count in toolbar
    if (streamCount) {
        const total = liveStreamEvents.length;
        streamCount.textContent = total + ' events · ⟳ live';
        streamCount.classList.add('stream-live');
    }

    // Auto-scroll to newest event
    streamDisplay.scrollTop = streamDisplay.scrollHeight;
}

/**
 * Create a single stream event DOM element.
 */
function createStreamEventRow(evt: DiagnosticEventInfo): HTMLElement {
    const row = document.createElement('div');
    row.className = 'stream-event';

    // Class for type styling
    const typeClass = 'type-' + evt.type;

    // Format elapsed time
    const timeStr = evt.elapsedNs > 0
        ? (evt.elapsedNs / 1_000_000).toFixed(2) + 'ms'
        : '—';

    // Format wall-clock timestamp badge
    const ts = new Date(evt.timestamp);
    const clockStr = ts.getHours().toString().padStart(2, '0') + ':' +
        ts.getMinutes().toString().padStart(2, '0') + ':' +
        ts.getSeconds().toString().padStart(2, '0') + '.' +
        ts.getMilliseconds().toString().padStart(3, '0');

    // Determine type label
    const typeLabel = evt.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    row.innerHTML =
        '<span class="stream-event-time">' + timeStr + '</span>' +
        '<span class="stream-event-clock">' + clockStr + '</span>' +
        '<span class="stream-event-type ' + typeClass + '">' + typeLabel + '</span>' +
        (evt.expression ? '<span class="stream-event-expr">' + escHtml(evt.expression) + '</span>' : '<span class="stream-event-expr"></span>') +
        (evt.details ? '<span class="stream-event-details">' + escHtml(evt.details) + '</span>' : '');

    return row;
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
        workerEngineLatency.textContent = avg.toFixed(2) + ' ms';
    } else {
        workerEngineLatency.textContent = '—';
    }

    /* queue depth */
    workerEngineQueue.textContent = String(engineQueueDepth);

    /* last run timestamp */
    if (engineLastRunTime > 0) {
        const ago = performance.now() - engineLastRunTime;
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
    // Render registered source names as chip badges
    if (currentResult) {
        const names = currentResult.dqMetrics.dataSourceNames;
        if (names.length > 0) {
            workerDqSources.innerHTML = names.map(n =>
                `<span class="worker-dq-source-chip">${escHtml(n)}</span>`
            ).join('');
        } else {
            workerDqSources.innerHTML = '<span class="empty">none</span>';
        }
    } else {
        workerDqSources.innerHTML = '<span class="empty">none</span>';
    }
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
