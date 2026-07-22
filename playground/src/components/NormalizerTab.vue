<template>
  <div class="tab-panel active" id="panel-normalizer">
    <div class="panel-scroll">
    <!--#region Empty State -->
    <div v-if="!normalizerStage" class="empty-state">
      <div class="empty-state-icon">🔄</div>
      <div class="empty-state-text">No normalizer data available</div>
      <div class="empty-state-hint">Evaluate an expression to see token normalization details</div>
    </div>

    <template v-else>
      <!-- Sticky Context Header -->
      <div class="normalizer-context-header">
        <div class="normalizer-context-left">
          <span class="normalizer-context-label">Normalizing</span>
          <span class="normalizer-context-badge">{{ activeLine !== null ? 'L' + activeLine : 'All Lines' }}</span>
        </div>
        <span class="normalizer-context-expr" :title="activeExpression">{{ activeExpression || '(empty expression)' }}</span>
      </div>

      <!-- Stats Cards -->
      <div class="normalizer-stats-row">
        <div class="normalizer-stat-card">
          <span class="normalizer-stat-label">Input Tokens</span>
          <span class="normalizer-stat-value">{{ data.inputTokenCount }}</span>
        </div>
        <div class="normalizer-stat-card">
          <span class="normalizer-stat-label">Output Tokens</span>
          <span class="normalizer-stat-value">{{ data.outputTokenCount }}</span>
        </div>
        <div class="normalizer-stat-card">
          <span class="normalizer-stat-label">Fusions</span>
          <span class="normalizer-stat-value">{{ data.fusions.length }}</span>
        </div>
        <div class="normalizer-stat-card">
          <span class="normalizer-stat-label">Tokens Removed</span>
          <span class="normalizer-stat-value" style="color: #f48771">{{ tokensRemoved }}</span>
        </div>
        <div class="normalizer-stat-card">
          <span class="normalizer-stat-label">Type-Guard Skips</span>
          <span class="normalizer-stat-value" style="color: #5ac8fa">{{ typeGuardSkipCount }}</span>
        </div>
      </div>

      <!-- Token Fusions -->
      <div class="normalizer-section">
        <div class="normalizer-section-header">
          <span class="normalizer-section-title">🔗 Token Fusions</span>
          <span class="normalizer-tag">{{ data.fusions.length }} fusions</span>
        </div>
        <div class="normalizer-section-body scrollable-section">
          <div v-if="data.fusions.length === 0" class="normalizer-empty">No tokens were fused</div>
          <div v-for="(group, gi) in fusionGroups" :key="gi" class="fusion-group">
            <div class="fusion-group-header">
              <span class="fusion-group-rule">{{ group.rule }}</span>
              <span class="fusion-group-count">{{ group.fusions.length }} fusion{{ group.fusions.length !== 1 ? 's' : '' }}</span>
              <span v-if="group.rule === 'phrase-trie'" class="trie-indicator">🌳 trie match</span>
            </div>
            <table class="fusion-table">
              <thead>
                <tr>
                  <th class="fusion-col-source">Source Tokens</th>
                  <th class="fusion-col-arrow"></th>
                  <th class="fusion-col-fused">Fused Token</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(fusion, fi) in group.fusions" :key="fi" class="fusion-row">
                  <td class="fusion-col-source">
                    <span class="fusion-source-tokens">
                      <span v-for="(st, si) in fusion.sourceTokens" :key="si" class="fusion-token-chip" :class="tokenClass(st)" :title="`${st.type}: ${st.value}`">{{ st.value }}</span>
                    </span>
                  </td>
                  <td class="fusion-col-arrow">
                    <span class="fusion-arrow">→</span>
                  </td>
                  <td class="fusion-col-fused">
                    <span class="fusion-fused-chip" :class="tokenClass(fusion.fusedToken)" :title="`${fusion.fusedToken.type}: ${fusion.fusedToken.value}`">
                      <span class="fusion-fused-type">{{ fusion.fusedToken.type }}</span>
                      <span class="fusion-fused-value">{{ fusion.fusedToken.value }}</span>
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Token Diff (Before/After) -->
      <div class="normalizer-section">
        <div class="normalizer-section-header">
          <span class="normalizer-section-title">📊 Token Diff</span>
          <span class="normalizer-tag">{{ rawTokens.length }} → {{ data.tokens.length }}</span>
        </div>
        <div class="normalizer-section-body scrollable-section">
          <div class="diff-column-headers">
            <div class="diff-header-left">
              <span class="diff-header-label">Raw (before)</span>
              <span class="diff-header-count">{{ rawTokens.length }} tokens</span>
            </div>
            <div class="diff-header-gutter"></div>
            <div class="diff-header-right">
              <span class="diff-header-label">Normalized (after)</span>
              <span class="diff-header-count">{{ data.tokens.length }} tokens</span>
            </div>
          </div>
          <div class="diff-rows">
            <div v-for="(seg, si) in diffSegments" :key="si" class="diff-segment" :class="{ 'diff-segment-fusion': seg.isFusion }">
              <div class="diff-cell-left">
                <template v-if="seg.isFusion">
                  <div class="diff-fusion-bracket">
                    <div class="diff-fusion-bracket-line"></div>
                    <div class="diff-fusion-source-tokens">
                      <span v-for="(st, ti) in seg.sourceTokens" :key="ti" class="fusion-token-chip diff-fusion-chip" :class="tokenClass(st)" :title="`${st.type}: ${st.value}`">{{ st.value }}</span>
                    </div>
                    <div class="diff-fusion-rule-label">{{ seg.fusionRule }}</div>
                  </div>
                </template>
                <template v-else>
                  <span v-if="seg.rawToken" class="fusion-token-chip diff-unchanged-chip" :class="tokenClass(seg.rawToken)" :title="`${seg.rawToken.type}: ${seg.rawToken.value}`">{{ seg.rawToken.value }}</span>
                </template>
              </div>
              <div class="diff-cell-gutter">
                <span v-if="seg.isFusion" class="diff-fusion-arrow" :title="`Fused by: ${seg.fusionRule}`">→</span>
                <span v-else-if="seg.rawToken" class="diff-pass-arrow">→</span>
              </div>
              <div class="diff-cell-right">
                <template v-if="seg.isFusion">
                  <span v-for="(ft, fi) in seg.fusedTokens" :key="fi" class="diff-fused-chip-wrapper">
                    <span class="diff-fused-chip" :class="tokenClass(ft)" :title="`${ft.type}: ${ft.value}`">
                      <span class="diff-fused-type">{{ ft.type }}</span>
                      <span class="diff-fused-value">{{ ft.value }}</span>
                    </span>
                  </span>
                  <span class="diff-fusion-badge">fusion</span>
                </template>
                <template v-else>
                  <span v-if="seg.normalizedToken" class="diff-unchanged-chip" :class="tokenClass(seg.normalizedToken)" :title="`${seg.normalizedToken.type}: ${seg.normalizedToken.value}`">{{ seg.normalizedToken.value }}</span>
                </template>
              </div>
            </div>
          </div>
          <div class="diff-stream-view">
            <div class="diff-stream-label">Full stream:</div>
            <div class="diff-stream-tokens">
              <span v-for="(tk, i) in rawTokens" :key="'r'+i" class="fusion-token-chip" :class="[tokenClass(tk), { 'diff-consumed': fusionConsumed.has(i) }]" :title="fusionConsumed.has(i) ? 'Consumed by fusion' : ''">{{ tk.value }}</span>
              <span class="diff-stream-arrow">→</span>
              <span v-for="(tk, i) in data.tokens" :key="'n'+i" class="fusion-token-chip" :class="[tokenClass(tk), { 'diff-new': fusionResults.has(i) }]" :title="fusionResults.has(i) ? 'Fusion result' : ''">{{ tk.value }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Rules Applied -->
      <div class="normalizer-section">
        <div class="normalizer-section-header">
          <span class="normalizer-section-title">📋 Rules Applied</span>
          <span class="normalizer-tag">{{ data.rulesApplied.length }} rules</span>
        </div>
        <div class="normalizer-section-body scrollable-section">
          <div v-if="data.rulesApplied.length === 0" class="normalizer-empty">No rules were applied</div>
          <div v-else class="normalizer-rules-grid">
            <div v-for="r in data.rulesApplied" :key="r.rule" class="normalizer-rule-chip" :class="{ 'rule-trie': r.rule === 'phrase-trie' }">
              <span class="normalizer-rule-name">{{ r.rule }}</span>
              <span class="normalizer-rule-count">×{{ r.count }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Normalization Flow -->
      <div class="normalizer-section">
        <div class="normalizer-section-header">
          <span class="normalizer-section-title">🔀 Normalization Flow</span>
          <span class="normalizer-tag">{{ flowSteps.length }} steps</span>
        </div>
        <div class="normalizer-section-body scrollable-section">
          <div v-if="flowSteps.length === 0" class="normalizer-empty">No tokens to normalize</div>
          <div v-else class="flow-timeline">
            <div v-for="(step, si) in flowSteps" :key="si" class="flow-step" :class="{ 'flow-step-skip': step.action === 'skip', 'flow-step-fuse': step.action === 'fuse', 'flow-step-pass': step.action === 'pass' }">
              <div class="flow-step-pos">{{ step.position }}</div>
              <div class="flow-step-token">
                <span class="flow-step-token-chip" :class="tokenClass({ type: step.tokenType })">{{ step.tokenValue }}</span>
              </div>
              <div class="flow-step-action">
                <span v-if="step.action === 'skip'" class="flow-action-label skip-label">⏭ Type-guard skip</span>
                <span v-else-if="step.action === 'fuse'" class="flow-action-label fuse-label">
                  🔗 {{ step.fusionRule }}
                  <span class="flow-fuse-arrow">→</span>
                  <span class="flow-fuse-result-chip">{{ step.fusedValue }}</span>
                </span>
                <span v-else class="flow-action-label pass-label">→ pass through</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- PhraseTrie Overview -->
      <div class="normalizer-section">
        <div class="normalizer-section-header">
          <span class="normalizer-section-title">🌳 PhraseTrie Overview</span>
          <span class="normalizer-tag">{{ triePhraseCount }} phrases</span>
        </div>
        <div class="normalizer-section-body scrollable-section">
          <div v-if="triePhraseCount === 0" class="normalizer-empty">No phrases registered</div>
          <template v-else>
            <div class="trie-description">
              <span class="trie-desc-text">Word-level trie — single-pass O(depth) matching per position. Longest-match-wins.</span>
            </div>
            <div class="trie-tree">
              <div v-for="group in trieTree" :key="group.root" class="trie-root-node">
                <div class="trie-root-label">
                  <span class="trie-root-dot" :class="{ matched: group.matched }"></span>
                  <span class="trie-root-word">{{ group.root }}</span>
                  <span v-if="group.matched" class="trie-matched-badge">matched</span>
                </div>
                <div v-if="group.children.length > 0" class="trie-children">
                  <div v-for="child in group.children" :key="child.path" class="trie-branch">
                    <span class="trie-branch-line">├─</span>
                    <span class="trie-branch-word">{{ child.word }}</span>
                    <span class="trie-branch-type">{{ child.tokenType }}</span>
                    <span v-if="child.matched" class="trie-matched-badge">matched</span>
                    <span v-else-if="child.singleton" class="trie-leaf-badge">leaf</span>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDiagnosticReportStore } from '../stores/diagnosticReport.js';
import { usePipelineStore } from '../stores/pipeline.js';
import type { PipelineStageResult, NormalizerOutput, LexerOutput } from '@/solve-js/src/types/DiagnosticPipelineResult';
import type { Token } from '@/solve-js/src/lexer/Token';

const dr = useDiagnosticReportStore();
const pl = usePipelineStore();



/* ── Sticky header data ─────────────────────────────────────── */
const activeLine = computed(() => pl.selectedLine);
const activeExpression = computed(() => {
  const ln = activeLine.value;
  if (ln !== null) {
    const lr = dr.lineResults.find(r => r.lineNumber === ln);
    return lr?.expression ?? '';
  }
  // All lines — show first evaluated line
  const first = dr.lineResults[0];
  return first?.expression ?? dr.expression ?? '';
});

/* ── Data access ─────────────────────────────────────────────── */
const normalizerStage = computed<PipelineStageResult | null>(() => {
  const stages = dr.stages;
  if (!stages) return null;
  return stages.find(s => s.stage === 'normalizer') ?? null;
});

const data = computed<NormalizerOutput>(() => {
  const stage = normalizerStage.value;
  if (!stage) return { type: 'normalizer', inputTokenCount: 0, outputTokenCount: 0, fusions: [], rulesApplied: [], tokens: [] };
  return stage.output as NormalizerOutput;
});

const rawTokens = computed<Token[]>(() => {
  const stages = dr.stages;
  if (!stages) return [];
  const lexer = stages.find(s => s.stage === 'lexer');
  if (!lexer) return [];
  return (lexer.output as LexerOutput).tokens ?? [];
});

const tokensRemoved = computed(() => data.value.inputTokenCount - data.value.outputTokenCount);

/* ── Type-Guard Skip Count ──────────────────────────────────── */
/** Count of raw tokens that would be skipped by the Uint8Array type-guard. */
const typeGuardSkipCount = computed(() => {
  const nonWordTypes = new Set(['NUMBER', 'HEX', 'BIGINT', 'FLOAT', 'LSHIFT', 'RSHIFT', 'BIT_AND', 'BIT_OR', 'BIT_XOR',
    'LPAREN', 'RPAREN', 'LBRACKET', 'RBRACKET', 'COMMA', 'COLON', 'EQUALS', 'PIPE', 'AMPERSAND', 'AT',
    'SEMICOLON', 'QUESTION', 'EXCLAMATION', 'EOF', 'WS', 'NEWLINE']);
  return rawTokens.value.filter(t => nonWordTypes.has(t.type as string)).length;
});

/* ── PhraseTrie Tree ─────────────────────────────────────────── */
interface TrieBranch { word: string; tokenType: string; path: string; matched: boolean; singleton: boolean }
interface TrieRoot { root: string; matched: boolean; children: TrieBranch[] }

/** Phrases registered in the trie — provided directly by the engine via NormalizerOutput. */
const triePhrases = computed<Record<string, string>>(() => {
  return data.value.phrases ?? {};
});

const triePhraseCount = computed(() => Object.keys(triePhrases.value).length);

/** Build trie tree from registered phrases with matched highlights from fusion data. */
const trieTree = computed<TrieRoot[]>(() => {
  const phrases = triePhrases.value;
  // Build matched phrase set from actual phrase strings (join source token values),
  // not from fusion rule names. This ensures trie tree badges light up correctly.
  const matchedPhrases = new Set(
    data.value.fusions.map(f => f.sourceTokens.map(s => s.value).join(' ').toLowerCase())
  );
  const rootMap = new Map<string, TrieBranch[]>();

  for (const [phrase, tokenType] of Object.entries(phrases)) {
    const words = phrase.split(' ');
    const root = words[0];
    if (!rootMap.has(root)) rootMap.set(root, []);
    if (words.length > 1) {
      rootMap.get(root)!.push({
        word: words.slice(1).join(' '), tokenType, path: phrase,
        matched: matchedPhrases.has(phrase), singleton: false,
      });
    } else {
      rootMap.get(root)!.push({ word: '', tokenType, path: phrase, matched: matchedPhrases.has(phrase), singleton: true });
    }
  }

  return Array.from(rootMap.entries()).map(([root, children]) => ({
    root,
    matched: children.some(c => c.matched),
    children,
  }));
});

/* ── Normalization Flow ──────────────────────────────────────── */
interface FlowStep {
  position: string;
  tokenType: string;
  tokenValue: string;
  action: 'skip' | 'fuse' | 'pass';
  fusionRule: string;
  fusedValue: string;
}

/** Build step-by-step normalization flow from raw tokens and fusions. */
const flowSteps = computed<FlowStep[]>(() => {
  const raw = rawTokens.value;
  const fusions = data.value.fusions;
  const steps: FlowStep[] = [];
  let rawIdx = 0;

  while (rawIdx < raw.length) {
    // Check if this position starts a fusion
    let fusionFound = false;
    for (const f of fusions) {
      if (rawIdx + f.sourceTokens.length > raw.length) continue;
      let match = true;
      for (let j = 0; j < f.sourceTokens.length; j++) {
        if (raw[rawIdx + j].type !== f.sourceTokens[j].type || raw[rawIdx + j].value !== f.sourceTokens[j].value) { match = false; break; }
      }
      if (match) {
        steps.push({
          position: `pos ${rawIdx}`,
          tokenType: f.sourceTokens[0].type as string,
          tokenValue: f.sourceTokens.map(s => s.value).join(' '),
          action: 'fuse',
          fusionRule: f.rule,
          fusedValue: `${f.fusedToken.type}:${f.fusedToken.value}`,
        });
        rawIdx += f.sourceTokens.length;
        fusionFound = true;
        break;
      }
    }
    if (fusionFound) continue;

    // Check if this token would be type-guard skipped
    const nonWordTypes = new Set(['NUMBER', 'HEX', 'BIGINT', 'FLOAT', 'LSHIFT', 'RSHIFT', 'BIT_AND', 'BIT_OR', 'BIT_XOR',
      'LPAREN', 'RPAREN', 'LBRACKET', 'RBRACKET', 'COMMA', 'COLON', 'EQUALS', 'PIPE', 'AMPERSAND', 'AT',
      'SEMICOLON', 'QUESTION', 'EXCLAMATION', 'EOF', 'WS', 'NEWLINE']);
    if (nonWordTypes.has(raw[rawIdx].type as string)) {
      steps.push({ position: `pos ${rawIdx}`, tokenType: raw[rawIdx].type as string, tokenValue: raw[rawIdx].value as string, action: 'skip', fusionRule: '', fusedValue: '' });
    } else {
      steps.push({ position: `pos ${rawIdx}`, tokenType: raw[rawIdx].type as string, tokenValue: raw[rawIdx].value as string, action: 'pass', fusionRule: '', fusedValue: '' });
    }
    rawIdx++;
  }
  return steps;
});

/* ── Fusion index detection ──────────────────────────────────── */
const fusionConsumed = computed<Set<number>>(() => {
  const raw = rawTokens.value;
  const consumed = new Set<number>();
  for (const f of data.value.fusions) {
    const sourceCount = f.sourceTokens.length;
    for (let start = 0; start <= raw.length - sourceCount; start++) {
      if (consumed.has(start)) continue;
      let match = true;
      for (let j = 0; j < sourceCount; j++) {
        const st = f.sourceTokens[j];
        const rt = raw[start + j];
        if (consumed.has(start + j) || rt.type !== st.type || rt.value !== st.value) { match = false; break; }
      }
      if (match) { for (let j = 0; j < sourceCount; j++) consumed.add(start + j); break; }
    }
  }
  return consumed;
});

const fusionResults = computed<Set<number>>(() => {
  const norm = data.value.tokens;
  const results = new Set<number>();
  for (const f of data.value.fusions) {
    const ft = f.fusedToken;
    for (let i = 0; i < norm.length; i++) {
      if (!results.has(i) && norm[i].type === ft.type && norm[i].value === ft.value) { results.add(i); break; }
    }
  }
  return results;
});

/* ── Diff segments ───────────────────────────────────────────── */
interface DiffSegment {
  isFusion: boolean; rawToken: Token | null; sourceTokens: Token[];
  normalizedToken: Token | null; fusedTokens: Token[]; fusionRule: string;
}
const diffSegments = computed<DiffSegment[]>(() => {
  const raw = rawTokens.value;
  const norm = data.value.tokens;
  const consumed = fusionConsumed.value;
  const results = fusionResults.value;
  const fusions = data.value.fusions;
  const segments: DiffSegment[] = [];
  let rawIdx = 0, normIdx = 0;
  while (rawIdx < raw.length || normIdx < norm.length) {
    const isStartOfFusion = consumed.has(rawIdx) && !consumed.has(rawIdx - 1);
    if (isStartOfFusion && rawIdx < raw.length) {
      const fusion = fusions.find(f => {
        for (let j = 0; j < f.sourceTokens.length; j++) {
          if (rawIdx + j >= raw.length) return false;
          if (raw[rawIdx + j].type !== f.sourceTokens[j].type || raw[rawIdx + j].value !== f.sourceTokens[j].value) return false;
        }
        return true;
      });
      if (fusion && fusion.sourceTokens.length > 0) {
        const sourceCount = fusion.sourceTokens.length;
        const fusedTokens: Token[] = [];
        if (normIdx < norm.length && results.has(normIdx)) { fusedTokens.push(norm[normIdx]); normIdx++; }
        segments.push({ isFusion: true, rawToken: null, sourceTokens: fusion.sourceTokens, normalizedToken: null, fusedTokens: fusedTokens.length > 0 ? fusedTokens : [fusion.fusedToken], fusionRule: fusion.rule });
        rawIdx += sourceCount;
        continue;
      }
    }
    if (rawIdx < raw.length && consumed.has(rawIdx)) { rawIdx++; continue; }
    if (normIdx < norm.length && results.has(normIdx)) { segments.push({ isFusion: true, rawToken: null, sourceTokens: [], normalizedToken: null, fusedTokens: [norm[normIdx]], fusionRule: 'fusion result' }); normIdx++; continue; }
    if (rawIdx < raw.length && normIdx < norm.length) { segments.push({ isFusion: false, rawToken: raw[rawIdx], sourceTokens: [], normalizedToken: norm[normIdx], fusedTokens: [], fusionRule: '' }); rawIdx++; normIdx++; continue; }
    if (rawIdx < raw.length) { segments.push({ isFusion: false, rawToken: raw[rawIdx], sourceTokens: [], normalizedToken: null, fusedTokens: [], fusionRule: '' }); rawIdx++; continue; }
    if (normIdx < norm.length) { segments.push({ isFusion: false, rawToken: null, sourceTokens: [], normalizedToken: norm[normIdx], fusedTokens: [], fusionRule: '' }); normIdx++; continue; }
    break;
  }
  return segments;
});

/* ── Fusion grouping ─────────────────────────────────────────── */
const fusionGroups = computed<{ rule: string; fusions: any[] }[]>(() => {
  const groups = new Map<string, any[]>();
  for (const f of data.value.fusions) {
    if (!groups.has(f.rule)) groups.set(f.rule, []);
    groups.get(f.rule)!.push(f);
  }
  return Array.from(groups.entries()).map(([rule, fusions]) => ({ rule, fusions }));
});

/* ── Token CSS ───────────────────────────────────────────────── */
function tokenClass(t: { type?: string }): string {
  const type = String(t.type || '').toLowerCase();
  if (['number', 'hex', 'bigint'].includes(type)) return 'val-number';
  if (type === 'ident') return 'val-ident';
  if (['star', 'plus', 'minus', 'slash', 'caret', 'equals'].includes(type)) return 'val-operator';
  if (type === 'keyword' || type.includes('_by')) return 'val-keyword';
  return 'val-default';
}
</script>

<style scoped>
#panel-normalizer { display: flex; flex-direction: column; min-height: 0; }
#panel-normalizer .panel-scroll { display: flex; flex-direction: column; gap: 12px; padding: 8px; }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 180px; gap: 8px; color: var(--text-muted, #6b6b75); }
.empty-state-icon { font-size: 28px; opacity: 0.5; }
.empty-state-text { font-size: 13px; font-weight: 500; }
.empty-state-hint { font-size: 10px; opacity: 0.6; }

/* ── Sticky Context Header ──────────────────────────────────── */
.normalizer-context-header { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: var(--background-primary, #1e1e2e); border: 1px solid rgba(41,206,153,0.15); border-radius: 6px; flex-shrink: 0; position: sticky; top: 0; z-index: 5; }
.normalizer-context-left { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.normalizer-context-label { font-size: 10px; font-weight: 600; color: var(--text-muted, #6b6b75); text-transform: uppercase; letter-spacing: 0.4px; }
.normalizer-context-badge { display: inline-flex; align-items: center; padding: 1px 7px; border-radius: 3px; background: rgba(41,206,153,0.15); color: var(--accent, #29ce99); font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; border: 1px solid rgba(41,206,153,0.25); }
.normalizer-context-expr { flex: 1; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text-primary, #d4d4d8); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

.normalizer-stats-row { display: flex; gap: 8px; flex-wrap: wrap; }
.normalizer-stat-card { flex: 1; min-width: 80px; background: rgba(107,107,117,0.08); border: 1px solid rgba(107,107,117,0.15); border-radius: 6px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; }
.normalizer-stat-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted, #6b6b75); }
.normalizer-stat-value { font-size: 20px; font-weight: 700; color: var(--text-normal, #d4d4d8); font-variant-numeric: tabular-nums; }

.normalizer-section { background: rgba(107,107,117,0.06); border: 1px solid rgba(107,107,117,0.12); border-radius: 6px; }
.normalizer-section-header { display: flex; align-items: center; gap: 8px; padding: 8px 10px; }
.normalizer-section-title { font-size: 12px; font-weight: 600; color: var(--text-normal, #d4d4d8); }
.normalizer-tag { font-size: 9px; color: var(--text-muted, #6b6b75); background: rgba(107,107,117,0.12); padding: 1px 6px; border-radius: 4px; margin-left: auto; }

.normalizer-section-body { padding: 8px 10px; border-top: 1px solid rgba(107,107,117,0.08); }
.normalizer-section-body.scrollable-section { overflow-y: visible; }
.normalizer-empty { font-size: 10px; color: var(--text-muted, #6b6b75); padding: 8px 0; }

/* ── PhraseTrie Tree ─────────────────────────────────────────── */
.trie-description { margin-bottom: 8px; }
.trie-desc-text { font-size: 9px; color: var(--text-muted, #6b6b75); font-style: italic; }
.trie-tree { display: flex; flex-direction: column; gap: 6px; }
.trie-root-node { background: rgba(107,107,117,0.05); border: 1px solid rgba(107,107,117,0.1); border-radius: 4px; padding: 6px 8px; }
.trie-root-label { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.trie-root-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(107,107,117,0.3); flex-shrink: 0; }
.trie-root-dot.matched { background: #4ec9b0; box-shadow: 0 0 4px rgba(78,201,176,0.4); }
.trie-root-word { font-size: 11px; font-weight: 600; color: var(--text-normal, #d4d4d8); font-family: 'JetBrains Mono', monospace; }
.trie-children { margin-left: 16px; display: flex; flex-direction: column; gap: 2px; }
.trie-branch { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
.trie-branch-line { color: rgba(107,107,117,0.4); font-family: monospace; font-size: 10px; }
.trie-branch-word { font-size: 10px; color: #dcdcaa; font-family: 'JetBrains Mono', monospace; }
.trie-branch-type { font-size: 8px; color: #4ec9b0; background: rgba(78,201,176,0.1); padding: 0px 4px; border-radius: 3px; text-transform: uppercase; letter-spacing: 0.3px; }
.trie-matched-badge { font-size: 8px; color: #4ec9b0; background: rgba(78,201,176,0.15); padding: 1px 5px; border-radius: 3px; font-weight: 600; }
.trie-leaf-badge { font-size: 8px; color: var(--text-muted, #6b6b75); }
.trie-indicator { font-size: 9px; color: #4ec9b0; margin-left: 4px; }

/* ── Normalization Flow ──────────────────────────────────────── */
.flow-timeline { display: flex; flex-direction: column; gap: 3px; }
.flow-step { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 4px; border: 1px solid transparent; transition: background 0.15s; }
.flow-step:hover { background: rgba(107,107,117,0.06); }
.flow-step-skip { border-left: 3px solid #5ac8fa; background: rgba(90,200,250,0.04); }
.flow-step-fuse { border-left: 3px solid #9b7bec; background: rgba(155,123,236,0.06); }
.flow-step-pass { border-left: 3px solid rgba(107,107,117,0.2); }
.flow-step-pos { font-size: 9px; color: var(--text-muted, #6b6b75); min-width: 36px; font-family: 'JetBrains Mono', monospace; }
.flow-step-token-chip { display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 9px; font-family: 'JetBrains Mono', monospace; border: 1px solid rgba(107,107,117,0.2); }
.flow-step-action { flex: 1; display: flex; align-items: center; gap: 6px; }
.flow-action-label { font-size: 10px; }
.skip-label { color: #5ac8fa; }
.fuse-label { color: #9b7bec; }
.pass-label { color: var(--text-muted, #6b6b75); }
.flow-fuse-arrow { color: #9b7bec; font-weight: 700; margin: 0 2px; }
.flow-fuse-result-chip { display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 9px; font-family: 'JetBrains Mono', monospace; background: rgba(155,123,236,0.1); border: 1px solid rgba(155,123,236,0.2); color: #9b7bec; }

/* ── Rules ───────────────────────────────────────────────────── */
.normalizer-rules-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.normalizer-rule-chip { display: inline-flex; align-items: center; gap: 5px; background: rgba(78,201,176,0.1); border: 1px solid rgba(78,201,176,0.2); border-radius: 4px; padding: 3px 8px; font-size: 10px; }
.normalizer-rule-chip.rule-trie { background: rgba(78,201,176,0.15); border-color: rgba(78,201,176,0.35); }
.normalizer-rule-name { color: var(--text-normal, #d4d4d8); font-family: 'JetBrains Mono', monospace; }
.normalizer-rule-count { color: #4ec9b0; font-weight: 600; }

/* ── Fusions ─────────────────────────────────────────────────── */
.fusion-group { margin-bottom: 10px; }
.fusion-group:last-child { margin-bottom: 0; }
.fusion-group-header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.fusion-group-rule { font-size: 10px; font-weight: 600; color: #4ec9b0; font-family: 'JetBrains Mono', monospace; }
.fusion-group-count { font-size: 9px; color: var(--text-muted, #6b6b75); }
.fusion-table { width: 100%; border-collapse: collapse; font-size: 10px; }
.fusion-table th { text-align: left; padding: 4px 6px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted, #6b6b75); border-bottom: 1px solid rgba(107,107,117,0.12); }
.fusion-table td { padding: 4px 6px; vertical-align: middle; }
.fusion-row:hover { background: rgba(107,107,117,0.06); }
.fusion-col-source { width: auto; }
.fusion-col-arrow { width: 30px; text-align: center; }
.fusion-col-fused { width: auto; white-space: nowrap; }
.fusion-source-tokens { display: flex; flex-wrap: wrap; gap: 3px; }
.fusion-token-chip { display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 9px; font-family: 'JetBrains Mono', monospace; border: 1px solid rgba(107,107,117,0.2); cursor: default; }
.fusion-arrow { color: var(--text-muted, #6b6b75); font-size: 12px; }
.fusion-fused-chip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 7px; border-radius: 4px; font-size: 10px; font-family: 'JetBrains Mono', monospace; border: 1px solid; cursor: default; }
.fusion-fused-type { font-weight: 600; font-size: 8px; text-transform: uppercase; letter-spacing: 0.4px; opacity: 0.7; }
.fusion-fused-value { font-weight: 500; }

.val-number  { color: #5ac8fa; border-color: rgba(90,200,250,0.3); background: rgba(90,200,250,0.08); }
.val-ident   { color: #dcdcaa; border-color: rgba(220,220,170,0.2); background: rgba(220,220,170,0.06); }
.val-operator { color: #c586c0; border-color: rgba(197,134,192,0.3); background: rgba(197,134,192,0.08); }
.val-keyword { color: #9b7bec; border-color: rgba(155,123,236,0.3); background: rgba(155,123,236,0.08); }
.val-default { color: var(--text-muted, #6b6b75); border-color: rgba(107,107,117,0.2); background: rgba(107,107,117,0.06); }

/* ── Diff ────────────────────────────────────────────────────── */
.diff-column-headers { display: grid; grid-template-columns: 1fr 40px 1fr; gap: 8px; margin-bottom: 8px; padding: 0 4px; }
.diff-header-left, .diff-header-right { display: flex; align-items: center; gap: 8px; }
.diff-header-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted, #6b6b75); }
.diff-header-count { font-size: 9px; color: var(--text-muted, #6b6b75); background: rgba(107,107,117,0.1); padding: 1px 5px; border-radius: 3px; }
.diff-header-right { justify-content: flex-end; }
.diff-header-gutter { min-width: 40px; }
.diff-rows { display: flex; flex-direction: column; gap: 2px; }
.diff-segment { display: grid; grid-template-columns: 1fr 40px 1fr; gap: 8px; align-items: center; padding: 4px 4px; border-radius: 4px; transition: background 0.15s; }
.diff-segment:hover { background: rgba(107,107,117,0.06); }
.diff-segment-fusion { background: rgba(155,123,236,0.06); border: 1px solid rgba(155,123,236,0.12); margin: 3px 0; border-radius: 6px; }
.diff-segment-fusion:hover { background: rgba(155,123,236,0.1); }
.diff-cell-left { display: flex; align-items: center; }
.diff-cell-gutter { display: flex; align-items: center; justify-content: center; }
.diff-cell-right { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
.diff-fusion-bracket { display: flex; align-items: center; gap: 6px; width: 100%; }
.diff-fusion-bracket-line { width: 3px; align-self: stretch; background: linear-gradient(to bottom, #9b7bec, #7b5bcc); border-radius: 2px; min-height: 28px; }
.diff-fusion-source-tokens { display: flex; flex-wrap: wrap; gap: 3px; flex: 1; }
.diff-fusion-chip { border-color: rgba(155,123,236,0.3) !important; background: rgba(155,123,236,0.1) !important; }
.diff-fusion-rule-label { font-size: 8px; color: #9b7bec; white-space: nowrap; opacity: 0.7; writing-mode: vertical-lr; text-orientation: mixed; letter-spacing: 0.3px; }
.diff-fusion-arrow { color: #9b7bec; font-size: 14px; font-weight: 700; }
.diff-pass-arrow { color: var(--text-muted, #6b6b75); font-size: 11px; opacity: 0.4; }
.diff-fused-chip-wrapper { display: inline-flex; }
.diff-fused-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-family: 'JetBrains Mono', monospace; border: 1px solid; cursor: default; }
.diff-fusion-badge { font-size: 8px; text-transform: uppercase; letter-spacing: 0.4px; color: #9b7bec; background: rgba(155,123,236,0.12); padding: 1px 5px; border-radius: 3px; font-weight: 600; }
.diff-unchanged-chip { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-family: 'JetBrains Mono', monospace; border: 1px solid rgba(107,107,117,0.15); cursor: default; }
.diff-stream-view { margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(107,107,117,0.1); display: flex; flex-direction: column; gap: 6px; }
.diff-stream-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted, #6b6b75); }
.diff-stream-tokens { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.diff-stream-arrow { color: var(--text-muted, #6b6b75); margin: 0 4px; font-size: 14px; font-weight: 700; }
.diff-consumed { opacity: 0.45; text-decoration: line-through; border-style: dashed !important; }
.diff-new { border-color: rgba(78,201,176,0.4) !important; background: rgba(78,201,176,0.1) !important; box-shadow: 0 0 0 1px rgba(78,201,176,0.2); }
</style>
