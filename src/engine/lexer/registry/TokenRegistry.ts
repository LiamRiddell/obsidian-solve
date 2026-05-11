import moo from "moo";

export class TokenRegistry {
	private rules: Record<string, moo.Rule | RegExp | string | string[]> = {};
	private states: Record<string, Record<string, moo.Rule | RegExp | string | string[]>> = {};

	register(state: string, name: string, rule: moo.Rule | RegExp | string | string[]): void {
		if (!this.states[state]) {
			this.states[state] = {};
		}
		this.states[state][name] = rule;
	}

	registerDefault(name: string, rule: moo.Rule | RegExp | string | string[]): void {
		this.rules[name] = rule;
	}

	getRules(state: string): Record<string, moo.Rule | RegExp | string | string[]> {
		return { ...this.rules, ...(this.states[state] || {}) };
	}

	hasState(state: string): boolean {
		return state in this.states || state === "main";
	}
}

export const sharedTokenRegistry = new TokenRegistry();