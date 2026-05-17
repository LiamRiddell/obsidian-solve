declare module "moo" {
	export interface Token {
		type: string;
		value: string;
		text: string;
		offset: number;
		lineBreaks: number;
		line: number;
		col: number;
	}

	export interface Rule {
		match?: RegExp | string | string[];
		value?: (s: string) => string;
		type?: Rule | ((x: string) => string);
		keyword?: Record<string, string>;
		error?: boolean;
		lineBreaks?: boolean;
		push?: string;
		pop?: number;
		next?: string;
	}

	export type Rules = Record<string, RegExp | string | string[] | Rule>;

	export interface Lexer {
		reset(chunk?: string, state?: LexerState): void;
		next(): Token | undefined;
		save(): LexerState;
		has(tokenType: string): boolean;
		formatError(token: Token, message: string): string;
		[Symbol.iterator](): Iterator<Token>;
	}

	export interface LexerState {
		line: number;
		col: number;
		state: string;
	}

	export function compile(rules: Rules): Lexer;
	export function states(states: Record<string, Rules>, start?: string): Lexer;
	export function keywords(keywords: Record<string, string>): Rule;
	export const error: Rule;
}
