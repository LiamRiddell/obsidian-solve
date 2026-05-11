import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { Token } from "@/engine/lexer/Token";
import { Parser } from "@/engine/parser/Parser";

export interface PrefixParselet {
	parse(parser: Parser, token: Token, builder: BytecodeBuilder): void;
}

export interface InfixParselet {
	parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void;
	getBindingPower(): number;
}