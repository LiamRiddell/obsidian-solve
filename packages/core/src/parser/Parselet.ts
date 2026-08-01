import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { Token } from "@solve-js/lexer/Token";
import { Parser } from "@solve-js/parser/Parser";

export interface PrefixParselet {
	/** Diagnostic category for this parselet (e.g. "Arithmetic", "Function", "Variable") */
	readonly category: string;
	parse(parser: Parser, token: Token, builder: BytecodeBuilder): void;
}

export interface InfixParselet {
	/** Diagnostic category for this parselet (e.g. "Arithmetic", "UoM") */
	readonly category: string;
	/** Binding power (precedence) — property access avoids vtable dispatch in hot loop */
	readonly bindingPower: number;
	parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void;
}
