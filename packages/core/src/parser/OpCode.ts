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

	// Datetime
	DATE_NOW = 90,
	DATE_ADD = 91,
	DATE_SUB = 92,

	// Array (unified Vector/Array type — was VEC_ADD/VEC_SUB/etc.)
	ARR_NEW = 100,
	ARR_ADD = 101,
	ARR_SUB = 102,
	ARR_DOT = 103,
	ARR_CROSS = 104,
	ARR_SCALE = 105,
	ARR_MAGNITUDE = 106,
	ARR_NORMALIZE = 107,

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
