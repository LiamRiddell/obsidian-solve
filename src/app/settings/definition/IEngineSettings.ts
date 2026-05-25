export interface IEngineSettings {
	explicitMode: boolean;
	locale: string;

	/** Safety limits — protect against runaway expressions */
	validation: {
		/** Maximum expression length in characters */
		maxExpressionLength: number;
		/** Maximum expression complexity score (token count + functionCalls*5 + nesting*10) */
		maxComplexity: number;
		/** Maximum nesting depth for parentheses */
		maxNestingDepth: number;
	};

	/** Virtual Machine limits — prevent runaway execution */
	vm: {
		/** Maximum stack depth (value slots) for VM execution */
		maxStackDepth: number;
		/** Maximum opcodes executed per expression */
		maxInstructions: number;
	};
}
