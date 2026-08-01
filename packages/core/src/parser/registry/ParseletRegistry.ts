import { PrefixParselet, InfixParselet } from "@solve-js/parser/Parselet";
import { tokenTypeId } from "@solve-js/lexer/Token";

/**
 * Dual-keyed ParseletRegistry — accepts both string token types and
 * integer token type IDs for fast dispatch in the Parser hot path.
 *
 * Providers call registerPrefix("NUMBER", ...) with string token types.
 * Internally, we populate both string-keyed and integer-keyed maps so
 * Parser.parseExpression() can use token.typeId (integer) for lookup
 * while diagnostics and error messages use token.type (string).
 *
 * Performance: Integer Map.get() avoids string hashing — saving ~2-5ns
 * per dispatch. With ~10-15 dispatches per expression, that's ~20-75ns.
 */
export class ParseletRegistry {
	// String-keyed maps (kept for diagnostics + backwards compat)
	private prefixParselets: Map<string, PrefixParselet> = new Map();
	private infixParselets: Map<string, InfixParselet> = new Map();

	// Integer-keyed maps for parser hot path
	private prefixById: Map<number, PrefixParselet> = new Map();
	private infixById: Map<number, InfixParselet> = new Map();

	registerPrefix(tokenType: string, parselet: PrefixParselet): void {
		this.prefixParselets.set(tokenType, parselet);
		this.prefixById.set(tokenTypeId(tokenType), parselet);
	}

	registerInfix(tokenType: string, parselet: InfixParselet): void {
		this.infixParselets.set(tokenType, parselet);
		this.infixById.set(tokenTypeId(tokenType), parselet);
	}

	/** Iterate all registered prefix parselets for diagnostic display. */
	getAllPrefix(): Array<{ tokenType: string; bindingPower: number; category?: string }> {
		const result: Array<{ tokenType: string; bindingPower: number; category?: string }> = [];
		for (const [tokenType, parselet] of this.prefixParselets) {
			result.push({
				tokenType,
				bindingPower: (parselet as any).bindingPower ?? 0,
				category: (parselet as any).category,
			});
		}
		return result;
	}

	/** Iterate all registered infix parselets for diagnostic display. */
	getAllInfix(): Array<{ tokenType: string; leftBindingPower: number; rightBindingPower: number; category?: string }> {
		const result: Array<{ tokenType: string; leftBindingPower: number; rightBindingPower: number; category?: string }> = [];
		for (const [tokenType, parselet] of this.infixParselets) {
			result.push({
				tokenType,
				leftBindingPower: (parselet as any).leftBindingPower ?? 0,
				rightBindingPower: (parselet as any).rightBindingPower ?? 0,
				category: (parselet as any).category,
			});
		}
		return result;
	}

	/** Number of registered prefix parselets. */
	get prefixCount(): number { return this.prefixParselets.size; }

	/** Number of registered infix parselets. */
	get infixCount(): number { return this.infixParselets.size; }

	/**
	 * Get prefix parselet by string token type OR integer typeId.
	 * Fast path for integer IDs (Parser hot path), fallback for strings
	 * (diagnostics, error messages, backwards compatibility).
	 */
	getPrefix(tokenType: string | number): PrefixParselet | undefined {
		if (typeof tokenType === 'number') return this.prefixById.get(tokenType);
		return this.prefixParselets.get(tokenType);
	}

	/**
	 * Get infix parselet by string token type OR integer typeId.
	 * Fast path for integer IDs (Parser hot path), fallback for strings.
	 */
	getInfix(tokenType: string | number): InfixParselet | undefined {
		if (typeof tokenType === 'number') return this.infixById.get(tokenType);
		return this.infixParselets.get(tokenType);
	}

	hasPrefix(tokenType: string): boolean {
		return this.prefixParselets.has(tokenType);
	}

	hasInfix(tokenType: string): boolean {
		return this.infixParselets.has(tokenType);
	}

	clear(): void {
		this.prefixParselets.clear();
		this.infixParselets.clear();
		this.prefixById.clear();
		this.infixById.clear();
	}
}

export const sharedParseletRegistry = new ParseletRegistry();
