export interface IExpressionProcessorState {
	lineNumber: number;
	originalLineText: string;

	// Inline solve support
	isInlineSolve?: boolean;
	inlineSolveIndices?: number[];
	inlineMatches?: string[];

	// Explicit solve support
	isAllowedExplicitModeExpression?: boolean;
}
