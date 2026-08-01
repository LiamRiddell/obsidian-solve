/**
 * Engine worker — offloads both compilation and VM execution to a
 * background thread (plan L6: worker consolidation).
 *
 * Previously two separate worker files (compilation.worker.ts,
 * execution.worker.ts) duplicated the Transferable ArrayBuffer protocol,
 * postMessage/onmessage boilerplate, and lazy-init pattern. This file
 * merges them behind a single `self.onmessage` dispatching on `msg.type` —
 * the message shapes are UNCHANGED from the two original files, so
 * CompilationWorkerManager and ExecutionPool (the main-thread consumers)
 * require no changes beyond importing this file's factory.
 *
 * Each Worker instance created from this file is used exclusively by ONE
 * consumer (a CompilationWorkerManager sends only COMPILE_BATCH; an
 * ExecutionPool sends only EXECUTE_BATCH) — the module-level `engine` and
 * `vm` singletons below are independent lazy state, so there is no
 * cross-contamination between the two roles even though they share code.
 *
 * Message protocol:
 *   Main → Worker:
 *     { type: "COMPILE_BATCH", id, items: CompileItem[] }
 *     { type: "EXECUTE_BATCH", id, items: ExecuteItem[] }
 *     { type: "TERMINATE", id }
 *
 *   Worker → Main:
 *     { id, type: "COMPILE_RESULT", results: CompileResult[] }
 *     { id, type: "EXECUTE_RESULT", results: ExecuteResult[] }
 *
 * Transferable objects: bytecode opcodes/numbers buffers are transferred
 * (zero-copy) in both directions, same pattern as the original files.
 */

import { ExpressionEngine } from "../engine/ExpressionEngine";
import type { Bytecode } from "../vm/VM";
import { createVM, executeBytecode } from "../vm/VM";
import { sharedOpRegistry } from "../vm/OpRegistry";
import { ValueType } from "../vm/Value";

// ── Compile message types ──────────────────────────────────────────────

interface CompileItem {
	lineId: number;
	expression: string;
	textHash: number;
}

interface CompileBatchMsg {
	type: "COMPILE_BATCH";
	id: number;
	items: CompileItem[];
}

interface CompileResult {
	lineId: number;
	expression: string;
	compiledAgainstHash: number;
	opcodesBuffer: ArrayBuffer;
	numbersBuffer: ArrayBuffer;
	opcodesLength: number;
	numbersLength: number;
	strings: string[];
	reads: string[];
	writes: string[];
	isVariableDef: boolean;
	error: string | null;
}

// ── Execute message types ──────────────────────────────────────────────

interface ExecuteItem {
	lineNumber: number;
	opcodesBuffer: ArrayBuffer;
	numbersBuffer: ArrayBuffer;
	opcodesLength: number;
	numbersLength: number;
	strings: string[];
}

interface ExecuteBatchMsg {
	type: "EXECUTE_BATCH";
	id: number;
	items: ExecuteItem[];
}

interface ExecuteResult {
	lineNumber: number;
	valueType: ValueType;
	value: number;
	unit?: string;
	isPending: boolean;
	queryKey?: string;
}

interface TerminateMsg {
	type: "TERMINATE";
	id: number;
}

type EngineWorkerMessage = CompileBatchMsg | ExecuteBatchMsg | TerminateMsg;

// ── Worker body ───────────────────────────────────────────────────────

// This file is transformed by esbuild-plugin-inline-worker into a factory
// that returns Worker. If you see this error, the plugin isn't configured.
export default (() => {
	throw new Error("engine.worker.ts must be processed by esbuild-plugin-inline-worker");
}) as unknown as () => Worker;

// ── Lazy per-role state — independent, only the used one is created ────

let compileEngine: ExpressionEngine | null = null;
function getCompileEngine(): ExpressionEngine {
	if (!compileEngine) {
		compileEngine = new ExpressionEngine("en", false);
	}
	return compileEngine;
}

let executeVm: ReturnType<typeof createVM> | null = null;
function getExecuteVm(): ReturnType<typeof createVM> {
	if (!executeVm) {
		executeVm = createVM(sharedOpRegistry, 200, 50000);
	}
	return executeVm;
}

// ── Compile ──────────────────────────────────────────────────────────

/**
 * Compile a single expression and produce a transfer-ready CompileResult.
 * Extracts ArrayBuffers from the compiled TypedArrays so they can be
 * transferred via postMessage — after this call, the original TypedArrays
 * are detached on the worker side.
 */
function compileOne(item: CompileItem): CompileResult {
	const base: Omit<CompileResult, "opcodesBuffer" | "numbersBuffer" | "opcodesLength" | "numbersLength"> = {
		lineId: item.lineId,
		expression: item.expression,
		compiledAgainstHash: item.textHash,
		strings: [],
		reads: [],
		writes: [],
		isVariableDef: false,
		error: null,
	};

	try {
		const eng = getCompileEngine();
		const { program, reads, writes } = eng.compileExpression(item.expression);
		const isVariableDef = writes.length > 0;

		const opcodes = program.opcodes;
		const numbers = program.numbers;

		// Transfer only the exact used slice of the ArrayBuffer. The engine's
		// buffer pool is write-only, so detaching the source view is fine.
		const opcodesBuffer = opcodes.buffer.slice(
			opcodes.byteOffset,
			opcodes.byteOffset + opcodes.byteLength
		);
		const numbersBuffer = numbers.buffer.slice(
			numbers.byteOffset,
			numbers.byteOffset + numbers.byteLength
		);

		return {
			...base,
			opcodesBuffer,
			numbersBuffer,
			opcodesLength: opcodes.length,
			numbersLength: numbers.length,
			strings: [...program.strings],
			reads,
			writes,
			isVariableDef,
		};
	} catch (e) {
		return {
			...base,
			opcodesBuffer: new ArrayBuffer(0),
			numbersBuffer: new ArrayBuffer(0),
			opcodesLength: 0,
			numbersLength: 0,
			error: e instanceof Error ? e.message : String(e),
		};
	}
}

function handleCompileBatch(msg: CompileBatchMsg): void {
	const results: CompileResult[] = [];
	const transferList: ArrayBuffer[] = [];

	for (const item of msg.items) {
		const result = compileOne(item);
		results.push(result);
		if (result.opcodesBuffer.byteLength > 0) transferList.push(result.opcodesBuffer);
		if (result.numbersBuffer.byteLength > 0) transferList.push(result.numbersBuffer);
	}

	(self as unknown as Worker).postMessage(
		{ id: msg.id, type: "COMPILE_RESULT", results },
		transferList
	);
}

// ── Execute ──────────────────────────────────────────────────────────

/**
 * Execute a single bytecode program and produce a serialized ExecuteResult.
 * Reconstructs TypedArrays from the transferred ArrayBuffers (zero-copy).
 * Resets the worker VM before each execution — no state carries over
 * between lines in a batch.
 */
function executeOne(item: ExecuteItem): ExecuteResult {
	const vmm = getExecuteVm();
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

		if (result.type === "error") {
			return {
				lineNumber: item.lineNumber,
				valueType: ValueType.Error,
				value: 0,
				isPending: false,
				unit: result.error.message,
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

function handleExecuteBatch(msg: ExecuteBatchMsg): void {
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
}

// ── Message handler ───────────────────────────────────────────────────

self.onmessage = (event: MessageEvent) => {
	const msg = event.data as EngineWorkerMessage;

	switch (msg.type) {
		case "COMPILE_BATCH":
			handleCompileBatch(msg);
			break;

		case "EXECUTE_BATCH":
			handleExecuteBatch(msg);
			break;

		case "TERMINATE": {
			// Not sent by either production manager today — both call the
			// native Worker.terminate() directly instead. Kept for protocol
			// completeness and future consumers. Clears whichever per-role
			// state this instance happened to create.
			if (compileEngine) {
				compileEngine.clear();
				compileEngine = null;
			}
			if (executeVm) {
				executeVm.reset();
				executeVm = null;
			}
			(self as unknown as Worker).postMessage({
				id: msg.id,
				type: "COMPILE_RESULT",
				results: [],
			});
			break;
		}

		default: {
			(self as unknown as Worker).postMessage({
				id: -1,
				type: "COMPILE_RESULT",
				results: [],
				error: `Unknown message type: ${(msg as { type?: string }).type}`,
			});
		}
	}
};
