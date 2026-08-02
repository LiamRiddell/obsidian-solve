import type { Value } from "@solve-js/vm/Value";
import type { BytecodeProgram, UserFunctionDef } from "@solve-js/parser/BytecodeBuilder";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";

/**
 * A stored bare (colon-less) equation of the shape `factor1*factor2*...*
 * variable = rhs` (e.g. `a*x = [60;70]`, or `s*t*v = [vx;vy;1]`) —
 * registered when that line is EXECUTED (mirroring `UserFunctionDef`'s own
 * execution-time registration, not parse-time), and consulted when
 * `<variable> =>` is later evaluated. Solving is `variable =
 * inv(factor1*factor2*...) * rhs` (`vm/VM.ts`'s THEREFORE-handling code,
 * `vm/MatrixOps.ts`'s `matrixMultiply()`/`inverse()` — both symbolic-aware,
 * so a factor whose OWN cells are still-unassigned free variables, e.g.
 * `s = [sx,0,0;...]`, solves correctly too).
 *
 * `factorNames` are looked up via `vm.getVar()` at solve time (ordinary,
 * ALREADY-evaluated Matrix values — ordinary ("bare") assignment always
 * evaluates its RHS eagerly, even when that RHS itself contains
 * unassigned names, via symbolic-tolerant evaluation, so by solve time
 * each factor is already a genuine, possibly-partially-symbolic Matrix
 * Value sitting in the variable store) — NOT re-compiled bytecode, since
 * this pattern only ever allows bare identifiers as factors (see
 * `ExpressionEngine.ts`'s own equation-detection doc comment for why this
 * stays a narrow, disclosed pattern rather than a general expression).
 * `rhsProgram` IS a real compiled program (the right-hand side can be an
 * arbitrary expression, e.g. `[vx;vy;1]`), evaluated in symbolic-tolerant
 * mode at solve time.
 */
export interface EquationDef {
	variable: string;
	factorNames: string[];
	rhsProgram: BytecodeProgram;
}

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
			throw ErrorFactory.config(
				"OPCODE_POOL_EXHAUSTED",
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
	/**
	 * Read a variable by name — checks the INNERMOST active user-defined-
	 * function call frame first (see `pushCallFrame`), then falls back to
	 * the flat, session-scoped variable store. This is why a function
	 * parameter needs no dedicated load opcode: an ordinary `LOAD_VAR
	 * "x"` inside a function body resolves to the current call's bound
	 * argument automatically, without the parser needing to know it's
	 * compiling a function body at all.
	 */
	getVar(key: string): Value | undefined;
	setVar(key: string, value: Value): void;
	/**
	 * User-defined-function call frame — a name-keyed `Map` of this call's
	 * bound arguments, PUSHED before `CALL_USER_FUNCTION` executes the
	 * callee's body and POPPED immediately after (even if the body throws),
	 * so nested/recursive calls (`double(double(5))`) each get their own
	 * frame instead of clobbering a shared flat map — see `vm/VM.ts`'s
	 * `CALL_USER_FUNCTION` case. Deliberately NOT the same store as
	 * `setVar`'s flat `:name` variables — a call frame is call-scoped and
	 * stacked (only the INNERMOST frame is ever consulted by `getVar`, see
	 * its own doc comment — no lexical capture of an outer call's
	 * parameters), a variable is session-scoped and flat.
	 *
	 * @throws `FUNCTION_RECURSION_LIMIT_EXCEEDED` if pushing would exceed
	 *   the VM's configured `maxFunctionRecursionDepth` — the backstop for
	 *   `f(x) = f(x)`, which would otherwise recurse via nested
	 *   `executeBytecode()` calls until the native V8 stack overflows
	 *   uncatchably (each reentrant call gets its OWN fresh
	 *   `localInstructionCount`, so `maxInstructions` cannot catch this).
	 */
	pushCallFrame(frame: Map<string, Value>): void;
	popCallFrame(): void;
	/** Register (or redefine — overwrites any previous definition, matching `:name = value`'s own reassignment semantics) a user-defined function. */
	defineUserFunction(name: string, params: string[], program: BytecodeProgram): void;
	getUserFunction(name: string): UserFunctionDef | undefined;
	hasUserFunction(name: string): boolean;
	/** Register (or redefine) a bare equation (`a*x = rhs`), keyed by its free variable — see {@link EquationDef}. */
	defineEquation(variable: string, factorNames: string[], rhsProgram: BytecodeProgram): void;
	getEquation(variable: string): EquationDef | undefined;
	hasEquation(variable: string): boolean;
	reset(): void;
	getMaxInstructions(): number;
	getMaxStackDepth(): number;
	getInstructionCount(): number;
	incrementInstructions(n: number): void;
	/** Active AbortSignal for the current expression evaluation. Checked before cache writes. */
	activeSignal?: AbortSignal;
	/** Abort the current evaluation (called when expression changes before resolution). */
	abortCurrent?: () => void;
}

/** Shared singleton OpRegistry — used when no custom opcodes are needed. */
export const sharedOpRegistry = new OpRegistry();
