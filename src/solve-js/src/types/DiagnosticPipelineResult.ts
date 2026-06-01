/**
 * DiagnosticPipelineResult — structured pipeline data contract.
 *
 * When `diagnosticMode = true`, ExpressionEngine populates this
 * alongside the existing DiagnosticReportJSON. The playground
 * consumes `stages[]` directly — no event reconstruction needed.
 *
 * When `diagnosticMode = false` (production), stages are empty
 * and evaluateLineWithDebug() returns minimal data only.
 */

import type { Token } from "@solve-js/lexer/Token";
import type { MarkdownLineType } from "@solve-js/lexer/ExpressionLexer";
import type { TokenFusion } from "@solve-js/normalizer/NormalizerRule";
import type { BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";
import type { Value } from "@solve-js/vm/Value";

// ── Stage Output Types ──────────────────────────────────────────────────

export interface PipelineStageResult {
  /** Unique stage id: 'line_classification', 'safety_length', 'lexer', etc. */
  stage: string;
  /** Display label for playground UI */
  label: string;
  /** Emoji icon */
  icon: string;
  /** Color class token for styling */
  colorClass: string;
  /** Step number in the pipeline */
  stepNumber: number;
  /** Elapsed nanoseconds from pipeline start (0 if not timed) */
  elapsedNs: number;
  /** Whether this stage was skipped (cache hit, empty tokens, etc.) */
  skipped: boolean;
  /** Stage-specific typed output */
  output: StageOutput;
}

// ── Stage Output Discriminated Union ────────────────────────────────────

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

/** Stage 1: Pipeline Start */
export interface PipelineStartOutput {
  type: "pipeline_start";
  expression: string;
  inputType: string;
}

/** Stage 2: Line Classification */
export interface LineClassificationOutput {
  type: "line_classification";
  classification: MarkdownLineType;
  skip: boolean;
  hasInlineSolve: boolean;
}

/** Stage 3: Safety: Expression Length */
export interface SafetyLengthOutput {
  type: "safety_length";
  passed: boolean;
  expressionLength: number;
  maxLength: number;
  errorMessage?: string;
}

/** Stage 4: Lexer */
export interface LexerOutput {
  type: "lexer";
  tokenCount: number;
  tokenTypes: Record<string, number>;
  hasParens: boolean;
  locale: string;
  /** Pre-normalization raw tokens */
  tokens: Token[];
}

/** Stage 5: Normalizer */
export interface NormalizerOutput {
  type: "normalizer";
  inputTokenCount: number;
  outputTokenCount: number;
  fusions: TokenFusion[];
  rulesApplied: { rule: string; count: number }[];
  /** Post-normalization tokens */
  tokens: Token[];
}

/** Stage 6: Safety: Complexity */
export interface SafetyComplexityOutput {
  type: "safety_complexity";
  passed: boolean;
  complexityScore: number;
  maxComplexity: number;
  breakdown: {
    tokenCount: number;
    functionCalls: number;
    nestingDepth: number;
  };
  errorMessage?: string;
}

/** Stage 7: Read/Write Extraction */
export interface ReadWriteOutput {
  type: "readwrite";
  reads: string[];
  writes: string[];
  isAssignment: boolean;
}

/** Stage 8: Cache Check */
export interface CacheCheckOutput {
  type: "cache_check";
  hit: boolean;
  cacheSize: number;
  cacheKey: string;
}

/** Stage 9: Parser */
export interface ParserOutput {
  type: "parser";
  parselets: { type: string; category: string; prefix: boolean }[];
  uniqueParseletTypes: string[];
  astDepth: number;
}

/** Stage 10: Compiler */
export interface CompilerOutput {
  type: "compiler";
  opcodeCount: number;
  numberConstants: number;
  stringConstants: number;
  hasAsync: boolean;
  cached: boolean;
}

/** Stage 11: Async Preflight */
export interface AsyncPreflightOutput {
  type: "async_preflight";
  path: "sync" | "pending";
  pendingQueryKey?: string;
  resolverCount: number;
  skippedGuard: boolean;
}

/** Stage 12: VM Execute */
export interface VmExecuteOutput {
  type: "vm_execute";
  totalInstructions: number;
  stackDepth: number;
  resultType: string;
  resultValue: string;
  isPending: boolean;
}

/** Stage 13: DAG Registration */
export interface DagRegistrationOutput {
  type: "dag_registration";
  readsRegistered: string[];
  writesRegistered: string[];
  dataSourcesRegistered: string[];
}

/** Stage 14: LineCache Storage */
export interface LineCacheOutput {
  type: "linecache";
  lineNumber: number;
  expression: string;
  stored: boolean;
}

/** Stage 15: Result */
export interface ResultOutput {
  type: "result";
  rawValue: string;
  formattedValue: string;
  valueType: string;
  unit?: string;
  error?: string;
}

/** Stage 16: Pipeline End */
export interface PipelineEndOutput {
  type: "pipeline_end";
  success: boolean;
  totalTokens: number;
  totalOpcodes: number;
  cacheHit: boolean;
}

// ── Full Diagnostic Result ──────────────────────────────────────────────

/**
 * Complete diagnostic pipeline result produced by evaluateExpressionWithDiagnostic()
 * when `diagnosticMode = true`.
 *
 * Includes all 16 pipeline stages with typed outputs plus the existing
 * evaluation data (value, tokens, program, etc.).
 *
 * The playground can render the `stages` array as a pipeline flow
 * without any reconstruction from diagnostic events.
 */
export interface DiagnosticPipelineResult {
  /** Ordered pipeline stages (16 stages total). */
  stages: PipelineStageResult[];
  /** Evaluation result value. */
  value: Value;
  /** Normalized tokens (post-normalizer). */
  tokens: Token[];
  /** Compiled bytecode. */
  program: BytecodeProgram;
  /** Error message if evaluation failed, null otherwise. */
  error: string | null;
}
