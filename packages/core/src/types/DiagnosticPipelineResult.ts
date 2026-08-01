//#region ─── Module Overview ───────────────────────────────────────────────────

/**
 * DiagnosticPipelineResult — structured pipeline data contract.
 *
 * ## Purpose
 * When `diagnosticMode = true`, the {@link ExpressionEngine} populates this
 * structured result alongside the existing event-based diagnostic system.
 * The playground consumes the `stages[]` array directly — no event
 * reconstruction or timeline parsing needed.
 *
 * ## Dual-mode design
 * - **Production** (`diagnosticMode = false`): stages are empty, zero overhead
 * - **Diagnostic** (`diagnosticMode = true`): all 15 pipeline stages are populated
 *   with typed outputs, plus the evaluation result (value, tokens, bytecode)
 *
 * ## Stage numbering
 * | Step | Stage              | Description                                 |
 * |------|--------------------|---------------------------------------------|
 * | 1    | pipeline_start     | Pipeline initialization                     |
 * | 2    | safety_length      | Expression length validation                |
 * | 3    | lexer              | Token production                            |
 * | 4    | normalizer         | TokenNormalizer phrase fusion + implicit ops|
 * | 5    | safety_complexity  | Complexity score validation                 |
 * | 6    | readwrite          | Variable reads/writes extraction            |
 * | 7    | cache_check        | Bytecode cache lookup                       |
 * | 8    | parser             | Pratt parser (skipped on cache hit)         |
 * | 9    | compiler           | Bytecode compiler (skipped on cache hit)    |
 * | 10   | async_preflight    | Async resolver preflight check              |
 * | 11   | vm_execute         | Stack VM execution                          |
 * | 12   | dag_registration   | Dependency graph registration               |
 * | 13   | linecache          | Line-cache storage                          |
 * | 14   | result             | Formatted result value                      |
 * | 15   | pipeline_end       | Pipeline completion summary                 |
 *
 * @module DiagnosticPipelineResult
 */

//#endregion
//#region ─── Imports ──────────────────────────────────────────────────────────

import type { Token } from "@solve-js/lexer/Token";
import type { MarkdownLineType } from "@solve-js/lexer/ExpressionLexer";
import type { TokenFusion } from "@solve-js/normalizer/NormalizerRule";
import type { BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";
import type { Value } from "@solve-js/vm/Value";
import type { DagSnapshot } from "@solve-js/vm/DependencyGraph";

//#endregion
//#region ─── PipelineStageResult — Individual Stage Container ──────────────────

/**
 * A single pipeline stage result displayed in the playground's Pipeline tab.
 *
 * Each stage has display metadata (label, icon, color, step number) and
 * a typed {@link StageOutput | output} payload. Stages are ordered by
 * {@link stepNumber} and rendered as a vertical flow.
 */
export interface PipelineStageResult {
  /**
   * Unique stage identifier: `'lexer'`, `'normalizer'`, `'vm_execute'`, etc.
   * Used by the PipelineTab to select the correct renderer.
   */
  stage: string;

  /** Human-readable label (e.g., "VM Execute", "Safety: Length") */
  label: string;

  /** Emoji icon for the stage header (e.g., "⚡", "🔤") */
  icon: string;

  /**
   * CSS color class token for styling the stage header.
   * Maps to `.flow-stage-header.{colorClass}` in main.css.
   */
  colorClass: string;

  /** Sequential step number in the pipeline (1–15) */
  stepNumber: number;

  /**
   * Elapsed nanoseconds from pipeline start.
   * 0 when timing is disabled or the timeline collector isn't active.
   */
  elapsedNs: number;

  /**
   * Whether this stage was skipped.
   * Examples: parser/compiler skipped on cache hit, normalizer skipped with no rules.
   */
  skipped: boolean;

  /** Stage-specific typed output (see {@link StageOutput}) */
  output: StageOutput;
}

//#endregion
//#region ─── StageOutput — Discriminated Union ────────────────────────────────

/**
 * Discriminated union of all pipeline stage output types.
 *
 * Each stage produces a specific output interface with a `type` discriminator.
 * The playground uses `stage.output.type` to determine which renderer to use.
 */
export type StageOutput =
  | PipelineStartOutput
  | LineClassificationOutput
  | SafetyLengthOutput
  | LexerOutput
  | NormalizerOutput
  | SafetyComplexityOutput
  | ReadWriteOutput
  | CacheCheckOutput
  | ParserOutput
  | CompilerOutput
  | AsyncPreflightOutput
  | VmExecuteOutput
  | DagRegistrationOutput
  | LineCacheOutput
  | ResultOutput
  | PipelineEndOutput;

//#endregion
//#region ─── Stage 1 – Pipeline Start ─────────────────────────────────────────

/** Stage 1: Pipeline initialization with the expression and input type. */
export interface PipelineStartOutput {
  type: "pipeline_start";
  /** The raw expression being evaluated */
  expression: string;
  /** Input type: `"expression"`, `"markdown"`, etc. */
  inputType: string;
}

//#endregion
//#region ─── Inline Solve Span Info ─────────────────────────────────────────

/**
 * Lightweight inline solve span with token indices for diagnostic rendering.
 *
 * Unlike {@link InlineSolveSpan} (which carries full character offsets),
 * this is a diagnostics-only struct focused on token-level access. The
 * playground uses `startTokenIndex`/`endTokenIndex` to highlight tokens
 * within the inline solve, and `expression` to show what was evaluated.
 */
export interface InlineSolveSpanInfo {
  /** Token index of INLINE_SOLVE_START in the expression's token array */
  startTokenIndex: number;
  /** Token index of closing BACKTICK_OPEN in the expression's token array */
  endTokenIndex: number;
  /** The expression text between the backticks */
  expression: string;
  /** 1-based column of the `s`` marker */
  columnNumber: number;
}

//#endregion
//#region ─── Stage 2 – Line Classification ────────────────────────────────────

/** Stage 2: Markdown line classification (used by scanDocument path). */
export interface LineClassificationOutput {
  type: "line_classification";
  /** The markdown line type (heading, list, expression, etc.) */
  classification: MarkdownLineType;
  /** Whether this line should be skipped entirely */
  skip: boolean;
  /** Whether the line contains inline solve markers (`s`...``) */
  hasInlineSolve: boolean;
  /** Inline solve spans with token indices (empty if none detected). */
  inlineSolveSpans: InlineSolveSpanInfo[];
}

//#endregion
//#region ─── Stage 3 – Safety: Expression Length ──────────────────────────────

/** Stage 3: Expression length validation against the configured limit. */
export interface SafetyLengthOutput {
  type: "safety_length";
  /** Whether the expression passed the length check */
  passed: boolean;
  /** Actual length of the expression in characters */
  expressionLength: number;
  /** Maximum allowed expression length from config */
  maxLength: number;
  /** Error message when the check fails */
  errorMessage?: string;
}

//#endregion
//#region ─── Stage 4 – Lexer ──────────────────────────────────────────────────

/** Stage 4: Raw token production from the ExpressionLexer. */
export interface LexerOutput {
  type: "lexer";
  /** Total number of tokens produced (excluding whitespace) */
  tokenCount: number;
  /** Counts per token type (e.g., { NUMBER: 3, IDENT: 1, PLUS: 1 }) */
  tokenTypes: Record<string, number>;
  /** Whether parentheses are present in the expression */
  hasParens: boolean;
  /** Locale used for keyword resolution (e.g., "en") */
  locale: string;
  /**
   * Raw tokens before normalization.
   * These are the tokens as they come out of the lexer, before any
   * phrase fusion or implicit operator insertion.
   */
  tokens: Token[];
}

//#endregion
//#region ─── Stage 5 – Normalizer ─────────────────────────────────────────────

/** Stage 5: TokenNormalizer pass with fusion tracking for diagnostic display. */
export interface NormalizerOutput {
  type: "normalizer";
  /** Number of tokens before normalization */
  inputTokenCount: number;
  /** Number of tokens after normalization (may be fewer due to fusions) */
  outputTokenCount: number;
  /**
   * Fusion events recorded during normalization.
   * Each entry shows the rule, source tokens, and resulting fused token.
   * Rendered as the fusion detail table in the Pipeline tab.
   */
  fusions: TokenFusion[];
  /** Per-rule application counts (e.g., [{ rule: "phrase:to the power of", count: 1 }]) */
  rulesApplied: { rule: string; count: number }[];
  /** Post-normalization tokens ready for parsing */
  tokens: Token[];
  /**
   * All registered phrase → tokenType mappings from the PhraseTrie.
   * Populated by the engine at diagnostic stage build time so the
   * playground NormalizerTab can render the complete trie structure
   * rather than only phrases that matched in this evaluation.
   */
  phrases: Record<string, string>;
}

//#endregion
//#region ─── Stage 6 – Safety: Complexity ─────────────────────────────────────

/** Stage 6: Complexity scoring against the configured limit. */
export interface SafetyComplexityOutput {
  type: "safety_complexity";
  /** Whether the expression passed the complexity check */
  passed: boolean;
  /** Computed complexity score (tokens + function calls × 5 + max parens × 10) */
  complexityScore: number;
  /** Maximum allowed complexity from config */
  maxComplexity: number;
  /** Breakdown of the complexity score components */
  breakdown: {
    /** Number of tokens in the expression */
    tokenCount: number;
    /** Number of function call sites detected */
    functionCalls: number;
    /** Maximum parenthesis nesting depth */
    nestingDepth: number;
  };
  /** Error message when the check fails */
  errorMessage?: string;
}

//#endregion
//#region ─── Stage 7 – Read/Write Extraction ──────────────────────────────────

/** Stage 7: Variable reads and writes extracted from the token stream. */
export interface ReadWriteOutput {
  type: "readwrite";
  /** Variable names read by this expression */
  reads: string[];
  /** Variable names written (assigned) by this expression */
  writes: string[];
  /** Whether this expression is a variable assignment (`:var = ...`) */
  isAssignment: boolean;
}

//#endregion
//#region ─── Stage 8 – Cache Check ────────────────────────────────────────────

/** Stage 8: Bytecode cache lookup before parsing. */
export interface CacheCheckOutput {
  type: "cache_check";
  /** Whether the expression was found in the bytecode cache */
  hit: boolean;
  /** Current number of entries in the bytecode cache */
  cacheSize: number;
  /** Cache key used for lookup (typically the expression text) */
  cacheKey: string;
}

//#endregion
//#region ─── Stage 9 – Parser (Pratt) ─────────────────────────────────────────

/** Stage 9: Pratt parser producing an AST from normalized tokens. Skipped on cache hit. */
export interface ParserOutput {
  type: "parser";
  /** Matched parselets during parsing */
  parselets: { type: string; category: string; prefix: boolean }[];
  /** Unique parselet type names used in this expression */
  uniqueParseletTypes: string[];
  /** Maximum AST depth reached during parsing */
  astDepth: number;
}

//#endregion
//#region ─── Stage 10 – Compiler ──────────────────────────────────────────────

/** Stage 10: Bytecode compiler (AST → opcodes). Skipped on cache hit. */
export interface CompilerOutput {
  type: "compiler";
  /** Number of opcodes in the compiled program */
  opcodeCount: number;
  /** Number of numeric constants in the constant pool */
  numberConstants: number;
  /** Number of string constants in the constant pool */
  stringConstants: number;
  /** Whether the program contains async opcodes (CALL_PLUGIN) */
  hasAsync: boolean;
  /** Whether the program was served from cache */
  cached: boolean;
}

//#endregion
//#region ─── Stage 11 – Async Preflight ───────────────────────────────────────

/** Stage 11: Async resolver preflight check before VM execution. */
export interface AsyncPreflightOutput {
  type: "async_preflight";
  /**
   * Resolution path.
   * - `"sync"`: No async resolvers needed, proceed to VM
   * - `"pending"`: Data not ready, return pending value and await resolution
   */
  path: "sync" | "pending";
  /** Query key if the expression is pending async resolution */
  pendingQueryKey?: string;
  /** Number of registered async resolvers */
  resolverCount: number;
  /** Whether the preflight guard was skipped (no async opcodes, no resolvers) */
  skippedGuard: boolean;
}

//#endregion
//#region ─── Stage 12 – VM Execute ────────────────────────────────────────────

/** Stage 12: Stack VM execution of the compiled bytecode program. */
export interface VmExecuteOutput {
  type: "vm_execute";
  /** Total opcode instructions executed */
  totalInstructions: number;
  /** Maximum stack depth reached during execution */
  stackDepth: number;
  /** Result type: `"Number"`, `"Uom"`, `"Pending"`, etc. */
  resultType: string;
  /** String representation of the result value */
  resultValue: string;
  /** Whether the VM returned a pending async result */
  isPending: boolean;
}

//#endregion
//#region ─── Stage 13 – DAG Registration ──────────────────────────────────────

/** Stage 13: Dependency graph registration for incremental re-evaluation. */
export interface DagRegistrationOutput {
  type: "dag_registration";
  /** Variable reads registered in the DAG */
  readsRegistered: string[];
  /** Variable writes registered in the DAG */
  writesRegistered: string[];
  /** Data source dependencies registered in the DAG */
  dataSourcesRegistered: string[];
}

//#endregion
//#region ─── Stage 14 – LineCache Storage ─────────────────────────────────────

/** Stage 14: Line-cache storage of the evaluation result. */
export interface LineCacheOutput {
  type: "linecache";
  /** Line number in the document (1-based) */
  lineNumber: number;
  /** The expression text stored in cache */
  expression: string;
  /** Whether the result was successfully stored */
  stored: boolean;
}

//#endregion
//#region ─── Stage 14 – Result ────────────────────────────────────────────────

/** Stage 14: Final evaluation result with formatting. */
export interface ResultOutput {
  type: "result";
  /** Raw value as a string */
  rawValue: string;
  /** Human-friendly formatted value (with locale formatting, units, etc.) */
  formattedValue: string;
  /** Value type: `"Number"`, `"Uom"`, `"Percentage"`, etc. */
  valueType: string;
  /** Unit of measurement if the result carries a unit (e.g., "km") */
  unit?: string;
  /** Error message if evaluation failed (null on success) */
  error?: string;
}

//#endregion
//#region ─── Stage 15 – Pipeline End ──────────────────────────────────────────

/** Stage 15: Pipeline completion summary with final statistics. */
export interface PipelineEndOutput {
  type: "pipeline_end";
  /** Whether the pipeline completed successfully */
  success: boolean;
  /** Total tokens processed (pre-normalization) */
  totalTokens: number;
  /** Total opcodes in the compiled program */
  totalOpcodes: number;
  /** Whether the result came from the bytecode cache */
  cacheHit: boolean;
}

//#endregion
//#region ─── DiagnosticPipelineResult — Complete Diagnostic Output ─────────────

/**
 * Complete diagnostic pipeline result produced by
 * {@link ExpressionEngine.evaluateExpressionWithDiagnostic | evaluateExpressionWithDiagnostic()}
 * when `diagnosticMode = true`.
 *
 * Includes all 15 pipeline stages with typed outputs, plus the evaluation
 * result data (value, tokens, bytecode). The playground renders the `stages`
 * array as a data-driven pipeline flow diagram without any reconstruction
 * from diagnostic events.
 *
 * When `diagnosticMode = false` (production), the `diagnostic` field is
 * `undefined` and only the minimal result data is returned.
 */
export interface DiagnosticPipelineResult {
  /**
   * Ordered pipeline stages (15 stages total).
   * Each stage has display metadata and a typed output payload.
   */
  stages: PipelineStageResult[];

  /** The final evaluation result value */
  value: Value;

  /** Normalized tokens (post-TokenNormalizer, ready for parsing) */
  tokens: Token[];

  /** The compiled bytecode program */
  program: BytecodeProgram;

  /** Error message if evaluation failed, `null` otherwise */
  error: string | null;

  /** DAG dependency graph snapshot (consumers, writes, reads, dataSourceDeps) */
  dagSnapshot?: DagSnapshot;

  /** Engine-wide cache snapshot (bytecode, line cache, async cache) */
  cacheSnapshot?: CacheSnapshot;

  /** AsyncResolutionBatcher metrics (pending, dedup, worker, listener counts) */
  batcherMetrics?: BatcherMetrics;

  /** VM checkpoints from the ThreeTierEvaluator's checkpointer */
  checkpoints?: CheckpointSnapshot[];
}

//#endregion

//#region ─── Diagnostic Snapshot Sub-types ────────────────────────────────

/** Bytecode cache entry for diagnostic rendering. */
export interface BytecodeCacheEntry {
  expression: string;
  opcodesLength: number;
  numbersLength: number;
  stringsLength: number;
  hasAsync: boolean;
}

/** Line cache entry info for diagnostic rendering. */
export interface LineCacheEntryInfo {
  key: string;
  lineNumber: number;
  resultType: string;
  resultValue: string;
  reads: string[];
  writeVar: string | null;
}

/** Async cache package info for diagnostic rendering. */
export interface AsyncCachePackageInfo {
  packageId: string;
  resolvedCount: number;
  inFlightCount: number;
  errorCount: number;
  /** Per-package TTL in milliseconds (undefined = no expiry). */
  ttlMs?: number;
  entries: Array<{ key: string; status: "resolved" | "in_flight" | "error"; errorMessage?: string; createdAt?: number; value?: string }>;
}

/** Full cache snapshot for diagnostic rendering. */
export interface CacheSnapshot {
  bytecode: BytecodeCacheEntry[];
  lineCache: LineCacheEntryInfo[];
  asyncCache: AsyncCachePackageInfo[];
}

/** Batcher metrics for Workers diagnostic tab. */
export interface BatcherMetrics {
  pendingCount: number;
  dedupCount: number;
  workerOffloadCount: number;
  listenerCount: number;
}

/** VM checkpoint snapshot for diagnostic rendering. */
export interface CheckpointSnapshot {
  lineNumber: number;
  variables: string[];
  variableCount: number;
}
