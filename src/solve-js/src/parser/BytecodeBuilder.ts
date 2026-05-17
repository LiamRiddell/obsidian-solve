import { OpCode } from "@solve-js/parser/OpCode";

export interface BytecodeProgram {
	opcodes: number[];
	numbers: number[];
	strings: string[];
	constants: Map<number, number>;
	// Cached TypedArray views — set by ExpressionEngine on first use
	cachedUint8?: Uint8Array;
	cachedFloat64?: Float64Array;
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
			strings: [...this.strings],
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
