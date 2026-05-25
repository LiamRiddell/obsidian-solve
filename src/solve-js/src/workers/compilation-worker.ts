/**
 * Compilation worker — offloads lex→parse→compile to a background thread.
 *
 * Receives batches of expressions, compiles them into bytecode, and transfers
 * the resulting Uint8Array + Float64Array ArrayBuffers back to the main thread
 * via postMessage with Transferable objects (zero-copy).
 *
 * Message protocol:
 *   Main → Worker:
 *     { type: "COMPILE_BATCH", id, items: { lineId, expression, textHash }[] }
 *     { type: "TERMINATE", id }
 *
 *   Worker → Main:
 *     { id, type: "COMPILE_RESULT", results: CompileResult[] }
 *
 * Transferable objects:
 *   Each CompileResult carries `opcodesBuffer` and `numbersBuffer` as detached
 *   ArrayBuffers — the owning thread transfers these without copying. The main
 *   thread reconstructs TypedArrays via `new Uint8Array(opcodesBuffer)` etc.
 *
 * Safety:
 *   Each result includes `compiledAgainstHash` so the main thread can validate
 *   via `DocumentModel.isBytecodeValid(lineId, compiledAgainstHash)` that the
 *   line hasn't been edited since the compilation request was dispatched.
 */

import { ExpressionEngine } from "../engine/ExpressionEngine";
import type { BytecodeProgram } from "../parser/BytecodeBuilder";

// ── Message types ─────────────────────────────────────────────────────────

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

interface TerminateMsg {
	type: "TERMINATE";
	id: number;
}

type CompilationWorkerMessage = CompileBatchMsg | TerminateMsg;

// ── Result type (sent back to main thread) ────────────────────────────────

interface CompileResult {
	/** The line's persistent ID (from the request). */
	lineId: number;
	/** The expression that was compiled (echoed back for correlation). */
	expression: string;
	/** djb2 hash of the expression text at dispatch time (for safety validation). */
	compiledAgainstHash: number;
	/** Transferred ArrayBuffer for opcodes. Detached on the worker side. */
	opcodesBuffer: ArrayBuffer;
	/** Transferred ArrayBuffer for numbers. Detached on the worker side. */
	numbersBuffer: ArrayBuffer;
	/** Number of Uint8 elements in opcodesBuffer. */
	opcodesLength: number;
	/** Number of Float64 elements in numbersBuffer. */
	numbersLength: number;
	/** String constants pool (structured-cloned, not transferred). */
	strings: string[];
	/** Variables this expression reads. */
	reads: string[];
	/** Variables this expression writes. */
	writes: string[];
	/** Whether this expression defines a variable. */
	isVariableDef: boolean;
	/** Error message, or null on success. */
	error: string | null;
}

// ── Worker body ───────────────────────────────────────────────────────────

let engine: ExpressionEngine | null = null;

function getEngine(): ExpressionEngine {
	if (!engine) {
		engine = new ExpressionEngine("en", false);
	}
	return engine;
}

/**
 * Compile a single expression and produce a transfer-ready CompileResult.
 *
 * Returns a CompileResult with either bytecode buffers or an error.
 * The bytecode ArrayBuffers are extracted from the TypedArrays so they
 * can be transferred via postMessage — after this call, the original
 * TypedArrays in the BytecodeProgram are detached on the worker side.
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
		const eng = getEngine();
		const { program, reads, writes } = eng.compileExpression(item.expression);

		const isVariableDef = writes.length > 0;

		// Extract ArrayBuffers from TypedArrays for Transferable transfer.
		// Uint8Array and Float64Array may be views into pooled buffers
		// (from buildInto), so we extract the exact byte range.
		const opcodes = program.opcodes instanceof Uint8Array
			? program.opcodes
			: new Uint8Array(program.opcodes);
		const numbers = program.numbers instanceof Float64Array
			? program.numbers
			: new Float64Array(program.numbers);

		// Transfer only the exact used slice of the ArrayBuffer.
		// After this call, the source TypedArrays are detached on the worker
		// side, but that's fine — the engine's buffer pool is write-only.
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

// ── Message handler ───────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent) => {
	const msg = event.data as CompilationWorkerMessage;

	switch (msg.type) {
		case "COMPILE_BATCH": {
			const results: CompileResult[] = [];
			const transferList: ArrayBuffer[] = [];

			for (const item of msg.items) {
				const result = compileOne(item);
				results.push(result);

				// Collect transferable buffers (skip empty ones from errors)
				if (result.opcodesBuffer.byteLength > 0) {
					transferList.push(result.opcodesBuffer);
				}
				if (result.numbersBuffer.byteLength > 0) {
					transferList.push(result.numbersBuffer);
				}
			}

			// Transfer ArrayBuffers (zero-copy) along with the structured-cloned result.
			// After this call, the worker no longer has access to these buffers.
			(self as unknown as Worker).postMessage(
				{ id: msg.id, type: "COMPILE_RESULT", results },
				transferList
			);
			break;
		}

		case "TERMINATE": {
			if (engine) {
				engine.clear();
				engine = null;
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
