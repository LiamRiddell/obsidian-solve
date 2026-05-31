import { OpCode } from "@solve-js/parser/OpCode";
import { Value } from "@solve-js/vm/Value";

/**
 * Handler function for plugin-registered opcodes.
 * Called from the VM dispatch loop when an opcode >= PLUGIN_CUSTOM is encountered.
 * Returns the new instruction pointer after consuming operands.
 */
export type OpcodeHandler = (vm: VM, opcodes: Uint8Array, ip: number, numbers: Float64Array, strings: string[]) => number;

/** Registration payload for an opcode handler. Binds an OpCode to its handler function with plugin attribution. */
export interface IOpcodeHandlerRegistration {
	opcode: OpCode;
	handler: OpcodeHandler;
	pluginName: string;
}

/**
 * Plugin-extensible opcode registry for the VM.
 *
 * Maps OpCode values → handler functions. Plugin custom opcodes (OpCode >= 200)
 * are registered here and dispatched by the VM's switch-default path.
 */
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

/**
 * VM interface consumed by opcode handlers and the bytecode executor.
 *
 * Provides stack operations, variable access, instruction counting,
 * and abort signal management for async cancellation.
 */
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

/** Shared singleton OpRegistry — used when no custom opcodes are needed. */
export const sharedOpRegistry = new OpRegistry();
