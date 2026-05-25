import { OpCode } from "@solve-js/parser/OpCode";

export interface BytecodeProgram {
	opcodes: Uint8Array;
	numbers: Float64Array;
	strings: string[];
	constants?: Map<number, number>;
}

export class BytecodeBuilder {
	private opcodes: number[] = [];
	private numbers: number[] = [];
	private strings: string[] = [];
	private stringIndex = new Map<string, number>();

	emitOpcode(op: OpCode): void {
		this.opcodes.push(op);
	}

	emitNumber(n: number): void {
		const idx = this.numbers.length;
		this.numbers.push(n);
		this.opcodes.push(idx);
	}

	emitString(s: string): void {
		let idx = this.stringIndex.get(s);
		if (idx === undefined) {
			idx = this.strings.length;
			this.strings.push(s);
			this.stringIndex.set(s, idx);
		}
		this.opcodes.push(idx);
	}

	emitIndex(idx: number): void {
		this.opcodes.push(idx);
	}

	emitByte(b: number): void {
		this.opcodes.push(b);
	}

	get currentLength(): number {
		return this.opcodes.length;
	}

	patchJump(position: number, target: number): void {
		this.opcodes[position] = target;
	}

	build(): BytecodeProgram {
		return {
			opcodes: new Uint8Array(this.opcodes),
			numbers: new Float64Array(this.numbers),
			strings: this.strings,
			constants: new Map(),
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
			strings: this.strings,
			constants: new Map(),
		};
	}

	reset(): void {
		this.opcodes = [];
		this.numbers = [];
		this.strings = [];
		this.stringIndex.clear();
	}
}
