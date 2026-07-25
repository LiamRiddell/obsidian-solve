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
import type { LineResult } from '../engine.js';
import { prepareEvaluationInput } from '../engineShared.js';
import ExamplesMenu from './ExamplesMenu.vue';

const engine = useEngineStore();
const dr = useDiagnosticReportStore();
const editorStore = useEditorStore();
const pipeline = usePipelineStore();
const ui = useUiStore();

// Dedicated main-thread engine purely for lexing/highlighting — the actual
// evaluation path (useEngineStore) runs through a Web Worker, the wrong
// tool for a synchronous per-keystroke operation. BUILTIN_PACKAGES-only
// today (the playground doesn't register OSRS or any other opt-in package
// anywhere — confirmed via grep); keep this in sync if that ever changes,
// since a mismatch would mean plugin-contributed tokens silently render
// unstyled here even though they're correctly recognized during evaluation.
const highlightEngine = new ExpressionEngine('en', false);
// highlightEngine never evaluates anything, so its own DAG is always empty —
// without this override, a lone bare word (e.g. "hello") would never be
// recognized as a real variable reference here even when it genuinely is
// one elsewhere in the document (":hello = 1"), since SolveLanguageService's
// default variable-name source reads from the SAME engine it lexes with.
// Read from the real evaluation engine's already-computed DAG snapshot
// instead (dr.dagSnapshot, populated from the worker-backed engine's own
// DependencyGraph — see DagTab.vue for the same access pattern).
const languageService = new SolveLanguageService(highlightEngine, {
  variableNameSource: () => {
    const snap = dr.dagSnapshot;
    if (!snap) return [];
    return [...Object.keys(snap.consumers), ...Object.values(snap.writes).flat()];
  },
});

/**
 * CM6 CompletionSource for the playground's editor, delegating to the same
 * languageService.getCompletions() the real Obsidian editor uses (see
 * MarkdownEditorViewPlugin.completionSource for the equivalent there). No
 * enabled/disabled setting here — the playground is a diagnostic tool with
 * no settings UI, matching the same precedent as syntax highlighting.
 */
function solveCompletionSource(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[\w]+/);
  if (!word || (word.from === word.to && !context.explicit)) return null;

  const line = context.state.doc.lineAt(context.pos);
  const items = languageService.getCompletions(line.text, context.pos - line.from);
  if (items.length === 0) return null;

  return { from: word.from, options: items.map(completionItemToOption) };
}

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
 * Syntax highlighting for solve expressions, driven by the engine-agnostic
 * SolveLanguageService + CodeMirror adapter. Wraps every semantically
 * classified token (numbers, operators, keywords, variables, punctuation,
 * ...) with a `cm-solve-{category}` decoration.
 *
 * A ViewPlugin rather than a StateField specifically so it can read
 * `view.visibleRanges` — only the lines actually on screen are lexed on
 * every rebuild, matching the real Obsidian editor's viewport-only
 * approach. An earlier version iterated the WHOLE document on every
 * rebuild regardless of scroll position, which meant every keystroke in a
 * large document re-lexed lines nobody could even see.
 *
 * Invalidation is surgical: only the lines actually touched by a change
 * are evicted from the language service's cache (via `invalidateLines`),
 * so editing one line doesn't force every other visible line's decorations
 * to be recomputed from scratch on the next render.
 */
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

const solveHighlightPlugin = ViewPlugin.fromClass(SolveHighlightPluginValue, {
  decorations: v => v.decorations,
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
        autocompletion({ override: [solveCompletionSource] }),
        placeholder('Enter an expression…  e.g. 10 + 5 * 2'),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            // See prepareEvaluationInput()'s doc comment — the document
            // text must reach the engine unmodified (never .trim()'d) so
            // every line's reported lineNumber stays aligned with its
            // actual position in the document.
            const expr = prepareEvaluationInput(update.state.doc.toString());
            // Highlight cache invalidation is now handled surgically, per
            // changed line, inside SolveHighlightPluginValue.update() —
            // no blanket clear needed here.
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
  engine.evaluate(prepareEvaluationInput(editorView.state.doc.toString()));
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
