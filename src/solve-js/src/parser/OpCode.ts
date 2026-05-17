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
	CALL = 50,
	CALL_BUILTIN = 51,
	RETURN = 52,

	// Variables
	LOAD_VAR = 60,
	STORE_VAR = 61,
	LOAD_PREV = 62,

	// Type conversion
	TO_NUMBER = 70,
	TO_HEX = 71,
	TO_STRING = 72,
	TO_BIGINT = 73,
	TO_PERCENTAGE = 74,

	// UoM
	UOM_CONVERT = 80,
	UOM_CONVERT_TO = 81,
	UOM_GET_VALUE = 82,
	UOM_BEST = 83,

	// Datetime
	DATE_NOW = 90,
	DATE_ADD = 91,
	DATE_SUB = 92,
	DATE_DIFF = 93,

	// Vector
	VEC_ADD = 100,
	VEC_SUB = 101,
	VEC_DOT = 102,
	VEC_CROSS = 103,
	VEC_SCALE = 104,
	VEC_NEW = 105,

	// Dice
	DICE_ROLL = 110,

	// Plugin extensibility
	PLUGIN_CUSTOM = 200,
}

/**
 * Gets the name of an OpCode as a string.
 * @param op The OpCode value
 * @returns The enum name as a string, or "UNKNOWN_<value>" if not found
 */
export function getOpCodeName(op: number): string {
	for (const [key, value] of Object.entries(OpCode)) {
		if (value === op) return key;
	}
	return `UNKNOWN_${op}`;
}
