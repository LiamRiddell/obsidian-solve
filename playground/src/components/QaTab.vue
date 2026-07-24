<!--
  QaTab.vue — a batch test runner for manually QA-ing the engine.

  Every other diagnostic tab shows detail for the ONE expression currently
  in the editor. This tab is different on purpose: it evaluates a whole
  list of expressions (one per line, sequentially through a single engine
  instance so variable definitions carry forward like a real document) and
  reports pass/fail for all of them at once — the interactive equivalent
  of `PlaygroundExamplesValidity.spec.ts`, without needing to run jest.

  Seeded with a battery of tricky edge cases (trailing tokens, unit-dimension
  mismatches, reversed dice ranges, datetime math, empty hex/binary literals,
  ...) mirroring bugs found and fixed this way — useful both as a regression
  smoke test and as a template for trying new adversarial cases.
-->
<template>
  <div class="tab-panel active" id="panel-qa">
    <div class="panel-toolbar">
      <div class="panel-toolbar-left">
        <button class="copy-all-btn qa-run-btn" @click="runAll">
          <span class="msi msi-dense">play_arrow</span> Run all
        </button>
        <button class="copy-all-btn" title="Replace the batch with every shipped playground example" @click="loadShippedExamples">
          <span class="msi msi-dense">library_add</span> Load examples
        </button>
        <label class="toggle-label">
          <input type="checkbox" v-model="onlyFailures">
          Only failures
        </label>
      </div>
      <button v-if="hasResults" class="copy-all-btn" title="Copy failing lines and their errors" @click="copyFailures">
        <span class="msi msi-dense">content_copy</span> Copy failures
      </button>
    </div>

    <div class="panel-scroll diag-stack">
      <div class="diag-section qa-input-section">
        <div class="diag-section-header static">
          <span class="diag-section-title"><span class="msi msi-dense">edit_note</span> Test batch</span>
          <span class="diag-section-tag">{{ lineCount }} lines</span>
        </div>
        <div class="diag-section-body">
          <textarea
            v-model="source"
            class="qa-source-textarea"
            spellcheck="false"
            placeholder="One expression per line. Lines run sequentially through one engine, so :var = 10 on one line is usable on later lines."
          ></textarea>
        </div>
      </div>

      <div v-if="hasResults" class="diag-stat-grid">
        <div class="diag-stat-card">
          <span class="diag-stat-label">Passed</span>
          <span class="diag-stat-value" style="color: var(--success)">{{ counts.passed }}</span>
        </div>
        <div class="diag-stat-card">
          <span class="diag-stat-label">Failed</span>
          <span class="diag-stat-value" :class="counts.failed > 0 ? 'error' : ''">{{ counts.failed }}</span>
        </div>
        <div class="diag-stat-card">
          <span class="diag-stat-label">Pending</span>
          <span class="diag-stat-value warn">{{ counts.pending }}</span>
        </div>
        <div class="diag-stat-card">
          <span class="diag-stat-label">Total time</span>
          <span class="diag-stat-value info">{{ totalMs.toFixed(1) }} ms</span>
        </div>
      </div>

      <empty-state
        v-if="!hasResults"
        icon="science"
        text="No results yet"
        hint="Click &quot;Run all&quot; to evaluate every line in the batch above against a fresh engine instance."
      />

      <div v-else class="diag-section">
        <div class="diag-section-header static">
          <span class="diag-section-title"><span class="msi msi-dense">checklist</span> Results</span>
          <span class="diag-section-tag">{{ visibleResults.length }}</span>
        </div>
        <div class="diag-section-body qa-results-body">
          <div v-if="visibleResults.length === 0" class="empty">No failures — every line did what it was expected to do.</div>
          <div
            v-for="r in visibleResults"
            :key="r.lineNumber"
            class="qa-result-row"
            :class="'qa-result-' + resultClass(r)"
          >
            <span class="qa-result-line">L{{ r.lineNumber }}</span>
            <span class="qa-result-status-icon msi msi-dense">{{ resultIcon(r) }}</span>
            <span class="qa-result-expr" :title="r.expression">
              {{ r.expression }}
              <span v-if="r.expected === 'error'" class="qa-expected-tag">expects error</span>
            </span>
            <span class="qa-result-value" :title="r.detail">{{ r.detail }}</span>
            <span class="qa-result-time">{{ r.elapsedMs.toFixed(2) }} ms</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import EmptyState from './shared/EmptyState.vue';
import { ExpressionEngine } from '@solve-js/engine/ExpressionEngine';
import { formatValue } from '@solve-js/format/FormatEngine';
import { ValueType } from '@solve-js/vm/Value';
import { exampleData } from '../examples.js';
import { useQaStore, detectExpectation, type QaResult } from '../stores/qa.js';

const qa = useQaStore();
const source = computed({
  get: () => qa.source,
  set: (v: string) => { qa.source = v; },
});
const results = computed({
  get: () => qa.results,
  set: (v: QaResult[]) => { qa.results = v; },
});
const onlyFailures = computed({
  get: () => qa.onlyFailures,
  set: (v: boolean) => { qa.onlyFailures = v; },
});

const lineCount = computed(() =>
  source.value.split('\n').filter((l) => l.trim().length > 0).length
);

const hasResults = computed(() => results.value.length > 0);

const counts = computed(() => {
  let passed = 0, failed = 0, pending = 0;
  for (const r of results.value) {
    if (r.status === 'pending') pending++;
    else if (r.passed) passed++;
    else failed++;
  }
  return { passed, failed, pending };
});

const totalMs = computed(() => results.value.reduce((sum, r) => sum + r.elapsedMs, 0));

// "Failures" means actually broken — a line that correctly rejected invalid
// input (status: 'error', expected: 'error') is a pass and stays hidden
// under this filter, matching r.passed rather than raw status.
const visibleResults = computed(() =>
  onlyFailures.value ? results.value.filter((r) => r.status !== 'pending' && !r.passed) : results.value
);

/** Visual bucket for a result row: 'passed' | 'failed' | 'pending' — never raw status, so an expected error reads as a pass. */
function resultClass(r: QaResult): 'passed' | 'failed' | 'pending' {
  if (r.status === 'pending') return 'pending';
  return r.passed ? 'passed' : 'failed';
}

function resultIcon(r: QaResult): string {
  const cls = resultClass(r);
  if (cls === 'passed') return 'check_circle';
  if (cls === 'failed') return 'cancel';
  return 'hourglass_top';
}

function isSkippable(trimmed: string): boolean {
  return trimmed.length === 0 || trimmed.startsWith('#') || trimmed.startsWith('//');
}

function runAll(): void {
  // Fresh engine per run — diagnostics disabled (2nd ctor arg = false),
  // same lightweight config PlaygroundExamplesValidity.spec.ts uses, since
  // this tool only needs pass/fail + timing, not full pipeline tracing.
  const engine = new ExpressionEngine('en', false);
  const lines = source.value.split('\n');
  const out: QaResult[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (isSkippable(trimmed)) continue;

    // Detected from the raw line (marker included) — evaluation below still
    // runs the FULL trimmed text; the engine already strips `//...` comments
    // before parsing, so the marker never changes what's actually evaluated.
    const expected = detectExpectation(trimmed);

    const start = performance.now();
    try {
      const values = engine.evaluateLine(i + 1, trimmed);
      const elapsedMs = performance.now() - start;
      const first = values[0];
      if (first.type === ValueType.Pending) {
        out.push({ lineNumber: i + 1, expression: trimmed, status: 'pending', expected, passed: false, detail: String(first.value), elapsedMs });
      } else if (first.type === ValueType.Error) {
        out.push({ lineNumber: i + 1, expression: trimmed, status: 'error', expected, passed: expected === 'error', detail: first.unit ?? String(first.value), elapsedMs });
      } else {
        out.push({ lineNumber: i + 1, expression: trimmed, status: 'ok', expected, passed: expected === 'ok', detail: formatValue(first), elapsedMs });
      }
    } catch (e) {
      const elapsedMs = performance.now() - start;
      const message = e instanceof Error ? e.message : String(e);
      out.push({ lineNumber: i + 1, expression: trimmed, status: 'error', expected, passed: expected === 'error', detail: message, elapsedMs });
    }
  }

  results.value = out;
  engine.clear();
}

function loadShippedExamples(): void {
  const lines: string[] = [];
  for (const category of exampleData) {
    lines.push(`# ${category.name}`);
    for (const ex of category.examples) {
      // Example content may itself be multi-line (self-contained snippets
      // like ":myVar = 10\n:myVar + 5") — flatten so each sub-line still
      // runs as its own batch line.
      lines.push(...ex.expression.split('\n'));
    }
    lines.push('');
  }
  source.value = lines.join('\n');
  results.value = [];
}

function copyFailures(): void {
  const failures = results.value.filter((r) => r.status !== 'pending' && !r.passed);
  const text = failures.map((r) => `L${r.lineNumber}: "${r.expression}" -> ${r.detail}`).join('\n');
  navigator.clipboard.writeText(text || '(no failures)');
}
</script>

<style scoped>
.qa-run-btn { color: var(--accent); border-color: var(--accent-dim); }

.qa-input-section { flex-shrink: 0; }

.qa-source-textarea {
  width: 100%;
  min-height: 160px;
  resize: vertical;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 11.5px;
  line-height: 1.5;
  padding: var(--space-2);
  outline: none;
  box-sizing: border-box;
}
.qa-source-textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent-dim); }

.qa-results-body { display: flex; flex-direction: column; gap: 2px; }

.qa-result-row {
  display: grid;
  grid-template-columns: 28px 20px minmax(0, 1.3fr) minmax(0, 1.7fr) 56px;
  align-items: center;
  gap: var(--space-2);
  padding: 4px 6px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-family: var(--font-mono);
}
.qa-result-row:hover { background: var(--bg-tertiary); }

.qa-result-line { color: var(--text-muted); font-size: 10px; }

.qa-result-status-icon { font-size: 16px; }
.qa-result-passed .qa-result-status-icon { color: var(--success); }
.qa-result-failed .qa-result-status-icon { color: var(--error); }
.qa-result-pending .qa-result-status-icon { color: var(--warning); }

.qa-result-expr {
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.qa-expected-tag {
  color: var(--text-muted);
  font-size: 9.5px;
  font-style: italic;
  margin-left: var(--space-1);
}
.qa-result-failed .qa-result-expr { color: var(--text-secondary); }

.qa-result-value {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-secondary);
}
.qa-result-failed .qa-result-value { color: var(--error); }
.qa-result-pending .qa-result-value { color: var(--warning); }

.qa-result-time { color: var(--text-muted); font-size: 10px; text-align: right; }
</style>
