import { OpCode } from "@solve-js/parser/OpCode";

export interface BytecodeProgram {
	opcodes: Uint8Array | number[];
	numbers: Float64Array | number[];
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
			opcodes: [...this.opcodes],
			numbers: [...this.numbers],
			strings: this.strings,
			constants: new Map(),
		};
	}

	/**
	 * Build directly into typed arrays for zero-copy VM consumption.
	 * Reuses the provided buffers if they are large enough, otherwise allocates.
	 */
	buildInto(buf?: { opcodes: Uint8Array; numbers: Float64Array }): BytecodeProgram {
		const opLen = this.opcodes.length;
		const numLen = this.numbers.length;
		const opcodes = buf && buf.opcodes.length >= opLen
			? buf.opcodes.subarray(0, opLen)
			: new Uint8Array(opLen);
		const numbers = buf && buf.numbers.length >= numLen
			? buf.numbers.subarray(0, numLen)
			: new Float64Array(numLen);

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
