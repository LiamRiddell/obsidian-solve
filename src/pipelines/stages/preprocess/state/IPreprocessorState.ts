export interface IPreprocessorState {
	lineNumber: number;
	originalLineText: string;

	// Inline solve support
	isInlineSolve?: boolean;
	inlineSolveIndex?: number;
}
