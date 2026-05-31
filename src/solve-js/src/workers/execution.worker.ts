/**
 * Execution worker — offloads VM bytecode execution to a background thread.
 *
 * Receives batches of pre-compiled bytecode, executes each via a worker-local
 * VM, and returns serialized results (Value type + numeric value + unit).
 *
 * Used by AsyncResolutionBatcher when flush() has >50 affected lines.
 * Reuses the same Transferable ArrayBuffer pattern as compilation.worker.ts:
 * bytecode opcodes/numbers buffers are transferred (zero-copy) into the worker
 * and detached on the main-thread side.
 *
 * Message protocol:
 *   Main → Worker:
 *     { type: "EXECUTE_BATCH", id: number, items: ExecuteItem[] }
 *     { type: "TERMINATE", id: number }
 *
 *   Worker → Main:
 *     { id: number, type: "EXECUTE_RESULT", results: ExecuteResult[] }
 *
 * Transferable objects:
 *   Each ExecuteItem carries `opcodesBuffer` and `numbersBuffer` as detached
 *   ArrayBuffers — the owning thread transfers these without copying.
 */

import type { Bytecode } from "../vm/VM";
import { createVM, executeBytecode } from "../vm/VM";
import { sharedOpRegistry } from "../vm/OpRegistry";
import { ValueType } from "../vm/Value";

// ── Message types ─────────────────────────────────────────────────────────

interface ExecuteItem {
	/** Line number (1-based) for correlation. */
	lineNumber: number;
	/** Transferred ArrayBuffer for opcodes. Detached on main-thread side. */
	opcodesBuffer: ArrayBuffer;
	/** Transferred ArrayBuffer for numbers. Detached on main-thread side. */
	numbersBuffer: ArrayBuffer;
	/** Number of Uint8 elements in opcodesBuffer. */
	opcodesLength: number;
	/** Number of Float64 elements in numbersBuffer. */
	numbersLength: number;
	/** String constants pool (structured-cloned). */
	strings: string[];
}

interface ExecuteBatchMsg {
	type: "EXECUTE_BATCH";
	id: number;
	items: ExecuteItem[];
}

interface TerminateMsg {
	type: "TERMINATE";
	id: number;
}

type ExecutionWorkerMessage = ExecuteBatchMsg | TerminateMsg;

// ── Result type (sent back to main thread) ────────────────────────────────

interface ExecuteResult {
	/** Line number from the request (for correlation). */
	lineNumber: number;
	/** ValueType enum value for reconstructing the Value. */
	valueType: ValueType;
	/** Numeric value (or 0 for non-numeric results). */
	value: number;
	/** Unit string for UoM values, or undefined. */
	unit?: string;
	/** Whether the execution returned a pending result. */
	isPending: boolean;
	/** If isPending, the queryKey for async resolution. */
	queryKey?: string;
}

// ── Worker body ───────────────────────────────────────────────────────────

// This file is transformed by esbuild-plugin-inline-worker into a factory
// that returns Worker.
export default (() => {
	throw new Error("execution.worker.ts must be processed by esbuild-plugin-inline-worker");
}) as unknown as () => Worker;

let vm: ReturnType<typeof createVM> | null = null;

function getVM(): ReturnType<typeof createVM> {
	if (!vm) {
		vm = createVM(sharedOpRegistry, 200, 50000);
	}
	return vm;
}

/**
 * Execute a single bytecode program and produce a serialized ExecuteResult.
 *
 * Reconstructs TypedArrays from the transferred ArrayBuffers (zero-copy on
 * the worker side — the buffers were already detached on the main thread).
 * After execution, the worker VM is reset for the next line.
 *
 * For pending results (async), returns isPending=true with the queryKey
 * so the main thread can handle the async resolution. The worker cannot
 * await Promises — it has no access to the engine's resolver registry.
 */
function executeOne(item: ExecuteItem): ExecuteResult {
	const vmm = getVM();
	vmm.reset();

	const opcodes = new Uint8Array(item.opcodesBuffer, 0, item.opcodesLength);
	const numbers = new Float64Array(item.numbersBuffer, 0, item.numbersLength);
	const bytecode: Bytecode = { opcodes, numbers, strings: item.strings };

	try {
		const result = executeBytecode(bytecode, vmm);

		if (result.type === "pending") {
			return {
				lineNumber: item.lineNumber,
				valueType: ValueType.Pending,
				value: 0,
				isPending: true,
				queryKey: result.queryKey,
			};
		}

		const val = result.value;
		return {
			lineNumber: item.lineNumber,
			valueType: val.type,
			value: typeof val.value === "number"
				? val.value
				: typeof val.value === "bigint"
					? Number(val.value)
					: 0,
			unit: val.unit,
			isPending: false,
		};
	} catch {
		// Execution error — return error-type value so main thread can
		// propagate through DAG as errorValue.
		return {
			lineNumber: item.lineNumber,
			valueType: ValueType.Error,
			value: 0,
			isPending: false,
			unit: "Worker execution failed",
		};
	}
}

// ── Message handler ───────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent) => {
	const msg = event.data as ExecutionWorkerMessage;

	switch (msg.type) {
		case "EXECUTE_BATCH": {
			const results: ExecuteResult[] = [];

			for (const item of msg.items) {
				results.push(executeOne(item));
			}

			// No transferables needed for the response — results are plain
			// objects with numbers and strings (structured-cloned).
			(self as unknown as Worker).postMessage({
				id: msg.id,
				type: "EXECUTE_RESULT",
				results,
			});
			break;
		}

		case "TERMINATE": {
			if (vm) {
				vm.reset();
				vm = null;
			}
			(self as unknown as Worker).postMessage({
				id: msg.id,
				type: "EXECUTE_RESULT",
				results: [],
			});
			break;
		}

		default: {
			(self as unknown as Worker).postMessage({
				id: -1,
				type: "EXECUTE_RESULT",
				results: [],
			});
		}
	}
};
