/**
 * The VM's bytecode instruction set.
 *
 * Emitted by parselets (via {@link BytecodeBuilder}) during parsing and
 * consumed by the VM's dispatch loop during execution. Values are grouped
 * into numeric bands by category (0-9 stack ops, 10-19 push-literal, 20-29
 * arithmetic, ...) purely for readability — the VM dispatches on the exact
 * numeric value, not the band.
 *
 * Third-party packages emit `CALL_PLUGIN` (with a plugin-function index
 * from {@link allocatePluginFunctionIndex}) to invoke their own logic —
 * see `IEnginePackage.pluginFunctions`. The other opcodes are used
 * internally by the built-in packages' parselets.
 */
export enum OpCode {
	// Stack operations
	NOP = 0,
	HALT = 1,
	SWAP = 2,
	DUP = 3,

	// Push literals
	PUSH_NUMBER = 10,
	PUSH_BIGINT = 11,
	PUSH_HEX = 12,
	PUSH_STRING = 13,
	PUSH_BOOLEAN = 14,
	PUSH_VARIABLE = 15,

	// Arithmetic (BinaryOperator)
	ADD = 20,
	SUB = 21,
	MUL = 22,
	DIV = 23,
	MOD = 24,
	EXP = 25,
	NEG = 26,
	POS = 27,

	// Bitwise
	LSHIFT = 30,
	RSHIFT = 31,
	URSHIFT = 32,
	BIT_AND = 33,
	BIT_OR = 34,
	BIT_XOR = 35,
	BIT_NOT = 36,

	// Comparison
	EQ = 40,
	NEQ = 41,
	LT = 42,
	LTE = 43,
	GT = 44,
	GTE = 45,

	// Functions
	CALL_PLUGIN = 50,     // Plugin-registered functions (may be async — pre-resolved by orchestrator)
	CALL_BUILTIN = 51,    // Sync built-in functions (sqrt, sin, diceRoll, matmul)
	RETURN = 52,          // Reserved for future user-defined functions

	// Variables
	LOAD_VAR = 60,
	STORE_VAR = 61,
	LOAD_GLOBAL_VAR = 62,   // Reads from the process-wide GlobalVariableStore, not the VM's local scope
	STORE_GLOBAL_VAR = 63,  // Writes to the process-wide GlobalVariableStore, visible to every document

	// Type conversion
	TO_NUMBER = 70,
	TO_HEX = 71,
	TO_PERCENTAGE = 74,

	// UoM
	UOM_CONVERT = 80,
	UOM_CONVERT_TO = 81,
	UOM_GET_VALUE = 82,
	UOM_BEST = 83,
	UOM_CONVERT_IN = 84,
	UOM_POSSIBILITIES = 85,  // "sourceUnit to ?" — list units convertible from sourceUnit

	// Datetime
	DATE_NOW = 90,
	DATE_ADD = 91,
	DATE_SUB = 92,
	DATE_NEXT_WEEKDAY = 93,  // "next <Weekday>" — the next occurrence strictly after now
	DATE_LAST_WEEKDAY = 94,  // "last <Weekday>" — the previous occurrence strictly before now
	DATE_LITERAL = 95,       // Push a datetime literal whose epoch-ms was already resolved at parse time (see DateLiteralParselet)

	// Rate — "quantity per unit of something" ($99/week, 30 fps). See
	// vm/Value.ts's rateValue()/isRateUnit()/splitRateUnit() for the
	// representation these opcodes operate on.
	RATE_DIV = 110,      // Uom ÷ Uom (different measures) -> Rate — the construction op
	RATE_MUL = 111,      // Rate × Uom (same measure as denominator) -> plain Uom (denominator cancels)
	RATE_CONVERT = 112,  // Rate -> Rate with a rescaled denominator unit (keeps the same real-world rate)

	// Time — clock-time-of-day, lap times, video timecode (distinct from
	// the Datetime band's calendar-date arithmetic).
	CLOCK_TIME_TODAY = 120,  // minutes-since-midnight -> Datetime anchored to today's calendar date

	// Conditionals — boolean logic and eager-evaluated ternary selection.
	// EQ/NEQ/LT/LTE/GT/GTE (40-45, above) already existed as dead opcodes
	// before this band was wired up; see vm/VM.ts for their handlers.
	LOGICAL_AND = 130,  // Boolean && Boolean -> Boolean
	LOGICAL_OR = 131,   // Boolean || Boolean -> Boolean
	SELECT = 132,       // (thenVal, elseVal, condition) -> thenVal if condition else elseVal — EAGER (both
	                    // branches already evaluated by the time this runs; no real branching/short-circuit,
	                    // a deliberate simplification for a side-effect-free expression language, see
	                    // packages/conditionals/parselets/IfThenElseParselet.ts)

	// Converters — the general "as <type>" mechanism. TO_NUMBER/TO_HEX/
	// TO_PERCENTAGE (70/71/74, above) cover the simplest cases; these cover
	// the ones with no existing opcode. CALL_AS_CONVERTER is the SDK
	// extension point — see IEnginePackage.asConverters and
	// vm/VMBuiltins.ts's asConverterRegistry.
	TO_FRACTION = 140,       // Number -> String, simplified fraction ("0.5" -> "1/2")
	TO_MULTIPLIER = 141,     // Number -> String, "1 + n" growth multiplier ("0.5" -> "1.5x")
	TO_SCI = 142,            // Number -> String, scientific notation ("1500000" -> "1.5e+6")
	TO_BINARY = 143,         // Number -> String, base-2 display ("10" -> "0b1010")
	TO_OCTAL = 144,          // Number -> String, base-8 display ("10" -> "0o12")
	CALL_AS_CONVERTER = 145, // (value, name) -> runtime asConverterRegistry lookup + call

	// User-defined, parameterized, reusable functions (f(x) = expr, then
	// f(5) — see parser/PrecedenceParser.ts's IDENT_ID case,
	// parser/BytecodeBuilder.ts's UserFunctionDef/emitUserFunctionBody, and
	// vm/VM.ts's VM.userFunctions/callFrames). Parameter references inside a
	// function body are ORDINARY LOAD_VAR opcodes, not a dedicated
	// parameter-load opcode — CALL_USER_FUNCTION binds arguments into a
	// name-keyed call frame at runtime, and LOAD_VAR checks the innermost
	// call frame before the flat variable store (see VM.getVar()).
	DEFINE_USER_FUNCTION = 150, // (operand = index into bytecode.userFunctionBodies) -> register name/params/program into vm.userFunctions. Registration happens at VM-EXECUTION time, not parse time, so a diagnostic/lookahead parse that compiles but never executes a definition line has no side effect on the shared registry.
	CALL_USER_FUNCTION = 151,   // (N arg values already on stack) -> pop N args, bind by NAME into a new call frame, execute the named function's stored body (reentrant executeBytecode), push its result

	// Matrix (Calca-parity — replaces the old ARR_* vector-only opcodes,
	// which were never emitted by any registered parselet; see
	// vm/MatrixOps.ts for the shared column-major storage helpers this band
	// operates on, and vm/Value.ts's MatrixData for the representation).
	MAT_NEW = 152,      // (rows, cols operands; rows*cols values already on stack, ROW-MAJOR push order) -> pop rows*cols values, transpose to column-major, push a Matrix
	MAT_INDEX1 = 153,   // (matrix, index already on stack) -> column-major single-index read `a[i]`
	MAT_INDEX2 = 154,   // (matrix, row, col already on stack) -> `a[row, col]` read
	MAT_SLICE = 155,    // (matrix, rowRange, colRange already on stack) -> sub-matrix via two Range values
	RANGE_NEW = 156,    // (min, max already on stack) -> push a Range value `min:max`
	MAP_INVOKE = 157,   // map(...) — see parser/BytecodeBuilder.ts's `anonymousBodies` side-table
	REDUCE_INVOKE = 158, // reduce(...) — same anonymousBodies mechanism as MAP_INVOKE
	THEREFORE_SOLVE = 159, // `=>` — symbolic-algebra solve/simplify operator
	STORE_EQUATION_OR_ASSIGNMENT = 160, // bare (colon-less) `lhs = rhs` — ordinary assignment if concrete, a stored symbolic equation otherwise

}

// Reverse lookup built once at module load — getOpCodeName() is called once
// per VM instruction whenever a diagnostic collector is attached (VM.ts's
// trace path), so a per-call linear scan of every enum entry (TS numeric
// enums are bidirectional at runtime, so Object.entries(OpCode) yields both
// "NOP" -> 0 and "0" -> "NOP" style entries) would otherwise redo the same
// scan every single traced instruction. Only the numeric-valued entries are
// kept — the string-valued reverse entries TS also generates aren't needed
// here.
const OP_CODE_NAMES: ReadonlyMap<number, string> = (() => {
	const map = new Map<number, string>();
	for (const [key, value] of Object.entries(OpCode)) {
		if (typeof value === "number") map.set(value, key);
	}
	return map;
})();

/**
 * Gets the name of an OpCode as a string.
 * @param op The OpCode value
 * @returns The enum name as a string, or "UNKNOWN_<value>" if not found
 */
export function getOpCodeName(op: number): string {
	return OP_CODE_NAMES.get(op) ?? `UNKNOWN_${op}`;
}
