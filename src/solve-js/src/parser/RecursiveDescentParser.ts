import { Token, tokenTypeId } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import { DiagnosticPipeline, DiagnosticEventType, type DiagnosticEvent } from "@solve-js/diagnostics";

// ── Pre-computed token type IDs (module-level constants for switch dispatch) ──

const NUMBER_ID = tokenTypeId("NUMBER");
const BIGINT_ID = tokenTypeId("BIGINT");
const LPAREN_ID = tokenTypeId("LPAREN");
const RPAREN_ID = tokenTypeId("RPAREN");
const FUNC_ID = tokenTypeId("FUNC");
const COLON_ID = tokenTypeId("COLON");
const IDENT_ID = tokenTypeId("IDENT");
const PI_ID = tokenTypeId("PI");
const E_ID = tokenTypeId("E");
const COMMA_ID = tokenTypeId("COMMA");
const EQUALS_ID = tokenTypeId("EQUALS");

// ── Handler Types ────────────────────────────────────────────────────────────

/**
 * Prefix handler: called when a token starts an expression.
 * The handler is responsible for parsing the complete prefix construct
 * (which may include recursive calls back to the parser) and emitting opcodes.
 */
export type PrefixHandler = (parser: RecursiveDescentParser, token: Token) => void;

/**
 * Infix handler: called when a token appears between the left and right operands.
 * By the time this is called, the right operand has already been parsed
 * (by the precedence climbing loop). The handler just emits the operation opcodes.
 *
 * leftToken: the original prefix token (rarely needed, mostly for diagnostics)
 * operatorToken: the infix operator token
 */
export type InfixHandler = (
	parser: RecursiveDescentParser,
	leftToken: Token,
	operatorToken: Token
) => void;

// ── Precedence Entry ─────────────────────────────────────────────────────────

interface InfixEntry {
	/** Binding power / precedence level. Higher = tighter binding. */
	prec: number;
	/** The handler that emits opcodes for this operation. */
	handler: InfixHandler;
	/** Whether the operator is right-associative (e.g., ^, =). Default: false (left-assoc). */
	rightAssoc?: boolean;
	/**
	 * If true, the handler parses its own right side (the parser does NOT call
	 * parseExpression before the handler). Use for operators like IN, OF, TO
	 * where the right side is not a standard expression (e.g., a unit name).
	 */
	selfParseRight?: boolean;
}

// ── RecursiveDescentParser ───────────────────────────────────────────────────

export class RecursiveDescentParser {
	// ── Parser state ──
	private tokens: Token[] = [];
	private current = 0;
	private depth = 0;
	private maxDepth: number;

	/** The bytecode builder — set before parsing, accessed by handlers. */
	builder: BytecodeBuilder = new BytecodeBuilder();

	// ── Diagnostic support ──
	private diagnosticPipeline: DiagnosticPipeline | undefined;
	private currentExpression = "";

	// ── Locale support (for NumberParselet) ──
	localeCode: string;

	// ── Pluggable handler registries ──
	/** Token type ID → prefix handler. Checked AFTER the built-in switch cases. */
	private prefixHandlers = new Map<number, PrefixHandler>();

	/** Token type ID → infix entry. Checked in the precedence climbing loop. */
	private infixEntries = new Map<number, InfixEntry>();

	constructor(maxDepth = 50, localeCode = "en") {
		this.maxDepth = maxDepth;
		this.localeCode = localeCode;
	}

	// ── Registration API (for packages/plugins) ───────────────────────────────

	/**
	 * Register a prefix handler for a token type.
	 * Used by provider packages and plugins to add new expression constructs.
	 * Built-in types (NUMBER, LPAREN, FUNC, COLON, IDENT, PI, E) are handled
	 * inline and should NOT be registered here — they would be ignored.
	 */
	registerPrefix(tokenType: string, handler: PrefixHandler): void {
		this.prefixHandlers.set(tokenTypeId(tokenType), handler);
	}

	/**
	 * Register an infix handler for a token type with a given precedence.
	 * Simple operators (+, -, *, /, ^, etc.) are registered via registerSimpleInfix().
	 * Use this for complex infix operations that need custom handler logic (e.g., UNIT, IN, OF).
	 *
	 * @param selfParseRight If true, the handler parses its own right side.
	 */
	registerInfix(tokenType: string, prec: number, handler: InfixHandler, rightAssoc = false, selfParseRight = false): void {
		this.infixEntries.set(tokenTypeId(tokenType), { prec, handler, rightAssoc, selfParseRight });
	}

	/**
	 * Register a simple infix operator that just emits a single opcode.
	 * Handles ~80% of infix operators (+, -, *, /, ^, %, bitwise, comparisons, etc.).
	 */
	registerSimpleInfix(tokenType: string, prec: number, opcode: OpCode, rightAssoc = false): void {
		const handler: InfixHandler = (_parser, _leftToken, _operatorToken) => {
			_parser.builder.emitOpcode(opcode);
		};
		this.infixEntries.set(tokenTypeId(tokenType), { prec, handler, rightAssoc });
	}

	// ── Token stream management ───────────────────────────────────────────────

	/**
	 * Load a token array into the parser. Auto-balances parentheses.
	 * @param tokens The token stream to parse
	 * @param hasParens If false, skips the O(n) paren scan (performance optimization)
	 */
	load(tokens: Token[], hasParens?: boolean): void {
		// Fast path: if caller guarantees no parentheses, skip the O(n) paren scan.
		if (hasParens === false) {
			this.tokens = tokens;
			this.current = 0;
			this.depth = 0;
			return;
		}
		// Paren scan: count balance to skip array copy for balanced expressions.
		let openCount = 0;
		for (let i = 0; i < tokens.length; i++) {
			if (tokens[i].typeId === LPAREN_ID) openCount++;
			else if (tokens[i].typeId === RPAREN_ID) openCount--;
		}
		this.tokens = openCount === 0 ? tokens : this.balanceParens(tokens, openCount);
		this.current = 0;
		this.depth = 0;
	}

	private balanceParens(tokens: Token[], openCount: number): Token[] {
		const result = tokens.slice();
		if (openCount > 0) {
			for (let i = 0; i < openCount; i++) {
				const lastToken = tokens[tokens.length - 1];
				result.push({
					type: "RPAREN", typeId: RPAREN_ID, value: ")", text: ")",
					offset: lastToken ? lastToken.offset + lastToken.text.length : 0,
					lineBreaks: 0, line: lastToken ? lastToken.line : 1,
					col: lastToken ? lastToken.col + lastToken.text.length : 1,
				} as Token);
			}
		} else if (openCount < 0) {
			for (let i = 0; i < -openCount; i++) {
				result.unshift({
					type: "LPAREN", typeId: LPAREN_ID, value: "(", text: "(",
					offset: 0, lineBreaks: 0, line: 1, col: 1,
				} as Token);
			}
		}
		return result;
	}

	// ── Diagnostic pipeline ───────────────────────────────────────────────────

	setDiagnosticPipeline(pipeline: DiagnosticPipeline | undefined, expression: string): void {
		this.diagnosticPipeline = pipeline;
		this.currentExpression = expression ?? "";
	}

	private fireParseletMatched(
		category: string, handlerName: string, token: Token,
		isPrefix: boolean, bindingPower?: number
	): void {
		const pipeline = this.diagnosticPipeline;
		if (!pipeline) return;
		const event: DiagnosticEvent & { type: "parselet_matched" } = {
			type: DiagnosticEventType.ParseletMatched,
			elapsedNs: 0,
			expression: this.currentExpression,
			tokenType: token.type,
			tokenValue: token.value,
			parseletCategory: category,
			parseletType: handlerName,
			isPrefix,
			bindingPower,
			tokenOffset: token.offset || 0,
		};
		pipeline.fireParseletMatched(event);
	}

	// ── Token stream accessors ────────────────────────────────────────────────

	consume(expectedType?: string): Token {
		const token = this.tokens[this.current];
		if (!token) {
			throw ErrorFactory.parsing("UNEXPECTED_END_OF_INPUT", "Unexpected end of input");
		}
		if (expectedType !== undefined) {
			const expectedId = tokenTypeId(expectedType);
			if (token.typeId !== expectedId) {
				throw ErrorFactory.parsing(
					"UNEXPECTED_TOKEN_TYPE",
					`Expected token type "${expectedType}" but got "${token.type}" ("${token.value}")`,
					{ expectedType, actualType: token.type, actualValue: token.value }
				);
			}
		}
		this.current++;
		return token;
	}

	match(expectedType: string): boolean {
		const token = this.peek();
		if (token && token.typeId === tokenTypeId(expectedType)) {
			this.advance();
			return true;
		}
		return false;
	}

	peek(): Token | undefined {
		return this.tokens[this.current];
	}

	previous(): Token | undefined {
		return this.current > 0 ? this.tokens[this.current - 1] : undefined;
	}

	/** Advance past the current token without consuming it. Public for handler access. */
	advance(): void {
		this.current++;
	}

	// ── Main parse entry point — recursive descent with precedence climbing ───

	/**
	 * Parse an expression starting at the current token position.
	 *
	 * This uses the precedence climbing algorithm:
	 * 1. Parse the prefix (left operand) — dispatch via switch on token type
	 * 2. While the next token is an infix operator with precedence >= minPrec:
	 *    a. Consume the operator
	 *    b. Recursively parse the right operand at (prec + 1) for left-assoc,
	 *       or at prec for right-assoc
	 *    c. Call the infix handler to emit opcodes
	 *
	 * @param minPrec Minimum precedence — only operators with prec >= minPrec are parsed
	 */
	parseExpression(minPrec = 0): void {
		this.depth++;
		if (this.depth > this.maxDepth) {
			this.depth--;
			throw ErrorFactory.parsing(
				"NESTING_DEPTH_EXCEEDED",
				`Parse nesting depth ${this.depth} exceeds maximum of ${this.maxDepth}`,
				{ maxDepth: this.maxDepth, currentDepth: this.depth }
			);
		}

		// ── Step 1: Parse prefix (left operand) ────────────────────────────
		const token = this.consume();

		const hasDiag = this.diagnosticPipeline !== undefined;

		switch (token.typeId) {
			// ─── NUMBER literal ───────────────────────────────────────────
			// Most common prefix expression. Dispatched to registered handler
			// via default case (keeps locale-aware parsing in the handler,
			// and allows packages to override number parsing).
			// TODO: Inline for ~5% speedup (move handler logic into parser).

			// ─── Grouped expression: ( expr ) ──────────────────────────────
			case LPAREN_ID:
				this.parseExpression(0);
				this.consume("RPAREN");
				break;

			// ─── Function call: fnName(args) ───────────────────────────────
			case FUNC_ID:
				this.parseFunctionCall(token);
				break;

			// ─── Variable definition/reference: :name or :name = expr ─────
			case COLON_ID:
				this.parseVariable(token);
				break;

			// ─── Identifier (variable reference) ──────────────────────────
			case IDENT_ID:
				this.parseIdentifier(token);
				break;

			// ─── Constants: pi, e ─────────────────────────────────────────
			case PI_ID:
			case E_ID:
				this.parseConstant(token);
				break;

			// ─── Pluggable prefix handlers (provider packages, plugins) ───
			default: {
				const handler = this.prefixHandlers.get(token.typeId);
				if (!handler) {
					this.depth--;
					throw ErrorFactory.parsing(
						"NO_PREFIX_HANDLER",
						`No prefix handler found for token: ${token.type} ("${token.value}")`,
						{ tokenType: token.type, tokenValue: token.value }
					);
				}
				if (hasDiag) {
					this.fireParseletMatched(
						handler.name || "custom",
						handler.name || "PrefixHandler",
						token, true
					);
				}
				handler(this, token);
				break;
			}
		}

		// ── Step 2: Precedence climbing — infix operator loop ─────────────
		let peek = this.peek();
		while (peek) {
			const entry = this.infixEntries.get(peek.typeId);
			if (!entry || entry.prec < minPrec) break;

			// Consume the operator token
			this.advance();
			const opToken = peek;

			if (hasDiag) {
				this.fireParseletMatched(
					"Arithmetic", "InfixHandler", opToken, false, entry.prec
				);
			}

			// Parse the right operand at higher (or same, for right-assoc) precedence.
			// Skip for self-parse operators (IN, OF, TO) — they handle their own RHS.
			if (!entry.selfParseRight) {
				const nextPrec = entry.rightAssoc ? entry.prec : entry.prec + 1;
				this.parseExpression(nextPrec);
			}

			// Emit the operation
			entry.handler(this, token, opToken);

			peek = this.peek();
		}

		this.depth--;
	}

	// ── Built-in prefix handlers (inline for speed) ───────────────────────────

	/**
	 * Parse a function call: fnName(arg1, arg2, ...)
	 */
	private parseFunctionCall(token: Token): void {
		const fnName = token.value.toLowerCase();

		// Import the builtin index lazily to avoid circular deps.
		// This is the same lookup used by FunctionCallParselet.
		const fnIdx = BUILTIN_NAME_TO_INDEX[fnName];
		if (fnIdx === undefined) {
			throw ErrorFactory.execution(
				"UNKNOWN_FUNCTION",
				`Unknown function: ${fnName}`,
				{ functionName: fnName }
			);
		}

		this.consume("LPAREN");

		let argCount = 0;
		if (this.peek()?.type !== "RPAREN") {
			this.parseExpression(0);
			argCount++;
			while (this.match("COMMA")) {
				this.parseExpression(0);
				argCount++;
			}
		}

		this.consume("RPAREN");

		this.builder.emitOpcode(OpCode.CALL_BUILTIN);
		this.builder.emitIndex(fnIdx);
		this.builder.emitIndex(argCount);
	}

	/**
	 * Parse a variable definition or reference: :name or :name = expr
	 */
	private parseVariable(_token: Token): void {
		const nameToken = this.consume();
		if (nameToken.type !== "IDENT") {
			throw ErrorFactory.parsing(
				"EXPECTED_IDENTIFIER",
				`Expected identifier after colon, got ${nameToken.type}`,
				{ tokenType: nameToken.type }
			);
		}
		const varName = nameToken.value;

		if (this.peek()?.type === "EQUALS") {
			this.consume("EQUALS");
			this.parseExpression(0);
			this.builder.emitOpcode(OpCode.STORE_VAR);
			this.builder.emitString(varName);
		} else {
			this.builder.emitOpcode(OpCode.LOAD_VAR);
			this.builder.emitString(varName);
		}
	}

	/**
	 * Parse a bare identifier (variable reference).
	 */
	private parseIdentifier(token: Token): void {
		this.builder.emitOpcode(OpCode.LOAD_VAR);
		this.builder.emitString(token.value);
	}

	/**
	 * Parse a constant: PI or E.
	 */
	private parseConstant(token: Token): void {
		const val = token.type === "PI" ? Math.PI : Math.E;
		this.builder.emitOpcode(OpCode.PUSH_NUMBER);
		this.builder.emitNumber(val);
	}
}

// ── Builtin function name → index table ──────────────────────────────────────
// Mirrors the table in FunctionCallParselet. Kept here to avoid import.

const BUILTIN_NAME_TO_INDEX: Record<string, number> = {
	sqrt: 0, abs: 1, sin: 2, cos: 3, tan: 4, log: 5,
	ceil: 6, floor: 7, round: 8, min: 9, max: 10,
	asin: 11, acos: 12, atan: 13, atan2: 14,
	sinh: 15, cosh: 16, tanh: 17,
	asinh: 18, acosh: 19, atanh: 20,
	cbrt: 21, clz32: 22, expm1: 23, exp: 24,
	fround: 25, hypot: 26, imul: 27,
	log10: 28, log1p: 29, log2: 30,
	pow: 31, random: 32, sign: 33, trunc: 34,
	degtorad: 35, radtodeg: 36,
};
