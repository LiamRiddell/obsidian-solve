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

	/**
	 * Register a prefix parselet for `tokenType`.
	 *
	 * If another parselet is already registered for this token type, it is
	 * silently overwritten by default (`Map.set()` semantics) — the old
	 * parselet is simply unreachable from then on, with no error. This is
	 * a real footgun for third-party packages: two packages independently
	 * choosing the same custom token type will collide with zero signal
	 * about which one "won". Mirrors ResolverRegistry.register()'s and
	 * ExpressionEngine.registerPackage()'s existing "warn and replace"
	 * pattern for the same class of problem at the resolver-namespace and
	 * package-name levels.
	 *
	 * Note: this warns about registry-level collisions only. It does NOT
	 * detect the separate case where `tokenType` is one of PrecedenceParser's
	 * Tier-1 fast-path token types (NUMBER, STRING, IDENT, LPAREN, MINUS,
	 * PLUS, and the Tier-1 infix operators) — those are deliberately kept
	 * registered here for introspection/diagnostics even though Tier-1
	 * always intercepts them before this registry is consulted (see
	 * PrecedenceParser.parsePrefix()'s docs), so warning there would
	 * misfire on that intentional, already-documented pattern.
	 */
	registerPrefix(tokenType: string, parselet: PrefixParselet): void {
		const existing = this.prefixParselets.get(tokenType);
		if (existing && existing !== parselet) {
			console.warn(
				`[ParseletRegistry] Prefix parselet for token "${tokenType}" is already registered ` +
				`(category: "${(existing as any).category ?? "unknown"}"). Overwriting with a new ` +
				`parselet (category: "${(parselet as any).category ?? "unknown"}") — the previous ` +
				`parselet is now unreachable. Two packages may be claiming the same token type.`,
			);
		}
		this.prefixParselets.set(tokenType, parselet);
		this.prefixById.set(tokenTypeId(tokenType), parselet);
	}

	/** Register an infix parselet for `tokenType`. See {@link registerPrefix} for the collision-warning behavior this mirrors. */
	registerInfix(tokenType: string, parselet: InfixParselet): void {
		const existing = this.infixParselets.get(tokenType);
		if (existing && existing !== parselet) {
			console.warn(
				`[ParseletRegistry] Infix parselet for token "${tokenType}" is already registered ` +
				`(category: "${(existing as any).category ?? "unknown"}"). Overwriting with a new ` +
				`parselet (category: "${(parselet as any).category ?? "unknown"}") — the previous ` +
				`parselet is now unreachable. Two packages may be claiming the same token type.`,
			);
		}
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
