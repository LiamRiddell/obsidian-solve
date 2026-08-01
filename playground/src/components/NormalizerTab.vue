<template>
  <div class="tab-panel active" id="panel-normalizer">
    <div class="panel-scroll diag-stack">
    <empty-state v-if="!normalizerStage" icon="sync" text="No normalizer data available" hint="Evaluate an expression to see token normalization details" />

    <template v-else>
      <context-header label="Normalizing" :line-badge="activeLine !== null ? 'L' + activeLine : 'All Lines'" :expression="activeExpression" />

      <!-- Stats Cards -->
      <div class="diag-stat-grid">
        <div class="diag-stat-card">
          <span class="diag-stat-label">Input Tokens</span>
          <span class="diag-stat-value">{{ data.inputTokenCount }}</span>
        </div>
        <div class="diag-stat-card">
          <span class="diag-stat-label">Output Tokens</span>
          <span class="diag-stat-value">{{ data.outputTokenCount }}</span>
        </div>
        <div class="diag-stat-card">
          <span class="diag-stat-label">Fusions</span>
          <span class="diag-stat-value">{{ data.fusions.length }}</span>
        </div>
        <div class="diag-stat-card">
          <span class="diag-stat-label">Tokens Removed</span>
          <span class="diag-stat-value" :class="tokensRemoved > 0 ? 'error' : ''">{{ tokensRemoved }}</span>
        </div>
        <div class="diag-stat-card">
          <span class="diag-stat-label">Type-Guard Skips</span>
          <span class="diag-stat-value info">{{ typeGuardSkipCount }}</span>
        </div>
      </div>

      <!-- Token Fusions -->
      <div class="diag-section">
        <div class="diag-section-header static">
          <span class="diag-section-title"><span class="msi msi-dense">link</span> Token Fusions</span>
          <span class="diag-section-tag">{{ data.fusions.length }}</span>
        </div>
        <div class="diag-section-body">
          <div v-if="data.fusions.length === 0" class="empty">No tokens were fused</div>
          <div v-for="(group, gi) in fusionGroups" :key="gi" class="fusion-group">
            <div class="fusion-group-header">
              <span class="fusion-group-rule">{{ group.rule }}</span>
              <span class="fusion-group-count">{{ group.fusions.length }} fusion{{ group.fusions.length !== 1 ? 's' : '' }}</span>
              <span v-if="group.rule === 'phrase-trie'" class="trie-indicator"><span class="msi">account_tree</span> trie match</span>
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
      <div class="diag-section">
        <div class="diag-section-header static">
          <span class="diag-section-title"><span class="msi msi-dense">bar_chart</span> Token Diff</span>
          <span class="diag-section-tag">{{ rawTokens.length }} → {{ data.tokens.length }}</span>
        </div>
        <div class="diag-section-body">
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
                  </div>
                </template>
                <template v-else>
                  <span v-if="seg.rawToken" class="fusion-token-chip diff-unchanged-chip" :class="tokenClass(seg.rawToken)" :title="`${seg.rawToken.type}: ${seg.rawToken.value}`">{{ seg.rawToken.value }}</span>
                </template>
              </div>
              <div class="diff-cell-gutter">
                <!-- Fusion rows show the rule that fired instead of a plain
                     arrow — the rule name IS the explanation for the
                     transformation, so the arrow was redundant there.
                     Passthrough rows keep the arrow, meaning "carried
                     through unchanged". -->
                <span v-if="seg.isFusion" class="diff-fusion-rule-badge" :title="`Fused by rule: ${seg.fusionRule}`">{{ seg.fusionRule }}</span>
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
        </div>
      </div>

      <!-- Rules Applied -->
      <div class="diag-section">
        <div class="diag-section-header static">
          <span class="diag-section-title"><span class="msi msi-dense">checklist</span> Rules Applied</span>
          <span class="diag-section-tag">{{ data.rulesApplied.length }}</span>
        </div>
        <div class="diag-section-body">
          <div v-if="data.rulesApplied.length === 0" class="empty">No rules were applied</div>
          <div v-else class="normalizer-rules-grid">
            <div v-for="r in data.rulesApplied" :key="r.rule" class="normalizer-rule-chip" :class="{ 'rule-trie': r.rule === 'phrase-trie' }">
              <span class="normalizer-rule-name">{{ r.rule }}</span>
              <span class="normalizer-rule-count">×{{ r.count }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- PhraseTrie Overview -->
      <div class="diag-section">
        <div class="diag-section-header" @click="trieExpanded = !trieExpanded" role="button" :aria-expanded="trieExpanded">
          <span class="diag-section-title"><span class="msi msi-dense">account_tree</span> PhraseTrie Overview</span>
          <span class="diag-section-tag">{{ triePhraseCount }}</span>
          <span class="msi msi-dense diag-section-chevron" :class="{ expanded: trieExpanded }">chevron_right</span>
        </div>
        <div v-if="trieExpanded" class="diag-section-body">
          <div v-if="triePhraseCount === 0" class="empty">No phrases registered</div>
          <template v-else>
            <div class="diag-legend" style="margin-bottom: 8px;">
              The engine's full registered phrase dictionary (word-level trie, single-pass matching, longest-match-wins) — not just the phrases used in this expression.
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
import type { PipelineStageResult, NormalizerOutput, LexerOutput } from '@solve-js/types/DiagnosticPipelineResult';
import type { Token } from '@solve-js/lexer/Token';
import ContextHeader from './shared/ContextHeader.vue';
import EmptyState from './shared/EmptyState.vue';

const dr = useDiagnosticReportStore();
const pl = usePipelineStore();

const trieExpanded = ref(true);

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
  if (!stage) return { type: 'normalizer', inputTokenCount: 0, outputTokenCount: 0, fusions: [], rulesApplied: [], tokens: [], phrases: {} };
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
/**
 * Count of raw tokens that never reach the phrase-matching stage at all —
 * numbers, punctuation, and operators are structurally never part of a
 * multi-word phrase, so the normalizer's fast path skips considering them
 * as fusion candidates.
 */
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
  if (['number', 'hex', 'bigint'].includes(type)) return 'tokcat-number';
  if (type === 'ident') return 'tokcat-ident';
  if (['star', 'plus', 'minus', 'slash', 'caret', 'equals'].includes(type)) return 'tokcat-operator';
  if (type === 'keyword' || type.includes('_by')) return 'tokcat-keyword';
  return 'tokcat-default';
}
</script>
