import type { Value } from "@solve-js/vm/Value";

/**
 * Handler function for plugin-registered opcodes via CALL_PLUGIN (opcode 50).
 * No longer dispatched directly from the VM switch — plugins register
 * functions in pluginFunctionRegistry instead.
 *
 * @deprecated Use CALL_PLUGIN + pluginFunctionRegistry for plugin functionality.
 *   OpRegistry remains for the VM interface contract only.
 */
export type OpcodeHandler = (vm: VM, opcodes: Uint8Array, ip: number, numbers: Float64Array, strings: string[]) => number;

/** Registration payload for an opcode handler. Binds an OpCode to its handler function with plugin attribution. */
export interface IOpcodeHandlerRegistration {
	opcode: number;
	handler: OpcodeHandler;
	pluginName: string;
}

/** Maximum safe opcode value for Uint8Array storage. */
const MAX_OPCODE = 254;

/** Starting point for dynamic opcode allocation. */
const DYNAMIC_OPCODE_START = 200;

/**
 * Legacy opcode registry — retained for the VM interface contract.
 *
 * Previously dispatched custom opcodes (>= 200) from the VM switch-default
 * branch. Now plugins should use CALL_PLUGIN (opcode 50) via
 * pluginFunctionRegistry instead.
 */
export class OpRegistry {
	private handlers = new Map<number, OpcodeHandler>();
	private nextOpcode = DYNAMIC_OPCODE_START + 1;

	register(registration: IOpcodeHandlerRegistration): void {
		this.handlers.set(registration.opcode, registration.handler);
	}

	/**
	 * Remove a previously registered opcode handler.
	 * Used by package unregistration to reverse shared-registry contributions.
	 */
	unregister(opcode: number): void {
		this.handlers.delete(opcode);
	}

	get(opcode: number): OpcodeHandler | undefined {
		return this.handlers.get(opcode);
	}

	has(opcode: number): boolean {
		return this.handlers.has(opcode);
	}

	/**
	 * Allocate a unique opcode for a plugin's custom bytecode handler.
	 *
	 * Returns the next available opcode (starting at 201). Each call
	 * returns a distinct value. Plugins should call this once during
	 * registration and store the result.
	 *
	 * @throws If the dynamic opcode pool is exhausted.
	 * @returns A unique opcode number for the calling plugin.
	 */
	allocateOpcode(): number {
		if (this.nextOpcode > MAX_OPCODE) {
			throw new Error(
				`OpRegistry: dynamic opcode pool exhausted (max ${MAX_OPCODE - DYNAMIC_OPCODE_START} allocations).`
			);
		}
		return this.nextOpcode++;
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
