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

/** Maximum safe opcode value for Uint8Array storage. */
const MAX_OPCODE = 254;

/**
 * Plugin-extensible opcode registry for the VM.
 *
 * Maps OpCode values → handler functions. Plugin custom opcodes (OpCode >= 200)
 * are registered here and dispatched by the VM's switch-default path.
 *
 * ## Dynamic opcode allocation
 *
 * Call {@link allocateOpcode} to get a unique opcode for your plugin.
 * Allocations start at `PLUGIN_CUSTOM + 1` (201) and increment per call.
 * The legacy `PLUGIN_CUSTOM` (200) remains as a shared fallback slot.
 *
 * Max 54 dynamic opcodes (201–254) — the Uint8Array bytecode format
 * caps all opcodes at 255.
 */
export class OpRegistry {
	private handlers = new Map<OpCode, OpcodeHandler>();
	private nextOpcode = OpCode.PLUGIN_CUSTOM + 1;

	register(registration: IOpcodeHandlerRegistration): void {
		this.handlers.set(registration.opcode, registration.handler);
	}

	get(opcode: OpCode): OpcodeHandler | undefined {
		return this.handlers.get(opcode);
	}

	has(opcode: OpCode): boolean {
		return this.handlers.has(opcode);
	}

	/**
	 * Allocate a unique opcode for a plugin's custom bytecode handler.
	 *
	 * Returns the next available opcode (starting at 201). Each call
	 * returns a distinct value. Plugins should call this once during
	 * registration and store the result.
	 *
	 * @throws If the dynamic opcode pool is exhausted (>254 allocations).
	 * @returns A unique OpCode for the calling plugin.
	 */
	allocateOpcode(): OpCode {
		if (this.nextOpcode > MAX_OPCODE) {
			throw new Error(
				`OpRegistry: dynamic opcode pool exhausted (max ${MAX_OPCODE - OpCode.PLUGIN_CUSTOM} allocations). ` +
				`Consider using PLUGIN_CUSTOM (200) as a shared fallback.`
			);
		}
		return this.nextOpcode++ as OpCode;
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
