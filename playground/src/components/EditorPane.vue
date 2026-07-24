<template>
  <main class="editor-pane" id="editor-pane" :class="{ collapsed: ui.editorCollapsed }">
    <div class="editor-pane-header">
      <span class="pane-title">Editor</span>
      <ExamplesMenu />
    </div>
    <div class="editor-wrapper" ref="editorRef"></div>
  </main>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { EditorView, keymap, placeholder, Decoration, WidgetType } from '@codemirror/view';
import { EditorState, StateField, RangeSetBuilder, RangeSet, StateEffect } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { SolveHighlightProvider } from '@/app/codemirror/SolveHighlightProvider';
import { useEngineStore } from '../stores/engine.js';
import { useDiagnosticReportStore } from '../stores/diagnosticReport.js';
import { useEditorStore } from '../stores/editor.js';
import { usePipelineStore } from '../stores/pipeline.js';
import { useUiStore } from '../stores/ui.js';
import type { LineResult } from '../engine.js';
import ExamplesMenu from './ExamplesMenu.vue';

const engine = useEngineStore();
const dr = useDiagnosticReportStore();
const editorStore = useEditorStore();
const pipeline = usePipelineStore();
const ui = useUiStore();

const highlightProvider = new SolveHighlightProvider();

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

/**
 * StateField for syntax highlighting of solve expressions via the
 * SolveHighlightProvider. Wraps recognized token sequences (numbers,
 * operators, identifiers, etc.) with CSS class decorations.
 *
 * Recomputes on every document change via `tr.docChanged`.
 */
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

/**
 * StateField for highlighting inline solve regions (`s`...``) within the editor.
 *
 * Inline solves are expressions embedded in markdown lines using the syntax
 * `s`2 + 3``. These regions get a distinct background decoration so users
 * can visually identify where inline solves are active.
 *
 * The pattern matches `s` followed by any non-backtick content, then a
 * closing backtick. Highlights are applied as a background tint with rounded
 * corners, similar to a code-fence inline visual.
 *
 * Recomputes on every document change.
 */
const inlineSolveField = StateField.define<RangeSet<Decoration>>({
  create(state) {
    const builder = new RangeSetBuilder<Decoration>();
    const doc = state.doc;
    const re = /s`[^`]*`/g;
    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i);
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line.text)) !== null) {
        builder.add(
          line.from + m.index,
          line.from + m.index + m[0].length,
          Decoration.mark({ class: 'cm-inline-solve' }),
        );
      }
    }
    return builder.finish();
  },
  update(decorations, tr) {
    if (!tr.docChanged) return decorations;
    const builder = new RangeSetBuilder<Decoration>();
    const doc = tr.state.doc;
    const re = /s`[^`]*`/g;
    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i);
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line.text)) !== null) {
        builder.add(
          line.from + m.index,
          line.from + m.index + m[0].length,
          Decoration.mark({ class: 'cm-inline-solve' }),
        );
      }
    }
    return builder.finish();
  },
  provide: f => EditorView.decorations.from(f),
});

/* ── Editor Setup ─────────────────────────────────────────────── */
const editorRef = ref<HTMLElement | null>(null);
let editorView: EditorView | null = null;

const EDITOR_THEME = EditorView.theme({
  '&': { height: '100%' },
  '.cm-scroller': { overflow: 'auto' },
});

onMounted(() => {
  if (!editorRef.value) return;

  const initialDoc = '10 + 5 * 2\nosrs(Iron Axe)';

  editorView = new EditorView({
    state: EditorState.create({
      doc: initialDoc,
      extensions: [
        basicSetup, markdown(), oneDark, solveHighlightPlugin, inlineSolveField, resultField,
        placeholder('Enter an expression…  e.g. 10 + 5 * 2'),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const expr = update.state.doc.toString().trim();
            highlightProvider.invalidateCache();
            engine.evaluate(expr);
          }
          if (update.selectionSet) {
            const pos = update.state.selection.main.head;
            const line = update.state.doc.lineAt(pos);
            editorStore.updateCursorLine(line.number);
          }
        }),
        keymap.of([{ key: 'Ctrl-Enter', run: () => { run(); return true; } }]),
        EDITOR_THEME,
      ],
    }),
    parent: editorRef.value,
  });

  // Trigger initial evaluation
  engine.evaluate(initialDoc);
});

onUnmounted(() => {
  editorView?.destroy();
  editorView = null;
});

/* ── Public methods ───────────────────────────────────────────── */
function run(): void {
  if (!editorView) return;
  engine.evaluate(editorView.state.doc.toString().trim());
}

function insertExample(expression: string): void {
  if (!editorView) return;
  editorView.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: expression } });
}

function renderInlineResults(lineResults: LineResult[]): void {
  if (!editorView) return;
  // Guard against destroyed editor (HMR unmount leaves stale reference)
  if (!editorView.dom || !editorView.dom.parentNode) return;
  const effects: { from: number; to: number; deco: Decoration }[] = [];
  for (const lr of lineResults) {
    if (lr.error) continue;
    const isPending = lr.type === 'Pending';
    // A Pending result formats to "" (see formatLineResultValue in
    // engineShared.ts — the queryKey must never be shown as if it were
    // the answer), so it needs its own branch instead of the `!lr.result`
    // skip other empty/non-evaluable lines take.
    if (!lr.result && !isPending) continue;
    const line = editorView.state.doc.line(lr.lineNumber ?? 1);
    const text = isPending ? '…' : lr.result;
    effects.push({ from: line.to, to: line.to, deco: Decoration.widget({ widget: new ResultWidget(text, lr.type, isPending), side: 1 }) });
  }
  // Always dispatch, even with an empty effects array: resultField's update()
  // rebuilds the ENTIRE decoration set from this list every time, so skipping
  // the dispatch when every line errored (or otherwise produced no widget)
  // left whatever was previously rendered — e.g. a stale "= 293.00 gp" from
  // the last successful evaluation — stuck on screen after the line was
  // edited into something that no longer parses.
  editorView.dispatch({ effects: resultEffect.of(effects) });
}

// Expose for parent to call
defineExpose({ insertExample, renderInlineResults });

// Update cursor line in pipeline when store changes
watch(() => editorStore.cursorLine, (line) => {
  pipeline.selectLine(line, false);
});

// Watch for results to render inline decorators
watch(() => dr.result, (result) => {
  if (result) {
    requestAnimationFrame(() => renderInlineResults(result.lineResults));
  }
});
</script>

<style scoped>
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
</style>
