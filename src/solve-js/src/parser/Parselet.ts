import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { Token } from "@solve-js/lexer/Token";
import { Parser } from "@solve-js/parser/Parser";

export interface PrefixParselet {
	parse(parser: Parser, token: Token, builder: BytecodeBuilder): void;
}

export interface InfixParselet {
	parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void;
	getBindingPower(): number;
}
