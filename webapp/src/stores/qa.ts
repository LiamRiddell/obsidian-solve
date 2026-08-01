import { create } from "zustand"

export type QaStatus = "ok" | "error" | "pending"

/**
 * What a battery line's author expects it to do, detected from a trailing
 * `// error` comment on the line itself (the engine already strips `//...`
 * comments before evaluating, so this never affects the actual expression —
 * see detectExpectation()). Lines with no marker default to 'ok'.
 */
export type QaExpectation = "ok" | "error"

export interface QaResult {
  lineNumber: number
  expression: string
  status: QaStatus
  /** What this line was annotated to do — see QaExpectation. */
  expected: QaExpectation
  /**
   * Whether the actual outcome matches what was expected. A line correctly
   * rejecting invalid input (status: 'error', expected: 'error') is a PASS,
   * not a failure — this is the field the UI should key off for pass/fail
   * styling and the "only failures" filter, never raw `status` alone.
   * Pending results are never a pass (async resolution isn't awaited here),
   * but they're also not counted as a failure.
   */
  passed: boolean
  /** Formatted value on success, error message on failure, queryKey on pending. */
  detail: string
  elapsedMs: number
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
5 3 // error
5 + 3 7 // error
1,2345 // error
Hello world // error

# Unit / dimension mismatches — should ERROR, not silently mislabel
5kg / 3m // error
vec2(1,2) + vec3(1,2,3) // error

# Cross-currency crypto math resolves asynchronously (a live price fetch) —
# this tool evaluates synchronously and doesn't wait for it to settle, so
# this always shows Pending here. That's expected, not a bug.
0.01 BTC + 1 ETH

# Multi-target currency syntax is unsupported — a trailing comma is a parse error
10 USD in EUR, GBP // error

# Dice range validation — reversed range should ERROR, normal range should not
roll(6, 1) // error
roll(1, 6)

# Datetime arithmetic — subtracting two datetimes yields a duration (ok);
# adding two absolute timestamps together has no meaning (error)
now - now
now + now // error

# Malformed numeric literals — should ERROR instead of silent NaN
0x // error
0b // error
0xFF

# Undefined reference — should ERROR
undefinedVar123 // error
`

/**
 * Detects a line's expected outcome from a trailing `// error` marker
 * (case-insensitive, e.g. "5 3 // error"). Defaults to 'ok' when absent.
 * Scans the RAW line text (marker included) — evaluation itself already
 * ignores `//...` comments (COMMENT tokens have no parselet), so this
 * marker never changes what the expression actually does.
 */
export function detectExpectation(rawLine: string): QaExpectation {
  return /\/\/\s*error\b/i.test(rawLine) ? "error" : "ok"
}

interface QaState {
  source: string
  results: QaResult[]
  onlyFailures: boolean

  setSource: (source: string) => void
  setResults: (results: QaResult[]) => void
  setOnlyFailures: (onlyFailures: boolean) => void
}

/**
 * Holds the QA tab's batch source + last run results.
 *
 * An independent scratch space for a manually-curated test batch that has
 * nothing to do with whatever is currently in the main editor.
 */
export const useQaStore = create<QaState>((set) => ({
  source: DEFAULT_BATTERY,
  results: [],
  onlyFailures: false,

  setSource: (source) => set({ source }),
  setResults: (results) => set({ results }),
  setOnlyFailures: (onlyFailures) => set({ onlyFailures }),
}))
