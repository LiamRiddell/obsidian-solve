import { PrefixParselet, InfixParselet } from "@/engine/parser/Parselet";

export class ParseletRegistry {
	private prefixParselets: Map<string, PrefixParselet> = new Map();
	private infixParselets: Map<string, InfixParselet> = new Map();

	registerPrefix(tokenType: string, parselet: PrefixParselet): void {
		this.prefixParselets.set(tokenType, parselet);
	}

	registerInfix(tokenType: string, parselet: InfixParselet): void {
		this.infixParselets.set(tokenType, parselet);
	}

	getPrefix(tokenType: string): PrefixParselet | undefined {
		return this.prefixParselets.get(tokenType);
	}

	getInfix(tokenType: string): InfixParselet | undefined {
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
	}
}

export const sharedParseletRegistry = new ParseletRegistry();