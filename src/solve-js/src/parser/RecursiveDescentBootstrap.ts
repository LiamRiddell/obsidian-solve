/**
 * RecursiveDescentBootstrap.ts
 *
 * Registers ALL prefix/infix handlers for the RecursiveDescentParser.
 * Converts every Pratt parselet into a handler function compatible with
 * the precedence-climbing RD parser.
 *
 * This file is the bridge between the old parselet system and the new RD parser.
 * Once the RD parser is stable, the parselet classes can be deleted.
 */

import { RecursiveDescentParser, type PrefixHandler, type InfixHandler } from "@solve-js/parser/RecursiveDescentParser";
import { OpCode } from "@solve-js/parser/OpCode";
import { getLocale } from "@solve-js/constants/locales";
import { symbolToCurrency } from "@solve-js/providers/uom/parselets/CurrencySymbolParselet";

// ── Helper: prefix precedence (for unary +/-) ────────────────────────────────
const PREC_PREFIX = 60;

// ── Helper: builtin function name → index ────────────────────────────────────
// Mirrors FunctionCallParselet. Handled inline in RecursiveDescentParser,
// but exported here for consistency with the parselet migration.

// ═══════════════════════════════════════════════════════════════════════════════
// ARITHMETIC PROVIDER
// ═══════════════════════════════════════════════════════════════════════════════

function registerArithmeticHandlers(parser: RecursiveDescentParser): void {
	// ── Prefix handlers ──────────────────────────────────────────────────

	// Number literal (NUMBER) — locale-aware parsing
	parser.registerPrefix("NUMBER", (p, token) => {
		let v: number;
		const raw = token.value;
		if (raw.startsWith("0x") || raw.startsWith("0X")) {
			v = parseInt(raw, 16);
		} else if (raw.startsWith("0b") || raw.startsWith("0B")) {
			v = parseInt(raw.slice(2), 2);
		} else {
			const locale = getLocale(p.localeCode);
			const thousandsSep = locale.display.thousandsSeparator;
			const decimalSep = locale.display.decimalSeparator;

			let normalized = raw;
			if (thousandsSep) {
				normalized = normalized.split(thousandsSep).join("");
			}
			if (decimalSep && decimalSep !== ".") {
				normalized = normalized.replace(decimalSep, ".");
			}
			v = parseFloat(normalized);
		}
		p.builder.emitOpcode(OpCode.PUSH_NUMBER);
		p.builder.emitNumber(v);
	});

	// Unary plus (+x)
	parser.registerPrefix("PLUS", (p, _token) => {
		p.parseExpression(PREC_PREFIX);
		p.builder.emitOpcode(OpCode.POS);
	});

	// Unary minus (-x)
	parser.registerPrefix("MINUS", (p, _token) => {
		p.parseExpression(PREC_PREFIX);
		p.builder.emitOpcode(OpCode.NEG);
	});

	// Note: LPAREN, PI, E are handled inline in RecursiveDescentParser's switch.
	// They do NOT need to be registered here.

	// ── Infix handlers (simple binary operators) ─────────────────────────

	// Addition / subtraction — Precedence: Sum (30)
	parser.registerSimpleInfix("PLUS", 30, OpCode.ADD);
	parser.registerSimpleInfix("MINUS", 30, OpCode.SUB);

	// Multiplication / division / modulo — Precedence: Product (40)
	parser.registerSimpleInfix("STAR", 40, OpCode.MUL);
	parser.registerSimpleInfix("SLASH", 40, OpCode.DIV);
	parser.registerSimpleInfix("MOD", 40, OpCode.MOD);

	// Exponentiation — Precedence: Exponent (50), RIGHT-associative
	parser.registerSimpleInfix("CARET", 50, OpCode.EXP, true);

	// Word-based operators
	parser.registerSimpleInfix("TIMES_BY", 40, OpCode.MUL);
	parser.registerSimpleInfix("MULTIPLY_BY", 40, OpCode.MUL);
	parser.registerSimpleInfix("DIVIDE_BY", 40, OpCode.DIV);

	// Bitwise operators
	parser.registerSimpleInfix("LSHIFT", 30, OpCode.LSHIFT);
	parser.registerSimpleInfix("RSHIFT", 30, OpCode.RSHIFT);
	parser.registerSimpleInfix("BIT_AND", 40, OpCode.BIT_AND);
	parser.registerSimpleInfix("BIT_OR", 30, OpCode.BIT_OR);
	parser.registerSimpleInfix("BIT_XOR", 35, OpCode.BIT_XOR);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BIGINT PROVIDER
// ═══════════════════════════════════════════════════════════════════════════════

function registerBigIntHandlers(parser: RecursiveDescentParser): void {
	parser.registerPrefix("BIGINT", (p, token) => {
		let raw = token.value;
		if (raw.endsWith("n")) raw = raw.slice(0, -1);
		const bigVal = BigInt(raw);
		const num = Number(bigVal);
		p.builder.emitOpcode(OpCode.PUSH_BIGINT);
		p.builder.emitNumber(num);
	});
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATETIME PROVIDER
// ═══════════════════════════════════════════════════════════════════════════════

function registerDatetimeHandlers(parser: RecursiveDescentParser): void {
	// now, today, tomorrow, yesterday — all emit DATE_NOW
	const nowHandler: PrefixHandler = (p, _token) => {
		p.builder.emitOpcode(OpCode.DATE_NOW);
	};
	parser.registerPrefix("NOW", nowHandler);
	parser.registerPrefix("TODAY", nowHandler);
	parser.registerPrefix("TOMORROW", nowHandler);
	parser.registerPrefix("YESTERDAY", nowHandler);

	// next X — emits DATE_NOW, parses offset, adds ms
	parser.registerPrefix("NEXT", (p, _token) => {
		const MS_7_DAYS = 7 * 24 * 60 * 60 * 1000;
		p.builder.emitOpcode(OpCode.DATE_NOW);
		p.parseExpression(0);
		p.builder.emitOpcode(OpCode.PUSH_NUMBER);
		p.builder.emitNumber(MS_7_DAYS);
		p.builder.emitOpcode(OpCode.ADD);
	});

	// last X — emits DATE_NOW, parses offset, subtracts ms
	parser.registerPrefix("LAST", (p, _token) => {
		const MS_NEG_7_DAYS = -7 * 24 * 60 * 60 * 1000;
		p.builder.emitOpcode(OpCode.DATE_NOW);
		p.parseExpression(0);
		p.builder.emitOpcode(OpCode.PUSH_NUMBER);
		p.builder.emitNumber(MS_NEG_7_DAYS);
		p.builder.emitOpcode(OpCode.ADD);
	});
}

// ═══════════════════════════════════════════════════════════════════════════════
// DICE PROVIDER
// ═══════════════════════════════════════════════════════════════════════════════

/** CALL_BUILTIN index for diceRoll(from, to). Matches VMBuiltins.ts index 37. */
const DICE_ROLL_BUILTIN = 37;

function registerDiceHandlers(parser: RecursiveDescentParser): void {
	parser.registerPrefix("ROLL", (p, token) => {
		const next = p.peek();
		if (next && (next.type === "BETWEEN" || next.type === "FROM")) {
			// roll between X and Y / roll from X to Y
			p.advance(); // consume BETWEEN or FROM
			p.parseExpression(40); // parse lower bound with Product precedence
			p.consume(); // consume AND or TO (whichever separator)
			p.parseExpression(0); // parse upper bound
			p.builder.emitOpcode(OpCode.CALL_BUILTIN);
			p.builder.emitIndex(DICE_ROLL_BUILTIN);
			p.builder.emitIndex(2);
		} else {
			// roll(X, Y) syntax
			p.consume("LPAREN");
			p.parseExpression(0);
			p.consume("COMMA");
			p.parseExpression(0);
			p.consume("RPAREN");
			p.builder.emitOpcode(OpCode.CALL_BUILTIN);
			p.builder.emitIndex(DICE_ROLL_BUILTIN);
			p.builder.emitIndex(2);
		}
	});
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTION PROVIDER
// ═══════════════════════════════════════════════════════════════════════════════

// Handled inline in RecursiveDescentParser (FUNC case in switch).
// No registration needed.

// ═══════════════════════════════════════════════════════════════════════════════
// PERCENTAGE PROVIDER
// ═══════════════════════════════════════════════════════════════════════════════

function registerPercentageHandlers(parser: RecursiveDescentParser): void {
	// Postfix % — divides by 100 (selfParseRight: no RHS to parse)
	parser.registerInfix("PERCENT", 60, (_p, _leftToken, _operatorToken) => {
		_p.builder.emitOpcode(OpCode.PUSH_NUMBER);
		_p.builder.emitNumber(100);
		_p.builder.emitOpcode(OpCode.DIV);
	}, false, true); // rightAssoc=false, selfParseRight=true

	// "of" — multiplies (10% of 200 → 10/100 * 200)
	parser.registerSimpleInfix("OF", 40, OpCode.MUL);

	// "increase <amount>" — (base * (1 + amount))
	parser.registerPrefix("INCREASE", (p, _token) => {
		p.parseExpression(0); // base
		const next = p.peek();
		if (next && (next.type === "IDENT" || next.type === "BY")) {
			p.advance();
		}
		p.builder.emitOpcode(OpCode.PUSH_NUMBER);
		p.builder.emitNumber(1);
		p.parseExpression(0); // amount (may have % postfix)
		if (p.peek()?.type === "PERCENT") p.advance();
		p.builder.emitOpcode(OpCode.ADD);
		p.builder.emitOpcode(OpCode.MUL);
	});

	// "decrease <amount>" — (base * (1 - amount))
	parser.registerPrefix("DECREASE", (p, _token) => {
		p.parseExpression(0); // base
		const next = p.peek();
		if (next && (next.type === "IDENT" || next.type === "BY")) {
			p.advance();
		}
		p.builder.emitOpcode(OpCode.PUSH_NUMBER);
		p.builder.emitNumber(1);
		p.parseExpression(0); // amount (may have % postfix)
		if (p.peek()?.type === "PERCENT") p.advance();
		p.builder.emitOpcode(OpCode.SUB);
		p.builder.emitOpcode(OpCode.MUL);
	});

	// "X to Y" — percentage change: ((Y / X) - 1) → percentage
	parser.registerInfix("TO", 20, (_p, _leftToken, _operatorToken) => {
		// Stack: [left, right] — right already parsed by climbing loop
		_p.builder.emitOpcode(OpCode.SWAP);
		_p.builder.emitOpcode(OpCode.DIV);
		_p.builder.emitOpcode(OpCode.PUSH_NUMBER);
		_p.builder.emitNumber(1);
		_p.builder.emitOpcode(OpCode.SUB);
		_p.builder.emitOpcode(OpCode.TO_PERCENTAGE);
	});
}

// ═══════════════════════════════════════════════════════════════════════════════
// UOM (UNITS OF MEASUREMENT) PROVIDER
// ═══════════════════════════════════════════════════════════════════════════════

function registerUomHandlers(parser: RecursiveDescentParser): void {
	// Prefix: "convert <expr> [to <target>]"
	parser.registerPrefix("CONVERT", (p, _token) => {
		p.parseExpression(70); // parse at Postfix precedence (allows UNIT to bind)
		const nextToken = p.peek();

		// Case 1: convert <value> <unit> [to <target>]
		if (nextToken && nextToken.type === "UNIT") {
			p.advance();
			p.builder.emitOpcode(OpCode.PUSH_STRING);
			p.builder.emitString(nextToken.value);

			if (p.peek()?.type === "TO") {
				p.advance();
				const targetToken = p.consume();
				if (targetToken?.type === "UNIT") {
					p.builder.emitOpcode(OpCode.PUSH_STRING);
					p.builder.emitString(targetToken.value);
					p.builder.emitOpcode(OpCode.UOM_CONVERT_TO);
				} else if (targetToken?.type === "BEST") {
					p.builder.emitOpcode(OpCode.UOM_BEST);
				}
			} else {
				p.builder.emitOpcode(OpCode.UOM_CONVERT);
			}
			return;
		}

		// Case 2: convert (<expr>) to <target> / in <target>
		if (nextToken && (nextToken.type === "TO" || nextToken.type === "IN")) {
			p.advance(); // consume TO or IN
			const targetToken = p.peek();
			if (targetToken?.type === "UNIT" || targetToken?.type === "IN" ||
				targetToken?.type === "DOLLAR" || targetToken?.type === "POUND" ||
				targetToken?.type === "EURO" || targetToken?.type === "IDENT") {
				p.advance();
				p.builder.emitOpcode(OpCode.PUSH_STRING);
				p.builder.emitString(targetToken.value);
				p.builder.emitOpcode(OpCode.UOM_CONVERT_IN);
			} else if (targetToken?.type === "BEST") {
				p.advance();
				p.builder.emitOpcode(OpCode.UOM_BEST);
			}
			return;
		}

		// Case 3: convert <UOM expression> — value already on stack as UOM
	});

	// Infix: "5 km" — UNIT token after a number
	parser.registerInfix("UNIT", 70, (p, _leftToken, operatorToken) => {
		const unit = operatorToken.value;
		p.builder.emitOpcode(OpCode.PUSH_STRING);
		p.builder.emitString(unit);

		// Check for "to <target>" or "in <target>" inline
		if (p.peek()?.type === "TO" || p.peek()?.type === "IN") {
			p.advance(); // consume TO or IN
			const targetToken = p.peek();
			if (targetToken?.type === "UNIT" || targetToken?.type === "IN") {
				p.advance();
				p.builder.emitOpcode(OpCode.PUSH_STRING);
				p.builder.emitString(targetToken.value);
				p.builder.emitOpcode(OpCode.UOM_CONVERT_TO);
				return;
			}
		}

		// Check for "best"
		if (p.peek()?.type === "BEST") {
			p.advance();
			p.builder.emitOpcode(OpCode.UOM_BEST);
			return;
		}

		p.builder.emitOpcode(OpCode.UOM_CONVERT);
	}, false, true); // selfParseRight=true: handler handles its own RHS

	// Infix: "25 in GBP" — IN keyword for postfix unit conversion
	parser.registerInfix("IN", 35, (p, _leftToken, _operatorToken) => {
		const targetToken = p.peek();
		if (targetToken && (
			targetToken.type === "UNIT" ||
			targetToken.type === "DOLLAR" ||
			targetToken.type === "POUND" ||
			targetToken.type === "EURO" ||
			targetToken.type === "IDENT" ||
			targetToken.type === "IN"
		)) {
			p.advance();
			p.builder.emitOpcode(OpCode.PUSH_STRING);
			p.builder.emitString(targetToken.value);
			p.builder.emitOpcode(OpCode.UOM_CONVERT_IN);
		}
		// If next token isn't a valid target, silently skip — left stays on stack
	}, false, true); // selfParseRight=true

	// Prefix: $100, £50, €30 — currency symbol prefix
	const currencyPrefixHandler: PrefixHandler = (p, token) => {
		const currency = symbolToCurrency[token.value] ?? token.value.toUpperCase();
		p.parseExpression(PREC_PREFIX);
		if (p.peek()?.type === "UNIT") {
			p.advance();
		}
		p.builder.emitOpcode(OpCode.PUSH_STRING);
		p.builder.emitString(currency);
		p.builder.emitOpcode(OpCode.UOM_CONVERT);
	};
	parser.registerPrefix("DOLLAR", currencyPrefixHandler);
	parser.registerPrefix("POUND", currencyPrefixHandler);
	parser.registerPrefix("EURO", currencyPrefixHandler);
}

// ═══════════════════════════════════════════════════════════════════════════════
// VECTOR PROVIDER
// ═══════════════════════════════════════════════════════════════════════════════

function registerVectorHandlers(parser: RecursiveDescentParser): void {
	// vec2(X, Y), vec3(X, Y, Z), vec4(X, Y, Z, W)
	const makeVectorHandler = (dimension: number): PrefixHandler => {
		return (p, _token) => {
			p.consume("LPAREN");
			let count = 0;
			if (p.peek()?.type !== "RPAREN") {
				p.parseExpression(0);
				count++;
				while (p.match("COMMA")) {
					p.parseExpression(0);
					count++;
				}
			}
			p.consume("RPAREN");
			p.builder.emitOpcode(OpCode.ARR_NEW);
			p.builder.emitIndex(dimension > 0 ? dimension : count);
		};
	};

	parser.registerPrefix("VEC2", makeVectorHandler(2));
	parser.registerPrefix("VEC3", makeVectorHandler(3));
	parser.registerPrefix("VEC4", makeVectorHandler(4));

	// float(X) — single-element vector
	parser.registerPrefix("FLOAT", (p, _token) => {
		p.consume("LPAREN");
		p.parseExpression(0);
		p.consume("RPAREN");
		p.builder.emitOpcode(OpCode.ARR_NEW);
		p.builder.emitIndex(1);
	});
}

// ═══════════════════════════════════════════════════════════════════════════════
// VARIABLES PROVIDER
// ═══════════════════════════════════════════════════════════════════════════════

// Handled inline in RecursiveDescentParser:
// - COLON → parseVariable (definition/reference)
// - IDENT → parseIdentifier (bare variable reference)
// No registration needed.

// ═══════════════════════════════════════════════════════════════════════════════
// MASTER REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Register ALL handlers with the recursive descent parser.
 * Call once per parser instance (e.g., in ExpressionEngine constructor).
 *
 * Handlers NOT registered (handled inline in RecursiveDescentParser's switch):
 * - LPAREN → GroupParselet (inline)
 * - PI, E → ConstantParselet (inline)
 * - FUNC → FunctionCallParselet (inline)
 * - COLON → VariableParselet (inline)
 * - IDENT → IdentifierParselet (inline)
 */
export function registerAllHandlers(parser: RecursiveDescentParser): void {
	registerArithmeticHandlers(parser);
	registerBigIntHandlers(parser);
	registerDatetimeHandlers(parser);
	registerDiceHandlers(parser);
	registerPercentageHandlers(parser);
	registerUomHandlers(parser);
	registerVectorHandlers(parser);
	// Variables + Function handled inline — no registration needed
}
