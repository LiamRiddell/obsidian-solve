export {
	ExpressionEngine,
} from "./ExpressionEngine";
export type {
	CacheSnapshot,
	BatcherMetrics,
	CheckpointSnapshot,
	BytecodeCacheEntry,
	LineCacheEntryInfo,
	AsyncCachePackageInfo,
	DagSnapshot,
	EvalResults,
	LineEvaluation,
} from "./ExpressionEngine";

export { DocumentModel } from "./DocumentModel";
export type {
	LineState,
	ViewportRange,
	LineChange,
	ApplyChangesResult,
} from "./DocumentModel";

export { ThreeTierEvaluator, EvalTier } from "./ThreeTierEvaluator";
export type { EvalLineResult, EvalResult } from "./ThreeTierEvaluator";

export { AsyncResolutionBatcher } from "./AsyncResolutionBatcher";
export type {
	LinesUpdatedEvent,
	AsyncErrorEvent,
	AsyncResolutionEvent,
} from "./AsyncResolutionBatcher";

export {
	checkExpressionLength,
	checkExpressionComplexity,
	extractReadsAndWrites,
	isEmptyLine,
	findInlineSolvesInLine,
} from "./ExpressionEngineSafety";
export type { ValidationConfig, SafetyCheckResult } from "./ExpressionEngineSafety";
// Re-exported here (not from `types/`, which is internal-only) because it's
// the return type of the public findInlineSolvesInLine() above.
export type { InlineSolvePosition } from "@solve-js/types/ParsingResult";
