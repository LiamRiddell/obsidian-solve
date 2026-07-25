<template>
  <main class="editor-pane" id="editor-pane" :class="{ collapsed: ui.editorCollapsed }">
    <div class="editor-pane-header">
      <span class="pane-title">Editor</span>
      <ExamplesMenu />
    </div>
    <TabBar />
    <div
      v-for="tab in tabs.tabs"
      :key="tab.id"
      class="editor-wrapper"
      v-show="tab.id === tabs.activeTabId"
      :ref="(el) => setContainerRef(tab.id, el as HTMLElement | null)"
    ></div>
  </main>
</template>

<script setup lang="ts">
import { onUnmounted, watch } from 'vue';
import { EditorView, keymap, placeholder, Decoration, WidgetType, ViewPlugin, type ViewUpdate, type DecorationSet } from '@codemirror/view';
import { EditorState, StateField, RangeSetBuilder, RangeSet, StateEffect } from '@codemirror/state';
import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { ExpressionEngine } from '@solve-js/engine/ExpressionEngine';
import { SolveLanguageService } from '@solve-js/language/SolveLanguageService';
import { categoryClassName, completionItemToOption } from '@solve-js/language/adapters/codemirror';
import { useEngineStore } from '../stores/engine.js';
import { useDiagnosticReportStore } from '../stores/diagnosticReport.js';
import { useEditorStore } from '../stores/editor.js';
import { usePipelineStore } from '../stores/pipeline.js';
import { useUiStore } from '../stores/ui.js';
import { useTabsStore } from '../stores/tabsStore.js';
import type { LineResult } from '../engine.js';
import { prepareEvaluationInput } from '../engineShared.js';
import ExamplesMenu from './ExamplesMenu.vue';
import TabBar from './TabBar.vue';

const engine = useEngineStore();
const dr = useDiagnosticReportStore();
const editorStore = useEditorStore();
const pipeline = usePipelineStore();
const ui = useUiStore();
const tabs = useTabsStore();

/* ── Inline Result Widget ─────────────────────────────────────── */
class ResultWidget extends WidgetType {
  constructor(readonly text: string, readonly type: string, readonly pending = false) { super(); }
  eq(other: ResultWidget) {
    return this.text === other.text && this.type === other.type && this.pending === other.pending;
  }
  toDOM() {
    const span = document.createElement('span');
    span.title = this.pending ? 'Awaiting async resolution…' : this.type;

    if (this.pending) {
      // Matches the real Obsidian widget's spinner treatment
      // (ExpressionResultWidget.ts) — a rotating icon plus a label,
      // rather than a plain pulsing "…" text.
      span.className = 'os-result-inline os-result-pending';
      const spinner = document.createElement('span');
      spinner.className = 'os-result-inline-spinner';
      spinner.textContent = '⟳';
      const label = document.createElement('span');
      label.className = 'os-result-inline-pending-label';
      label.textContent = '...';
      span.appendChild(spinner);
      span.appendChild(label);
      return span;
    }

    span.className = 'os-result-inline';
    span.textContent = this.text;
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

// Built once — a fresh RegExp literal was allocated on every create()/update()
// call. `g`-flagged regexes are stateful (lastIndex), which is exactly why
// every loop below resets `.lastIndex = 0` before reusing it; sharing one
// instance across calls (and across every tab's editor) is safe as long as
// that reset happens first.
const INLINE_SOLVE_RE = /s`[^`]*`/g;

/**
 * Highlights inline solve regions (`s`...``) within the editor.
 *
 * Inline solves are expressions embedded in markdown lines using the syntax
 * `s`2 + 3``. These regions get a distinct background decoration so users
 * can visually identify where inline solves are active.
 *
 * A ViewPlugin so it can read `view.visibleRanges` — only the lines
 * actually on screen are scanned on every rebuild, matching the real
 * Obsidian editor's viewport-only approach.
 */
class InlineSolvePluginValue {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  private buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    for (const { from, to } of view.visibleRanges) {
      let pos = from;
      while (pos <= to) {
        const line = view.state.doc.lineAt(pos);
        INLINE_SOLVE_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = INLINE_SOLVE_RE.exec(line.text)) !== null) {
          builder.add(
            line.from + m.index,
            line.from + m.index + m[0].length,
            Decoration.mark({ class: 'cm-inline-solve' }),
          );
        }
        pos = line.to + 1;
      }
    }
    return builder.finish();
  }
}

const inlineSolveField = ViewPlugin.fromClass(InlineSolvePluginValue, {
  decorations: v => v.decorations,
});

/**
 * Per-tab state that CANNOT be shared across tabs — each open document gets
 * its own main-thread highlighting engine and language service. This
 * mirrors how the real Obsidian plugin gives each editor pane its own
 * ExpressionEngine (see MarkdownEditorViewPlugin's doc comment): a shared
 * languageService's `variableNameSource` reads `dr.dagSnapshot` (see
 * below), which only ever reflects the ACTIVE tab — a background tab
 * sharing that same instance would highlight variables using some OTHER
 * tab's DAG, which is wrong.
 */
interface TabEditor {
  view: EditorView;
  highlightEngine: ExpressionEngine;
  languageService: SolveLanguageService;
}

const tabEditors = new Map<string, TabEditor>();
const containerEls = new Map<string, HTMLElement>();

const EDITOR_THEME = EditorView.theme({
  '&': { height: '100%' },
  '.cm-scroller': { overflow: 'auto' },
});

/**
 * Builds the syntax-highlighting ViewPlugin for ONE tab, closing over that
 * tab's own languageService instance (see TabEditor above for why this
 * can't be a single shared plugin definition).
 */
function createHighlightPlugin(languageService: SolveLanguageService) {
  class SolveHighlightPluginValue {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged) {
        const changedLines = new Set<number>();
        update.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
          const startLine = update.state.doc.lineAt(fromB).number;
          const endLine = update.state.doc.lineAt(toB).number;
          for (let line = startLine; line <= endLine; line++) changedLines.add(line);
        });
        languageService.invalidateLines(changedLines);
        this.decorations = this.buildDecorations(update.view);
      } else if (update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    private buildDecorations(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      for (const { from, to } of view.visibleRanges) {
        let pos = from;
        while (pos <= to) {
          const line = view.state.doc.lineAt(pos);
          for (const token of languageService.getSemanticTokens(line.text, line.number)) {
            builder.add(
              line.from + token.from,
              line.from + token.to,
              Decoration.mark({ class: categoryClassName(token.category) }),
            );
          }
          pos = line.to + 1;
        }
      }
      return builder.finish();
    }
  }

  return ViewPlugin.fromClass(SolveHighlightPluginValue, {
    decorations: v => v.decorations,
  });
}

/**
 * Creates the CodeMirror EditorView for one tab, including its own
 * highlighting engine/language service (see TabEditor doc comment).
 */
function createTabEditor(tabId: string, container: HTMLElement, initialDoc: string): TabEditor {
  // BUILTIN_PACKAGES-only (the playground doesn't register OSRS or any
  // other opt-in package anywhere — confirmed via grep); keep this in sync
  // if that ever changes.
  const highlightEngine = new ExpressionEngine('en', false);
  // highlightEngine never evaluates anything, so its own DAG is always
  // empty — read variable names from the real evaluation engine's
  // already-computed DAG snapshot instead. Deliberately reads dr.dagSnapshot
  // (the ACTIVE tab's snapshot) rather than something per-tab: background
  // tabs' own highlighting is a secondary concern (they're not visible),
  // and threading a per-tab DAG snapshot through the worker message
  // protocol just for invisible tabs' highlighting isn't worth the
  // complexity this pass is deliberately avoiding (see the lightweight
  // multi-tab scope this was built to).
  const languageService = new SolveLanguageService(highlightEngine, {
    variableNameSource: () => {
      const snap = dr.dagSnapshot;
      if (!snap) return [];
      return [...Object.keys(snap.consumers), ...Object.values(snap.writes).flat()];
    },
  });

  function solveCompletionSource(context: CompletionContext): CompletionResult | null {
    const word = context.matchBefore(/[\w]+/);
    if (!word || (word.from === word.to && !context.explicit)) return null;

    const line = context.state.doc.lineAt(context.pos);
    const items = languageService.getCompletions(line.text, context.pos - line.from);
    if (items.length === 0) return null;

    return { from: word.from, options: items.map(completionItemToOption) };
  }

  const view = new EditorView({
    state: EditorState.create({
      doc: initialDoc,
      extensions: [
        basicSetup, markdown(), oneDark, createHighlightPlugin(languageService), inlineSolveField, resultField,
        autocompletion({ override: [solveCompletionSource] }),
        placeholder('Enter an expression…  e.g. 10 + 5 * 2'),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            // See prepareEvaluationInput()'s doc comment — the document
            // text must reach the engine unmodified (never .trim()'d) so
            // every line's reported lineNumber stays aligned with its
            // actual position in the document.
            const expr = prepareEvaluationInput(update.state.doc.toString());
            tabs.updateTabText(tabId, expr);
            // Highlight cache invalidation is now handled surgically, per
            // changed line, inside SolveHighlightPluginValue.update() —
            // no blanket clear needed here.
            engine.evaluate(expr, tabId);
          }
          if (update.selectionSet && tabId === tabs.activeTabId) {
            const pos = update.state.selection.main.head;
            const line = update.state.doc.lineAt(pos);
            editorStore.updateCursorLine(line.number);
          }
        }),
        keymap.of([{ key: 'Ctrl-Enter', run: () => { run(tabId); return true; } }]),
        EDITOR_THEME,
      ],
    }),
    parent: container,
  });

  return { view, highlightEngine, languageService };
}

/* ── Per-tab container ref + EditorView lifecycle ─────────────────── */

function setContainerRef(tabId: string, el: HTMLElement | null): void {
  if (!el) {
    containerEls.delete(tabId);
    return;
  }
  containerEls.set(tabId, el);
  if (!tabEditors.has(tabId)) {
    const tab = tabs.tabs.find(t => t.id === tabId);
    const editor = createTabEditor(tabId, el, tab?.text ?? '');
    tabEditors.set(tabId, editor);
    engine.evaluate(tab?.text ?? '', tabId);
  }
}

// Tear down editors for tabs that no longer exist (closed tabs).
watch(() => tabs.tabs.map(t => t.id), (currentIds) => {
  const currentSet = new Set(currentIds);
  for (const [tabId, editor] of tabEditors) {
    if (!currentSet.has(tabId)) {
      editor.view.destroy();
      tabEditors.delete(tabId);
      containerEls.delete(tabId);
    }
  }
}, { flush: 'post' });

onUnmounted(() => {
  for (const editor of tabEditors.values()) editor.view.destroy();
  tabEditors.clear();
});

/* ── Public methods ───────────────────────────────────────────── */
function run(tabId?: string): void {
  const id = tabId ?? tabs.activeTabId;
  const editor = tabEditors.get(id);
  if (!editor) return;
  engine.evaluate(prepareEvaluationInput(editor.view.state.doc.toString()), id);
}

function insertExample(expression: string): void {
  const editor = tabEditors.get(tabs.activeTabId);
  if (!editor) return;
  editor.view.dispatch({ changes: { from: 0, to: editor.view.state.doc.length, insert: expression } });
}

function renderInlineResults(tabId: string, lineResults: LineResult[]): void {
  const editor = tabEditors.get(tabId);
  if (!editor) return;
  const view = editor.view;
  // Guard against destroyed editor (HMR unmount / tab close leaves stale reference)
  if (!view.dom || !view.dom.parentNode) return;
  const effects: { from: number; to: number; deco: Decoration }[] = [];
  for (const lr of lineResults) {
    if (lr.error) continue;
    const isPending = lr.type === 'Pending';
    // A Pending result formats to "" (see formatLineResultValue in
    // engineShared.ts — the queryKey must never be shown as if it were
    // the answer), so it needs its own branch instead of the `!lr.result`
    // skip other empty/non-evaluable lines take.
    if (!lr.result && !isPending) continue;
    if ((lr.lineNumber ?? 1) > view.state.doc.lines) continue;
    const line = view.state.doc.line(lr.lineNumber ?? 1);
    const text = isPending ? '…' : lr.result;
    effects.push({ from: line.to, to: line.to, deco: Decoration.widget({ widget: new ResultWidget(text, lr.type, isPending), side: 1 }) });
  }
  // Always dispatch, even with an empty effects array: resultField's update()
  // rebuilds the ENTIRE decoration set from this list every time, so skipping
  // the dispatch when every line errored (or otherwise produced no widget)
  // left whatever was previously rendered — e.g. a stale "= 293.00 gp" from
  // the last successful evaluation — stuck on screen after the line was
  // edited into something that no longer parses.
  view.dispatch({ effects: resultEffect.of(effects) });
}

// Expose for parent to call
defineExpose({ insertExample, renderInlineResults });

// Update cursor line in pipeline when store changes
watch(() => editorStore.cursorLine, (line) => {
  pipeline.selectLine(line, false);
});

// Watch for results to render inline decorators — dr.result only ever
// reflects the ACTIVE tab (see stores/engine.ts), so render into that
// tab's editor specifically.
watch(() => dr.result, (result) => {
  if (result) {
    const tabId = tabs.activeTabId;
    requestAnimationFrame(() => renderInlineResults(tabId, result.lineResults));
  }
});
</script>

<style scoped>
.editor-wrapper {
  flex: 1;
  min-height: 0;
}

:deep(.cm-inline-solve) {
  background: rgba(199, 169, 255, 0.12);
  border-radius: 3px;
  border: 1px solid rgba(199, 169, 255, 0.25);
  box-shadow: inset 0 0 0 1px rgba(199, 169, 255, 0.08);
  transition: background 0.2s;
}
:deep(.cm-inline-solve:hover) {
  background: rgba(199, 169, 255, 0.2);
}

/* Syntax highlight colors — "One Dark" palette. The playground is a
   diagnostic tool with no settings UI, so these are hardcoded rather than
   driven by CSS custom properties (unlike the real Obsidian plugin, where
   the same class names resolve `--solve-hl-*` variables from user
   settings — see src/app/styles.css). */
:deep(.cm-solve-number) { color: #61AFEF; }
:deep(.cm-solve-string) { color: #98C379; }
:deep(.cm-solve-keyword) { color: #C678DD; }
:deep(.cm-solve-operator) { color: #ABB2BF; }
:deep(.cm-solve-comparison) { color: #56B6C2; }
:deep(.cm-solve-bitwise) { color: #56B6C2; }
:deep(.cm-solve-function) { color: #E5C07B; }
:deep(.cm-solve-variable) { color: #E06C75; }
:deep(.cm-solve-unit) { color: #56B6C2; }
:deep(.cm-solve-datetime) { color: #D19A66; }
:deep(.cm-solve-vector) { color: #D19A66; }
:deep(.cm-solve-punctuation) { color: #5C6370; }
:deep(.cm-solve-error) { color: #E06C75; text-decoration: underline wavy; }
:deep(.cm-solve-osrs-item) { color: #A6E22E; font-weight: 600; }
</style>
