<template>
  <div class="tab-panel active" id="panel-tokens">
    <div class="panel-toolbar">
      <div class="panel-toolbar-left">
        <label class="toggle-label">
          <input type="checkbox" v-model="tokens.groupByLine">
          Group by line
        </label>
        <input
          type="text"
          class="token-filter-input"
          placeholder="Filter tokens…"
          spellcheck="false"
          :value="tokens.filterQuery"
          @input="tokens.setFilterQuery(($event.target as HTMLInputElement).value)"
        />
      </div>
      <span class="token-count">{{ countLabel }}</span>
    </div>
    <div class="panel-scroll">
      <!-- Empty states -->
      <span v-if="allTokens.length === 0" class="empty">No tokens</span>
      <span v-else-if="totalVisible === 0" class="empty">No tokens match &ldquo;{{ tokens.filterQuery }}&rdquo;</span>

      <!-- Grouped by line -->
      <template v-else-if="tokens.groupByLine">
        <div
          v-for="(lineTokens, ln) in groupedTokens"
          :key="ln"
          class="token-line-group"
          :class="{ selected: pipeline.selectedLine === ln }"
        >
          <!-- Line header -->
          <div class="token-line-header">
            <div class="token-line-header-left">
              <span>Line {{ ln }}</span>
              <span v-if="lrMap.get(ln)" class="token-line-microstats">
                <span
                  class="microstat-badge"
                  :class="lrMap.get(ln)!.wasCached ? 'microstat-cache-hit' : 'microstat-cache-miss'"
                >{{ lrMap.get(ln)!.wasCached ? 'HIT' : 'MISS' }}</span>
                <span class="microstat-badge" :class="statusClass(lrMap.get(ln)!)">
                  {{ statusLabel(lrMap.get(ln)!) }}
                </span>
              </span>
            </div>
            <div class="token-line-counts">
              <span class="token-count-badge">{{ lineTokens.length }} token{{ lineTokens.length !== 1 ? 's' : '' }}</span>
              <span class="opcode-count-badge">{{ lrMap.get(ln)?.opcodeCount ?? engine.currentResult?.opcodes?.length ?? 0 }} opcode{{ (lrMap.get(ln)?.opcodeCount ?? 1) !== 1 ? 's' : '' }}</span>
            </div>
          </div>

          <!-- Tokens row -->
          <div class="token-line-content">
            <span class="output-label-inline">Tokens</span>
            <span
              v-for="(t, i) in lineTokens"
              :key="i"
              class="token"
              :class="'token-' + (t.type || 'unknown').toLowerCase()"
              :title="'Type: ' + (t.type || 'unknown') + '\nValue: ' + t.value + '\nPos: ' + t.offset"
            >{{ t.value }}</span>
          </div>

          <!-- Result badge row -->
          <div v-if="lrMap.get(ln)" class="token-line-result">
            <span class="token-line-result-type" :style="{ color: typeColor(lrMap.get(ln)!) }">
              {{ lrMap.get(ln)!.type }}
            </span>
            <span class="token-line-result-arrow">→</span>
            <span class="token-line-result-value" :style="{ color: valueColor(lrMap.get(ln)!) }">
              {{ lrMap.get(ln)!.error || lrMap.get(ln)!.result }}
            </span>
            <button
              class="token-line-result-copy"
              :data-copy="lrMap.get(ln)!.error || lrMap.get(ln)!.result"
              title="Copy result"
              @click="copyResult($event)"
            >📋</button>
          </div>
        </div>
      </template>

      <!-- Flat mode -->
      <div v-else class="token-list">
        <span
          v-for="(t, i) in flatTokens"
          :key="i"
          class="token"
          :class="'token-' + (t.type || 'unknown').toLowerCase()"
          :title="'Type: ' + (t.type || 'unknown') + '\nValue: ' + t.value + '\nPos: ' + t.offset"
        >{{ t.value }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useEngineStore } from '../stores/engine.js';
import { useTokensStore } from '../stores/tokens.js';
import { usePipelineStore } from '../stores/pipeline.js';
import type { Token, LineResult } from '../engine.js';

const engine = useEngineStore();
const tokens = useTokensStore();
const pipeline = usePipelineStore();

/* ── Token data ───────────────────────────────────────────────── */
const allTokens = computed<Token[]>(() => engine.currentResult?.rawTokens ?? []);
const lineResults = computed<LineResult[]>(() => engine.currentResult?.lineResults ?? []);

// Line → LineResult lookup
const lrMap = computed(() => {
  const m = new Map<number, LineResult>();
  for (const lr of lineResults.value) m.set(lr.lineNumber, lr);
  return m;
});

/* ── Filtering ─────────────────────────────────────────────────── */
const hasFilter = computed(() => tokens.filterQuery.length > 0);

function filterToken(t: Token): boolean {
  if (t.type == null || t.type === 'WS' || t.type === 'NEWLINE') return false;
  if (hasFilter.value && !tokens.matchToken(t, tokens.filterQuery)) return false;
  return true;
}

/* ── Grouped mode ─────────────────────────────────────────────── */
const groupedTokens = computed(() => {
  const lines = new Map<number, Token[]>();
  for (const t of allTokens.value) {
    if (!filterToken(t)) continue;
    const ln = t.line ?? 1;
    if (!lines.has(ln)) lines.set(ln, []);
    lines.get(ln)!.push(t);
  }
  // Sort by line number
  return new Map([...lines.entries()].sort((a, b) => a[0] - b[0]));
});

/* ── Flat mode ────────────────────────────────────────────────── */
const flatTokens = computed(() => {
  return allTokens.value.filter(t => filterToken(t));
});

/* ── Counts ───────────────────────────────────────────────────── */
const totalCount = computed(() => allTokens.value.filter(t => t.type != null && t.type !== 'WS' && t.type !== 'NEWLINE').length);

const totalVisible = computed(() => {
  return tokens.groupByLine
    ? Array.from(groupedTokens.value.values()).reduce((s, arr) => s + arr.length, 0)
    : flatTokens.value.length;
});

const countLabel = computed(() => {
  const raw = allTokens.value.length;
  const vis = totalVisible.value;
  const tot = totalCount.value;
  const first = allTokens.value[0];
  const dbg = first ? ` [1st: ${first.type ?? '?type?'} "${first.value}"]` : '';
  if (raw === 0) return 'Raw: 0 tokens (no result yet)';
  if (hasFilter.value) return `${vis} / ${tot} tokens${dbg}`;
  return `${vis} tokens${dbg}`;
});

/* ── Status badges ────────────────────────────────────────────── */
function statusLabel(lr: LineResult): string {
  if (lr.error) return 'ERROR';
  if (lr.type === 'Pending') return 'PENDING';
  return 'OK';
}

function statusClass(lr: LineResult): string {
  if (lr.error) return 'microstat-status-error';
  if (lr.type === 'Pending') return 'microstat-status-pending';
  return 'microstat-status-ok';
}

function typeColor(lr: LineResult): string {
  if (lr.error) return 'var(--error)';
  if (lr.type === 'Pending') return 'var(--stage-vm)';
  return 'var(--stage-parser)';
}

function valueColor(lr: LineResult): string {
  if (lr.error) return 'var(--error)';
  return 'var(--accent)';
}

/* ── Copy result ──────────────────────────────────────────────── */
function copyResult(e: MouseEvent): void {
  const btn = (e.target as HTMLElement).closest('.token-line-result-copy') as HTMLElement | null;
  if (!btn) return;
  const text = btn.dataset.copy ?? '';
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✓';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1000);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
}
</script>
