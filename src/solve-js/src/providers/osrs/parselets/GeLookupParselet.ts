import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

/**
 * GeLookupParselet — compiles `ge("Item name")` expressions into
 * CALL_PLUGIN bytecode that invokes the OSRS Grand Exchange lookup.
 *
 * Syntax:  ge("Abyssal whip")
 *          ge("Dragon bones") * 5
 *          price("Rune scimitar")
 *
 * Compiles to:
 *   PUSH_STRING "Abyssal whip"
 *   CALL_PLUGIN <fnIdx> 1
 *
 * Where fnIdx is the index registered in pluginFunctionRegistry
 * by the OsrsGePackage at registration time.
 *
 * The CALL_PLUGIN opcode handles the async path natively:
 *   - If the function returns a Promise, the VM returns { type: 'pending' }
 *   - The engine caches the Promise and re-evaluates when resolved
 *   - On re-evaluation, the cached value is returned synchronously
 *
 * This means no separate preflight resolver is needed — the CALL_PLUGIN
 * mechanism handles the full async lifecycle.
 */
export class GeLookupParselet implements PrefixParselet {
	/**
	 * Parser category for registration.
	 */
	readonly category = "OSRS";

	/**
	 * @param fnIdx - The plugin function index to call (registered in
	 *                pluginFunctionRegistry by the package)
	 * @param keyword - The token type keyword to match ("ge" or "price")
	 */
	constructor(
		private readonly fnIdx: number,
		private readonly keyword: string,
	) {}

	parse(parser: Parser, _token: Token, builder: BytecodeBuilder): void {
		// Consume the opening paren
		const open = parser.peek();
		if (!open || open.type !== "LPAREN") {
			// No opening paren — treat as a bare keyword (push 0 as default)
			builder.emitOpcode(OpCode.PUSH_STRING);
			builder.emitString("");
			builder.emitOpcode(OpCode.CALL_PLUGIN);
			builder.emitNumber(this.fnIdx);
			builder.emitNumber(1); // argCount
			return;
		}

		parser.consume("LPAREN");

		// Parse the item name — expect a STRING literal
		const nameToken = parser.peek();
		if (!nameToken) {
			// Empty ge() — return 0
			builder.emitOpcode(OpCode.PUSH_STRING);
			builder.emitString("");
			builder.emitOpcode(OpCode.CALL_PLUGIN);
			builder.emitNumber(this.fnIdx);
			builder.emitNumber(1);
			// Try to consume closing paren if present
			if (parser.peek()?.type === "RPAREN") parser.consume("RPAREN");
			return;
		}

		let itemName: string;

		if (nameToken.type === "STRING") {
			// ge("Abyssal whip")
			parser.consume("STRING");
			itemName = nameToken.value;
		} else if (nameToken.type === "IDENT") {
			// ge(AbyssalWhip) — bare identifier, use its name
			parser.consume("IDENT");
			itemName = nameToken.value;
		} else {
			// Unexpected token type — try to consume it and use whatever we got
			parser.consume();
			itemName = String(nameToken.value ?? "");
		}

		// Consume closing paren
		if (parser.peek()?.type === "RPAREN") {
			parser.consume("RPAREN");
		}

		// Emit bytecode: push item name, then CALL_PLUGIN
		builder.emitOpcode(OpCode.PUSH_STRING);
		builder.emitString(itemName);
		builder.emitOpcode(OpCode.CALL_PLUGIN);
		builder.emitNumber(this.fnIdx);
		builder.emitNumber(1); // argCount: just the item name
	}
}
