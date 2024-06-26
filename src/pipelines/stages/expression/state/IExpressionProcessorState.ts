export interface IExpressionProcessorState {
	lineNumber: number;
	originalLineText: string;

	// Inline solve support
	isInlineSolve?: boolean;
	inlineSolveIndex?: number;
}
