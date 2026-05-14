import { EditorView, keymap, placeholder, Decoration, WidgetType, ViewUpdate } from '@codemirror/view';
import { EditorState, StateField, RangeSetBuilder, RangeSet, StateEffect } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { SolveHighlightProvider } from '@/codemirror/SolveHighlightProvider';
import { DebugResult, Token, OpcodeInfo, ConstantInfo, PerformanceStats, MarkdownNode, LineResult } from './engine.js';
import { exampleData, fullDocumentExamples } from './examples.js';

const statsDisplay = document.getElementById('stats-display') as HTMLDivElement;
const examplesSidebar = document.getElementById('examples-sidebar') as HTMLDivElement;
const editorContainer = document.getElementById('editor-container') as HTMLDivElement;
const fullDocSelect = document.getElementById('full-doc-select') as HTMLSelectElement;
const errorsDisplay = document.getElementById('errors-display') as HTMLDivElement;
const lineResultsDisplay = document.getElementById('line-results-display') as HTMLDivElement;
const debugPanels = document.getElementById('debug-panels') as HTMLDivElement;
const tokensDisplay = document.getElementById('tokens-display') as HTMLDivElement;
const astDisplay = document.getElementById('ast-display') as HTMLDivElement;
const opcodesDisplay = document.getElementById('opcodes-display') as HTMLDivElement;
const constantsDisplay = document.getElementById('constants-display') as HTMLDivElement;
const variablesDisplay = document.getElementById('variables-display') as HTMLDivElement;
const markdownOutlineDisplay = document.getElementById('markdown-outline-display') as HTMLDivElement;
const groupTokensCheckbox = document.getElementById('group-tokens') as HTMLInputElement;
const datastoreDisplay = document.getElementById('datastore-display') as HTMLDivElement;
const backgroundThreadDisplay = document.getElementById('background-thread-display') as HTMLDivElement;

const isDev = typeof import.meta !== 'undefined' && typeof (import.meta as any).env !== 'undefined' && (import.meta as any).env.DEV;

// Debug panels are always visible in the playground environment
if (debugPanels) {
    debugPanels.classList.remove('hidden');
}

const highlightProvider = new SolveHighlightProvider();

let runId = 0;
let currentResult: DebugResult | null = null;

const engineWorker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
const dataQueryWorker = new Worker(new URL('./data-query.worker.ts', import.meta.url), { type: 'module' });

// Data query worker message handler
dataQueryWorker.onmessage = (e: MessageEvent) => {
    const { type, payload } = e.data;
    
    switch (type) {
        case "FETCH_STARTED":
            renderDataStoreUpdate(payload, 'loading');
            break;
        case "FETCH_RESPONSE":
            renderDataStoreUpdate(payload, 'success');
            break;
        case "FETCH_ERROR":
            renderDataStoreUpdate(payload, 'error');
            break;
        case "STATUS_RESPONSE":
            renderBackgroundThreadStatus(payload);
            break;
        case "DATA_SOURCE_REGISTERED":
            renderDataStoreUpdate(payload, 'registered');
            break;
    }
};

// Register currency data source
dataQueryWorker.postMessage({
    type: 'REGISTER_DATA_SOURCE',
    payload: {
        id: 'currency',
        type: 'currency',
    },
});
engineWorker.onmessage = (e: MessageEvent<{ id: number; result?: DebugResult; error?: string }>) => {
    const { id, result, error } = e.data;
    if (id !== runId) return;
    if (error) { renderErrors([error]); return; }
    if (!result) return;
    currentResult = result;
    renderAll(result);
};

const statsHistory: PerformanceStats[] = [];
const MAX_HISTORY = 50;

class ResultWidget extends WidgetType {
    constructor(readonly result: string, readonly type: string) { super(); }
    toDOM() {
        const span = document.createElement('span');
        span.className = 'os-result-inline';
        span.textContent = `→ ${this.result}`;
        span.title = this.type;
        return span;
    }
}

const resultEffect = StateEffect.define<{from: number; to: number; deco: Decoration}[]>();
const resultField = StateField.define<RangeSet<Decoration>>({
    create() { return Decoration.none; },
    update(set, tr) {
        for (const e of tr.effects) {
            if (e.is(resultEffect)) {
                const builder = new RangeSetBuilder<Decoration>();
                for (const {from, to, deco} of e.value) builder.add(from, to, deco);
                return builder.finish();
            }
        }
        return set.map(tr.changes);
    },
    provide: f => EditorView.decorations.from(f)
});

const solveHighlightPlugin = StateField.define<RangeSet<Decoration>>({
    create(state) {
        const builder = new RangeSetBuilder<Decoration>();
        const doc = state.doc;
        for (let i = 1; i <= doc.lines; i++) {
            const line = doc.line(i);
            const ranges = highlightProvider.getLineHighlights(line.text, i);
            for (const range of ranges) builder.add(line.from + range.from, line.from + range.to, Decoration.mark({ class: range.className }));
        }
        return builder.finish();
    },
    update(decorations, tr) {
        if (!tr.docChanged) return decorations;
        const builder = new RangeSetBuilder<Decoration>();
        const doc = tr.state.doc;
        for (let i = 1; i <= doc.lines; i++) {
            const line = doc.line(i);
            const ranges = highlightProvider.getLineHighlights(line.text, i);
            for (const range of ranges) builder.add(line.from + range.from, line.from + range.to, Decoration.mark({ class: range.className }));
        }
        return builder.finish();
    },
    provide: f => EditorView.decorations.from(f)
});

const editor = new EditorView({
    state: EditorState.create({
        doc: '',
        extensions: [
            basicSetup, markdown(), oneDark, solveHighlightPlugin, resultField,
            placeholder('Enter expression... e.g. 10 + 5 * 2'),
            EditorView.updateListener.of((update: ViewUpdate) => {
                if (update.docChanged) run();
            }),
            keymap.of([
                { key: 'Ctrl-Enter', run: () => { run(); return true; } },
                { key: 'Mod-Enter', run: () => { run(); return true; } }
            ]),
            EditorView.theme({ '&': { height: '100%' }, '.cm-scroller': { overflow: 'auto' } })
        ]
    }),
    parent: editorContainer
});

function renderAll(result: DebugResult): void {
    renderLineResults(result.lineResults);
    renderErrors(result.errors);
    renderStats(result.stats);
    // Always render debug data in playground
    renderTokens(result.rawTokens);
    renderAST(result.ast);
    renderOpcodes(result.opcodes);
    renderConstants(result.constants);
    renderVariables(result.variables);
    renderMarkdownOutline(result.markdownOutline);
    const effects: {from: number; to: number; deco: Decoration}[] = [];
    for (const lr of result.lineResults) {
        if (!lr.result || lr.error) continue;
        const line = editor.state.doc.line(lr.lineNumber);
        effects.push({ from: line.to, to: line.to, deco: Decoration.widget({ widget: new ResultWidget(lr.result, lr.type), side: 1 }) });
    }
    if (effects.length > 0) editor.dispatch({ effects: resultEffect.of(effects) });
}
    
    // Data sources
    const sourcesHeader = document.createElement('div');
    sourcesHeader.className = 'status-section';
    sourcesHeader.innerHTML = `<strong>Data Sources:</strong> ${payload.dataSources.length}`;
    container.appendChild(sourcesHeader);
    
    if (payload.dataSources.length > 0) {
        const sourcesList = document.createElement('div');
        sourcesList.className = 'sources-list';
        payload.dataSources.forEach((source: string) => {
            const sourceEl = document.createElement('div');
            sourceEl.className = 'source-item';
            sourceEl.textContent = source;
            sourcesList.appendChild(sourceEl);
        });
        container.appendChild(sourcesList);
    }
    
    backgroundThreadDisplay.appendChild(container);
}

let datastoreState: Map<string, any> = new Map();

function renderDataStoreUpdate(payload: any, status: string): void {
    if (!datastoreDisplay) return;
    
    const key = `${payload.dataSourceId}:${JSON.stringify(payload.queryKey)}`;
    
    switch (status) {
        case 'loading':
            datastoreState.set(key, {
                ...payload,
                status: 'loading',
                timestamp: Date.now()
            });
            break;
        case 'success':
            datastoreState.set(key, {
                ...payload,
                status: 'success',
                timestamp: Date.now()
            });
            break;
        case 'error':
            datastoreState.set(key, {
                ...payload,
                status: 'error',
                timestamp: Date.now()
            });
            break;
        case 'registered':
            // Just update the display, don't store registration
            break;
    }
    
    datastoreDisplay.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'datastore-entries';
    
    if (datastoreState.size === 0) {
        container.innerHTML = '<span class="empty">No data in store</span>';
    } else {
        datastoreState.forEach((entry, key) => {
            const entryEl = document.createElement('div');
            entryEl.className = `datastore-entry ${entry.status}`;
            
            const timeAgo = Date.now() - entry.timestamp;
            const timeStr = timeAgo < 1000 ? `${timeAgo}ms` : `${(timeAgo / 1000).toFixed(1)}s`;
            
            entryEl.innerHTML = `
                <div class="entry-key">${key}</div>
                <div class="entry-status">${entry.status}</div>
                <div class="entry-time">${timeStr} ago</div>
                ${entry.data ? `<div class="entry-value">${JSON.stringify(entry.data).substring(0, 50)}${JSON.stringify(entry.data).length > 50 ? '...' : ''}</div>` : ''}
                ${entry.error ? `<div class="entry-error">${entry.error}</div>` : ''}
            `;
            
            container.appendChild(entryEl);
        });
    }
    
    datastoreDisplay.appendChild(container);
}

// Periodically update background thread status
setInterval(() => {
    dataQueryWorker.postMessage({ type: 'GET_STATUS' });
}, 1000);
    renderLineResults(result.lineResults);
    renderErrors(result.errors);
    renderStats(result.stats);
    // Always render debug data in playground
    renderTokens(result.rawTokens);
    renderAST(result.ast);
    renderOpcodes(result.opcodes);
    renderConstants(result.constants);
    renderVariables(result.variables);
    renderMarkdownOutline(result.markdownOutline);
    const effects: {from: number; to: number; deco: Decoration}[] = [];
    for (const lr of result.lineResults) {
        if (!lr.result || lr.error) continue;
        const line = editor.state.doc.line(lr.lineNumber);
        effects.push({ from: line.to, to: line.to, deco: Decoration.widget({ widget: new ResultWidget(lr.result, lr.type), side: 1 }) });
    }
    if (effects.length > 0) editor.dispatch({ effects: resultEffect.of(effects) });
}

function renderExamplesSidebar(): void {
    examplesSidebar.innerHTML = '';
    exampleData.forEach(category => {
        const categoryEl = document.createElement('div');
        categoryEl.className = 'example-category';
        const headerEl = document.createElement('div');
        headerEl.className = 'example-category-header';
        headerEl.innerHTML = `<span class="category-name">${category.name}</span><span class="category-toggle">▶</span>`;
        const contentEl = document.createElement('div');
        contentEl.className = 'example-category-content collapsed';
        category.examples.forEach(example => {
            const exampleEl = document.createElement('div');
            exampleEl.className = 'example-item';
            exampleEl.innerHTML = `<div class="example-name">${example.name}</div><div class="example-expression">${example.expression}</div><div class="example-description">${example.description}</div>`;
            exampleEl.addEventListener('click', () => {
                editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: example.expression } });
            });
            contentEl.appendChild(exampleEl);
        });
        headerEl.addEventListener('click', () => {
            contentEl.classList.toggle('collapsed');
            const toggle = headerEl.querySelector('.category-toggle');
            if (toggle) toggle.textContent = contentEl.classList.contains('collapsed') ? '▶' : '▼';
        });
        categoryEl.appendChild(headerEl);
        categoryEl.appendChild(contentEl);
        examplesSidebar.appendChild(categoryEl);
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

let runTimeout: ReturnType<typeof setTimeout> | null = null;

function run(): void {
    if (runTimeout) {
        clearTimeout(runTimeout);
    }
    runTimeout = setTimeout(() => {
        const expression = editor.state.doc.toString().trim();
        if (!expression) { renderErrors(['Please enter an expression']); return; }
        highlightProvider.invalidateCache();
        runId++;
        engineWorker.postMessage({ id: runId, expression });
    }, 100); // Debounce by 100ms
}

function renderTokens(tokens: Token[]): void {
    if (!tokensDisplay) return;
    tokensDisplay.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'token-list';
    if (tokens.length === 0) { container.innerHTML = '<span class="empty">No tokens</span>'; tokensDisplay.appendChild(container); return; }
    const groupByLine = groupTokensCheckbox && groupTokensCheckbox.checked;
    if (groupByLine) {
        // Group tokens by line number using the token's line field
        const lines: Map<number, Token[]> = new Map();
        for (const token of tokens) {
            if (token.type === 'WS' || token.type === 'NEWLINE') continue;
            const lineNum = token.line || 1;
            if (!lines.has(lineNum)) lines.set(lineNum, []);
            lines.get(lineNum)!.push(token);
        }
        
        const wrapper = document.createElement('div'); wrapper.className = 'token-groups';
        const sortedLines = Array.from(lines.entries()).sort((a, b) => a[0] - b[0]);
        sortedLines.forEach(([lineNum, lineTokens]) => {
            const group = document.createElement('div'); group.className = 'token-line-group';
            const header = document.createElement('div'); header.className = 'token-line-header'; header.textContent = `Line ${lineNum}`;
            const content = document.createElement('div'); content.className = 'token-line-content';
            lineTokens.forEach(token => { const span = document.createElement('span'); span.className = `token token-${token.type.toLowerCase()}`; span.textContent = token.value; span.title = `Type: ${token.type}\nValue: ${token.value}\nPos: ${token.offset}`; content.appendChild(span); });
            group.appendChild(header); group.appendChild(content); wrapper.appendChild(group);
        });
        tokensDisplay.appendChild(wrapper);
    } else {
        tokens.forEach(token => { if (token.type === 'WS' || token.type === 'NEWLINE') return; const span = document.createElement('span'); span.className = `token token-${token.type.toLowerCase()}`; span.textContent = token.value; span.title = `Type: ${token.type}\nValue: ${token.value}\nPos: ${token.offset}`; container.appendChild(span); });
        tokensDisplay.appendChild(container);
    }
}

function renderOpcodes(opcodes: OpcodeInfo[]): void {
    if (!opcodesDisplay) return;
    const container = document.createElement('div'); container.className = 'opcode-list';
    if (opcodes.length === 0) { container.innerHTML = '<span class="empty">No opcodes</span>'; } else { opcodes.forEach((opcode) => { const span = document.createElement('span'); span.className = 'opcode'; span.textContent = opcode.name; const argsStr = opcode.args.length > 0 ? ` [${opcode.args.join(', ')}]` : ''; span.title = `Opcode: ${opcode.name}\nValue: ${opcode.value}\nArgs:${argsStr}`; container.appendChild(span); }); }
    opcodesDisplay.innerHTML = ''; opcodesDisplay.appendChild(container);
}

function renderConstants(constants: ConstantInfo[]): void {
    if (!constantsDisplay) return;
    const container = document.createElement('div'); container.className = 'constant-list';
    if (constants.length === 0) { container.innerHTML = '<span class="empty">No constants</span>'; } else { constants.forEach(constant => { const span = document.createElement('span'); span.className = `constant constant-${constant.type}`; span.textContent = String(constant.value); span.title = `Type: ${constant.type}\nValue: ${constant.value}\nIndex: ${constant.index}`; container.appendChild(span); }); }
    constantsDisplay.innerHTML = ''; constantsDisplay.appendChild(container);
}

function renderVariables(variables: string[]): void {
    const container = document.createElement('div'); container.className = 'variable-list';
    if (variables.length === 0) { container.innerHTML = '<span class="empty">No variables</span>'; } else { variables.forEach(variable => { const span = document.createElement('span'); span.className = 'variable'; span.textContent = variable; span.title = `Variable: ${variable}`; container.appendChild(span); }); }
    variablesDisplay.innerHTML = ''; variablesDisplay.appendChild(container);
}

function renderMarkdownOutline(markdownOutline: MarkdownNode[]): void {
    if (!markdownOutlineDisplay) return;
    markdownOutlineDisplay.innerHTML = '';
    if (markdownOutline.length === 0) { markdownOutlineDisplay.innerHTML = '<span class="empty">No markdown structure</span>'; return; }
    const container = document.createElement('div'); container.className = 'markdown-outline';
    markdownOutline.forEach(node => {
        const nodeEl = document.createElement('div'); nodeEl.className = `markdown-node markdown-node-${node.type}`; nodeEl.style.paddingLeft = `${node.depth * 15}px`;
        const statusEl = document.createElement('span'); statusEl.className = 'node-status'; statusEl.textContent = node.hasRun ? '✓' : '○'; statusEl.style.color = node.hasRun ? '#98c379' : '#a0a0a0';
        const contentEl = document.createElement('span'); contentEl.className = 'node-content'; contentEl.textContent = node.content;
        nodeEl.appendChild(statusEl); nodeEl.appendChild(contentEl);
        if (node.result) { const resultEl = document.createElement('span'); resultEl.className = 'node-result'; resultEl.textContent = `→ ${node.result}`; nodeEl.appendChild(resultEl); }
        container.appendChild(nodeEl);
    });
    markdownOutlineDisplay.appendChild(container);
}

function fmt(ns: number): string {
    if (ns < 1_000) return `${ns.toFixed(0)} ns`;
    if (ns < 1_000_000) return `${(ns / 1_000).toFixed(2)} µs`;
    if (ns < 1_000_000_000) return `${(ns / 1_000_000).toFixed(2)} ms`;
    return `${(ns / 1_000_000_000).toFixed(3)} s`;
}

function renderSparklineSvg(values: number[], color: string): string {
    if (values.length < 2) return '';
    const w = 120, h = 35;
    const max = Math.max(...values, 1);
    const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * h}`).join(' ');
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const avgY = h - (avg / max) * h;
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;overflow:visible">
        <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="0" y1="${avgY}" x2="${w}" y2="${avgY}" stroke="${color}" stroke-width="0.5" stroke-dasharray="2,2" opacity="0.5"/>
    </svg>`;
}

function renderStats(stats: PerformanceStats): void {
    statsHistory.push({ ...stats });
    if (statsHistory.length > MAX_HISTORY) statsHistory.shift();
    statsDisplay.innerHTML = '';
    const chips = [
        { label: 'Lexer', key: 'lexerTime' as const, color: 'var(--accent-blue)' },
        { label: 'Parser', key: 'parserTime' as const, color: 'var(--accent-purple)' },
        { label: 'Bytecode', key: 'bytecodeTime' as const, color: 'var(--accent-cyan)' },
        { label: 'Execute', key: 'executionTime' as const, color: 'var(--accent-green)' },
        { label: 'Total', key: 'totalTime' as const, color: 'var(--accent-yellow)' }
    ];
    chips.forEach(stat => {
        const chip = document.createElement('div');
        chip.className = 'stat-chip';
        chip.style.setProperty('--chip-color', stat.color);
        const vals = statsHistory.map(s => s[stat.key]);
        const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        const sparkline = renderSparklineSvg(vals, stat.color);
        chip.innerHTML = `
            <span class="stat-chip-label">${stat.label}</span>
            <span class="stat-chip-value" style="color: ${stat.color}">${fmt(stats[stat.key])}</span>
            <span class="stat-chip-avg" style="color: ${stat.color}">avg ${fmt(avg)}</span>
            ${sparkline ? `<div class="stat-chip-spark">${sparkline}</div>` : ''}
        `;
        statsDisplay.appendChild(chip);
    });
}

function renderAST(ast: string): void {
    if (!astDisplay) return;
    astDisplay.innerHTML = '';
    const pre = document.createElement('pre'); pre.className = 'ast-tree';
    try { const parsed = JSON.parse(ast); pre.textContent = JSON.stringify(parsed, null, 2); } catch { pre.textContent = ast; }
    astDisplay.appendChild(pre);
}

function renderLineResults(lineResults: LineResult[]): void {
    if (!lineResultsDisplay) return;
    lineResultsDisplay.innerHTML = '';
    if (lineResults.length === 0) { lineResultsDisplay.innerHTML = '<span class="empty">No results</span>'; return; }
    const container = document.createElement('div'); container.className = 'line-results';
    lineResults.forEach(lr => {
        const row = document.createElement('div'); row.className = 'line-result-row';
        const lineNum = document.createElement('span'); lineNum.className = 'line-result-num'; lineNum.textContent = `L${lr.lineNumber}`;
        const expr = document.createElement('span'); expr.className = 'line-result-expr'; expr.textContent = lr.expression;
        const typeEl = document.createElement('span'); typeEl.className = 'line-result-type'; typeEl.textContent = lr.type;
        const parseletEl = document.createElement('span'); parseletEl.className = 'line-result-parselet'; parseletEl.textContent = lr.parselet;
        const res = document.createElement('span'); res.className = 'line-result-value'; res.textContent = lr.error ? lr.error : `${lr.result}`; res.style.color = lr.error ? 'var(--accent-red)' : 'var(--accent-green)';
        row.appendChild(lineNum); row.appendChild(expr); row.appendChild(parseletEl); row.appendChild(typeEl); row.appendChild(res);
        container.appendChild(row);
    });
    lineResultsDisplay.appendChild(container);
}

function renderErrors(errors: string[]): void {
    errorsDisplay.innerHTML = '';
    if (errors.length === 0) { errorsDisplay.innerHTML = '<span class="success">No errors</span>'; return; }
    errors.forEach(error => { const div = document.createElement('div'); div.className = 'error'; if (error.includes('\n    at ')) div.innerHTML = `<pre>${error}</pre>`; else div.textContent = error; errorsDisplay.appendChild(div); });
}

function renderBackgroundThreadStatus(payload: any): void {
    if (!backgroundThreadDisplay) return;
    
    backgroundThreadDisplay.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'thread-status';
    
    // Active requests
    const requestsHeader = document.createElement('div');
    requestsHeader.className = 'status-section';
    requestsHeader.innerHTML = `<strong>Active Requests:</strong> ${payload.activeRequests.length}`;
    container.appendChild(requestsHeader);
    
    if (payload.activeRequests.length > 0) {
        const requestsList = document.createElement('div');
        requestsList.className = 'requests-list';
        payload.activeRequests.forEach((id: string) => {
            const requestEl = document.createElement('div');
            requestEl.className = 'request-item loading';
            requestEl.textContent = `Request ${id}`;
            requestsList.appendChild(requestEl);
        });
        container.appendChild(requestsList);
    }
    
    // Data sources
    const sourcesHeader = document.createElement('div');
    sourcesHeader.className = 'status-section';
    sourcesHeader.innerHTML = `<strong>Data Sources:</strong> ${payload.dataSources.length}`;
    container.appendChild(sourcesHeader);
    
    if (payload.dataSources.length > 0) {
        const sourcesList = document.createElement('div');
        sourcesList.className = 'sources-list';
        payload.dataSources.forEach((source: string) => {
            const sourceEl = document.createElement('div');
            sourceEl.className = 'source-item';
            sourceEl.textContent = source;
            sourcesList.appendChild(sourceEl);
        });
        container.appendChild(sourcesList);
    }
    
    backgroundThreadDisplay.appendChild(container);
}

let datastoreState: Map<string, any> = new Map();

function renderDataStoreUpdate(payload: any, status: string): void {
    if (!datastoreDisplay) return;
    
    const key = `${payload.dataSourceId}:${JSON.stringify(payload.queryKey)}`;
    
    switch (status) {
        case 'loading':
            datastoreState.set(key, {
                ...payload,
                status: 'loading',
                timestamp: Date.now()
            });
            break;
        case 'success':
            datastoreState.set(key, {
                ...payload,
                status: 'success',
                timestamp: Date.now()
            });
            break;
        case 'error':
            datastoreState.set(key, {
                ...payload,
                status: 'error',
                timestamp: Date.now()
            });
            break;
        case 'registered':
            // Just update the display, don't store registration
            break;
    }
    
    datastoreDisplay.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'datastore-entries';
    
    if (datastoreState.size === 0) {
        container.innerHTML = '<span class="empty">No data in store</span>';
    } else {
        datastoreState.forEach((entry, key) => {
            const entryEl = document.createElement('div');
            entryEl.className = `datastore-entry ${entry.status}`;
            
            const timeAgo = Date.now() - entry.timestamp;
            const timeStr = timeAgo < 1000 ? `${timeAgo}ms` : `${(timeAgo / 1000).toFixed(1)}s`;
            
            entryEl.innerHTML = `
                <div class="entry-key">${key}</div>
                <div class="entry-status">${entry.status}</div>
                <div class="entry-time">${timeStr} ago</div>
                ${entry.data ? `<div class="entry-value">${JSON.stringify(entry.data).substring(0, 50)}${JSON.stringify(entry.data).length > 50 ? '...' : ''}</div>` : ''}
                ${entry.error ? `<div class="entry-error">${entry.error}</div>` : ''}
            `;
            
            container.appendChild(entryEl);
        });
    }
    
    datastoreDisplay.appendChild(container);
}

// Periodically update background thread status
setInterval(() => {
    dataQueryWorker.postMessage({ type: 'GET_STATUS' });
}, 1000);

renderExamplesSidebar();
populateFullDocExamples();
editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: '10 + 5 * 2' } });

