import { defineStore } from 'pinia';
import { ref } from 'vue';

export type QaStatus = 'ok' | 'error' | 'pending';

export interface QaResult {
  lineNumber: number;
  expression: string;
  status: QaStatus;
  /** Formatted value on success, error message on failure, queryKey on pending. */
  detail: string;
  elapsedMs: number;
}

const DEFAULT_BATTERY = `# Sanity checks — should all evaluate cleanly
2 + 2
(1 + 2) * 3
:x = 10
:x + 5
50% + 10%
1,234
1.234.567

# Trailing-token bug (Issue_TrailingTokensSilentlyDropped) — should ERROR
5 3
5 + 3 7
1,2345
Hello world

# Unit / dimension mismatches — should ERROR, not silently mislabel
5kg / 3m
vec2(1,2) + vec3(1,2,3)
0.01 BTC + 1 ETH

# Multi-target currency syntax is unsupported — a trailing comma is a parse error
10 USD in EUR, GBP

# Dice range validation — reversed range should ERROR, normal range should not
roll(6, 1)
roll(1, 6)

# Datetime arithmetic — subtracting two datetimes yields a duration, not another datetime
now - now
now + now

# Malformed numeric literals — should ERROR instead of silent NaN
0x
0b
0xFF

# Undefined reference — should ERROR
undefinedVar123
`;

/**
 * Holds the QA tab's batch source + last run results.
 *
 * DiagnosticsPane.vue re-keys (destroys + remounts) the active tab
 * component on every engine run so the other, per-expression diagnostic
 * tabs always start clean. The QA tab is different — it's an independent
 * scratch space for a manually-curated test batch that has nothing to do
 * with whatever is currently in the main editor — so its state lives here
 * instead of in component-local refs, surviving those remounts.
 */
export const useQaStore = defineStore('qa', () => {
  const source = ref(DEFAULT_BATTERY);
  const results = ref<QaResult[]>([]);
  const onlyFailures = ref(false);

  return { source, results, onlyFailures };
});
