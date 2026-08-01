import { OpCode } from "@solve-js/parser/OpCode";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";

/**
 * `BytecodeProgram.opcodes` is a `Uint8Array` — every operand written into
 * it (including constant-pool indices from {@link BytecodeBuilder.emitNumber}/
 * {@link BytecodeBuilder.emitString}) is truncated to a single byte on
 * `build()`. Exceeding this silently wraps the index (e.g. entry 300 reads
 * back as entry 44), producing a wrong result with no error — see
 * {@link BytecodeBuilder.emitNumber} for the guard that turns this into a
 * thrown error instead.
 */
const MAX_CONSTANT_POOL_INDEX = 255;

/**
 * Compiled bytecode program produced by {@link BytecodeBuilder}.
 * Ready for consumption by {@link executeBytecode} without further processing.
 */
export interface BytecodeProgram {
	opcodes: Uint8Array;
	numbers: Float64Array;
	strings: string[];
	constants?: Map<number, number>;
	/**
	 * Whether the program contains any async opcodes (CALL_PLUGIN, etc.).
	 * Set during compilation by the BytecodeBuilder. Allows the engine
	 * to skip the O(n) resolver preflight check in O(1) for purely
	 * synchronous expressions like `2 + 2`.
	 */
	hasAsync: boolean;
}

/**
 * Direct-to-bytecode compiler for the Pratt parser.
 *
 * Accumulates opcodes, numeric constants, and string references during parsing,
 * then produces a {@link BytecodeProgram} for VM execution. Supports:
 * - Standard build via {@link build}
 * - Zero-copy build into pre-allocated buffers via {@link buildInto}
 * - In-place reset for reuse without reallocation
 */
export class BytecodeBuilder {
	private opcodes: number[] = [];
	private numbers: number[] = [];
	private strings: string[] = [];
	private stringIndex = new Map<string, number>();
	private _hasAsync = false;

	/** Emit an {@link OpCode} instruction. */
	emitOpcode(op: OpCode): void {
		this.opcodes.push(op);
		if (op === OpCode.CALL_PLUGIN) {
			this._hasAsync = true;
		}
	}

	/**
	 * Emit a numeric literal: appends `n` to the program's constant pool and
	 * writes its index into the opcode stream (read back by the VM as e.g.
	 * `PUSH_NUMBER <idx>`).
	 *
	 * Numeric constants are NOT deduplicated (unlike {@link emitString}) —
	 * every call appends a new entry, so an expression with more than
	 * {@link MAX_CONSTANT_POOL_INDEX}+1 distinct numeric-literal occurrences
	 * throws rather than silently wrapping the index (see
	 * `MAX_CONSTANT_POOL_INDEX`'s doc for what that would otherwise do).
	 *
	 * @throws If the constant pool would exceed 256 entries.
	 */
	emitNumber(n: number): void {
		const idx = this.numbers.length;
		if (idx > MAX_CONSTANT_POOL_INDEX) {
			throw ErrorFactory.parsing(
				"TOO_MANY_NUMERIC_CONSTANTS",
				`Expression has more than ${MAX_CONSTANT_POOL_INDEX + 1} numeric literals, exceeding the bytecode constant pool's limit.`,
				{ limit: MAX_CONSTANT_POOL_INDEX + 1 }
			);
		}
		this.numbers.push(n);
		this.opcodes.push(idx);
	}

	/**
	 * Emit a string literal: interns `s` into the program's string pool
	 * (deduplicated via `stringIndex`) and writes its index into the opcode
	 * stream. Subject to the same constant-pool bound as {@link emitNumber},
	 * but since strings ARE deduplicated, only distinct string values count
	 * against the limit.
	 *
	 * @throws If the string pool would exceed 256 distinct entries.
	 */
	emitString(s: string): void {
		let idx = this.stringIndex.get(s);
		if (idx === undefined) {
			idx = this.strings.length;
			if (idx > MAX_CONSTANT_POOL_INDEX) {
				throw ErrorFactory.parsing(
					"TOO_MANY_STRING_CONSTANTS",
					`Expression has more than ${MAX_CONSTANT_POOL_INDEX + 1} distinct string literals, exceeding the bytecode constant pool's limit.`,
					{ limit: MAX_CONSTANT_POOL_INDEX + 1 }
				);
			}
			this.strings.push(s);
			this.stringIndex.set(s, idx);
		}
		this.opcodes.push(idx);
	}

	/**
	 * Emit a raw numeric operand (0-255) following an opcode — e.g. a
	 * plugin-function index for `CALL_PLUGIN`, or an argument count. Unlike
	 * {@link emitOpcode}, this does not go through the `OpCode` enum, so
	 * package authors use this (not an unsafe cast to `OpCode`) to push
	 * operands their own opcode handler expects to read positionally.
	 */
	emitIndex(idx: number): void {
		this.opcodes.push(idx);
	}

	/** Emit a raw byte (0-255) — used for fixed small operands like argument counts. */
	emitByte(b: number): void {
		this.opcodes.push(b);
	}

	/** Number of opcodes/operands emitted so far — used to compute jump targets before {@link patchJump}. */
	get currentLength(): number {
		return this.opcodes.length;
	}

	/** Overwrite a previously-emitted placeholder operand at `position` with the real jump `target`, once known. */
	patchJump(position: number, target: number): void {
		this.opcodes[position] = target;
	}

	/**
	 * Build the accumulated opcodes/numbers/strings into a BytecodeProgram.
	 * Creates new TypedArrays — the builder can be reused after this call.
	 */
	build(): BytecodeProgram {
		return {
			opcodes: new Uint8Array(this.opcodes),
			numbers: new Float64Array(this.numbers),
			// Defensive copy: .length = 0 in reset() would clear a shared reference.
			// Strings are rare (only UoM/datetime parselets emit them), so the copy
			// cost is negligible.
			strings: [...this.strings],
			constants: new Map(),
			hasAsync: this._hasAsync,
		};
	}

	/**
	 * Build directly into a pre-allocated buffer for zero-copy VM consumption.
	 *
	 * When `buf` is provided and large enough, writes into it and returns
	 * subarray **views** (not copies) — the returned TypedArrays share the
	 * buffer's underlying ArrayBuffer. The caller MUST NOT mutate the buffer
	 * until the returned BytecodeProgram is no longer needed.
	 *
	 * If the caller intends to cache the result, they must copy the TypedArrays
	 * (e.g. `new Uint8Array(program.opcodes)`) before reusing the buffer pool.
	 *
	 * When `buf` is omitted or too small, allocates fresh TypedArrays.
	 */
	buildInto(buf?: { opcodes: Uint8Array; numbers: Float64Array }): BytecodeProgram {
		const opLen = this.opcodes.length;
		const numLen = this.numbers.length;

		const reuseOpcodes = buf && buf.opcodes.length >= opLen;
		const reuseNumbers = buf && buf.numbers.length >= numLen;

		// Subarray views that share the buffer's ArrayBuffer (zero-copy)
		const opcodes = reuseOpcodes
			? new Uint8Array(buf!.opcodes.buffer, buf!.opcodes.byteOffset, opLen)
			: new Uint8Array(opLen);
		const numbers = reuseNumbers
			? new Float64Array(buf!.numbers.buffer, buf!.numbers.byteOffset, numLen)
			: new Float64Array(numLen);

		// Write data into the views
		for (let i = 0; i < opLen; i++) opcodes[i] = this.opcodes[i];
		for (let i = 0; i < numLen; i++) numbers[i] = this.numbers[i];

		return {
			opcodes,
			numbers,
			strings: [...this.strings],
			constants: new Map(),
			hasAsync: this._hasAsync,
		};
	}

	reset(): void {
		// Retain backing stores with .length = 0 to avoid reallocation on growth.
		// = [] discards the ArrayBuffer, forcing V8 to reallocate on every push()
		// threshold (4→8→16→32...). For a 50-opcode expression, that's 3-4 copies.
		this.opcodes.length = 0;
		this.numbers.length = 0;
		this.strings.length = 0;
		this.stringIndex.clear();
		this._hasAsync = false;
	}
}
