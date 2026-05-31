import moo from "moo";

/**
 * Extensible registry for moo.js lexer rules by state.
 *
 * Providers can register custom token rules for specific lexer states
 * (e.g., "main", "inline", "string") or register fallback rules that
 * apply to all states. The shared singleton (`sharedTokenRegistry`)
 * is consumed by the ExpressionLexer.
 */
export class TokenRegistry {
	private rules: Record<string, moo.Rule | RegExp | string | string[]> = {};
	private states: Record<string, Record<string, moo.Rule | RegExp | string | string[]>> = {};

	/**
	 * Register a token rule for a specific lexer state.
	 *
	 * @param state - The lexer state name (e.g., "main", "inline", "string")
	 * @param name - The token type name to emit when this rule matches
	 * @param rule - A moo.js rule definition (RegExp, string, or moo.Rule options object)
	 */
	register(state: string, name: string, rule: moo.Rule | RegExp | string | string[]): void {
		if (!this.states[state]) {
			this.states[state] = {};
		}
		this.states[state][name] = rule;
	}

	/**
	 * Register a fallback token rule that applies to all lexer states.
	 * Default rules are merged with state-specific rules in getRules().
	 *
	 * @param name - The token type name to emit when this rule matches
	 * @param rule - A moo.js rule definition (RegExp, string, or moo.Rule options object)
	 */
	registerDefault(name: string, rule: moo.Rule | RegExp | string | string[]): void {
		this.rules[name] = rule;
	}

	/**
	 * Get all token rules for a lexer state, including fallback default rules.
	 * State-specific rules override defaults with the same name.
	 *
	 * @param state - The lexer state name (e.g., "main")
	 * @returns A merged rules object for the state, shallow-copied to prevent mutation.
	 */
	getRules(state: string): Record<string, moo.Rule | RegExp | string | string[]> {
		return { ...this.rules, ...(this.states[state] || {}) };
	}

	/**
	 * Check whether a lexer state has been registered.
	 * Always returns true for the implicit "main" state.
	 *
	 * @param state - The lexer state name to check
	 */
	hasState(state: string): boolean {
		return state in this.states || state === "main";
	}
}

/** Shared singleton TokenRegistry instance. Consumed by the ExpressionLexer. */
export const sharedTokenRegistry = new TokenRegistry();
