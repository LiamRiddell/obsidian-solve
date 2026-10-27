/** The orders solve-engine reads a numeric date in (`date.inputOrder`). */
export type DateInputOrder = "auto" | "locale" | "DMY" | "MDY" | "YMD";

/** The values of {@link DateInputOrder}, for validating a saved setting. */
export const DATE_INPUT_ORDERS: readonly DateInputOrder[] = ["auto", "locale", "DMY", "MDY", "YMD"];

export interface IEngineSettings {
	explicitMode: boolean;
	locale: string;

	/**
	 * How a numeric date such as 03/04/2026 is read: `locale` follows the
	 * reader's machine, `auto` reads by separator and refuses a date that only
	 * works the other way round, and DMY, MDY and YMD fix the order.
	 */
	dateInputOrder: DateInputOrder;
	/** Whether a live lookup (an exchange rate, the weather) may fetch. Off, it is refused by name. */
	networkEnabled: boolean;
	/** Whether a new engine runs a few throwaway lines first, so the first keystroke does not pay for warm-up. */
	warmup: boolean;

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
