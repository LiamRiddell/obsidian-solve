/**
 * Per-`ErrorCategory` display metadata, shared between the inline editor's
 * error hover popover (`EditorPane.tsx`, vanilla DOM) and the Errors tab
 * (`ErrorsTab.tsx`, JSX) — one source of truth so a given category always
 * reads the same color everywhere in the UI.
 *
 * Mirrors AGENT.md's category semantics: PARSING/VALIDATION read as "fix
 * your input", EXECUTION as a runtime failure, EXTERNAL as "not your
 * fault, a network call failed", INTERNAL/CONFIG as "this is likely an
 * engine bug" — distinct enough at a glance that the badge color alone
 * tells you which bucket you're in before reading a word.
 */
export interface ErrorCategoryMeta {
  label: string
  /** Tailwind classes for a pill badge (background tint + text color). */
  badgeClass: string
  /** Tailwind class for a small solid accent dot. */
  dotClass: string
}

export const CATEGORY_META: Record<string, ErrorCategoryMeta> = {
  PARSING: { label: "Parsing", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500" },
  VALIDATION: { label: "Validation", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500" },
  EXECUTION: { label: "Execution", badgeClass: "bg-rose-500/15 text-rose-600 dark:text-rose-400", dotClass: "bg-rose-500" },
  EXTERNAL: { label: "External", badgeClass: "bg-sky-500/15 text-sky-600 dark:text-sky-400", dotClass: "bg-sky-500" },
  INTERNAL: { label: "Internal", badgeClass: "bg-violet-500/15 text-violet-600 dark:text-violet-400", dotClass: "bg-violet-500" },
  CONFIG: { label: "Config", badgeClass: "bg-violet-500/15 text-violet-600 dark:text-violet-400", dotClass: "bg-violet-500" },
}

export const DEFAULT_CATEGORY_META: ErrorCategoryMeta = CATEGORY_META.EXECUTION

export function categoryMeta(category: string | undefined): ErrorCategoryMeta {
  return (category && CATEGORY_META[category]) || DEFAULT_CATEGORY_META
}
