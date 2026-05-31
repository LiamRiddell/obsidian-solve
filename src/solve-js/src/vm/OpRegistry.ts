import { OpCode } from "@solve-js/parser/OpCode";
import { Value } from "@solve-js/vm/Value";

export type OpcodeHandler = (vm: VM, opcodes: Uint8Array, ip: number, numbers: Float64Array, strings: string[]) => number;

export interface IOpcodeHandlerRegistration {
	opcode: OpCode;
	handler: OpcodeHandler;
	pluginName: string;
}

export class OpRegistry {
	private handlers = new Map<OpCode, OpcodeHandler>();

	register(registration: IOpcodeHandlerRegistration): void {
		this.handlers.set(registration.opcode, registration.handler);
	}

	get(opcode: OpCode): OpcodeHandler | undefined {
		return this.handlers.get(opcode);
	}

	has(opcode: OpCode): boolean {
		return this.handlers.has(opcode);
	}
}

export interface VM {
	push(value: Value): void;
	pop(): Value;
	popNumber(): number;
	popString(): string;
	peek(): Value;
	getStack(): Value[];
	registry: OpRegistry;
	getVar(key: string): Value | undefined;
	setVar(key: string, value: Value): void;
	reset(): void;
	getMaxInstructions(): number;
	getInstructionCount(): number;
	incrementInstructions(n: number): void;
	/** Active AbortSignal for the current expression evaluation. Checked before cache writes. */
	activeSignal?: AbortSignal;
	/** Abort the current evaluation (called when expression changes before resolution). */
	abortCurrent?: () => void;
}

export const sharedOpRegistry = new OpRegistry();
