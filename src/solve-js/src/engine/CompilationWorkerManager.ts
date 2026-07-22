/**
 * CompilationWorkerManager — main-thread bridge to the compilation worker.
 *
 * Manages the worker lifecycle and provides a batch compilation API.
 * Receives transferred ArrayBuffers from the worker and reconstructs
 * BytecodeProgram objects with zero-copy TypedArray views.
 *
 * Usage:
 *   const manager = new CompilationWorkerManager();
 *   const bytecodeByLineId = await manager.compileBatch(items, docModel);
 *
 * Thread safety:
 *   Each result includes `compiledAgainstHash`. Before storing bytecode
 *   in the DocumentModel, we validate via `docModel.isBytecodeValid()`.
 *   If the line was edited between dispatch and response, the bytecode
 *   is discarded — the next evaluate() will recompile it synchronously.
 */

import { DocumentModel } from "@solve-js/engine/DocumentModel";
import type { BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";
import createCompilationWorker from "@solve-js/workers/engine.worker";

// ── Types ─────────────────────────────────────────────────────────────────

export interface CompileRequestItem {
	lineId: number;
	expression: string;
	textHash: number;
}

export interface CompileResponseItem {
	lineId: number;
	/** Hash of the expression text when the compile was dispatched (for safety validation). */
	compiledAgainstHash: number;
	program: BytecodeProgram;
	reads: string[];
	writes: string[];
	isVariableDef: boolean;
	error: string | null;
}

// Raw result from worker (before BytecodeProgram reconstruction)
interface WorkerCompileResult {
	lineId: number;
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

// ── CompilationWorkerManager ──────────────────────────────────────────────

export class CompilationWorkerManager {
	private worker: Worker | null = null;
	private nextId = 1;
	private pending = new Map<
		number,
		{
			resolve: (results: CompileResponseItem[]) => void;
			reject: (error: Error) => void;
		}
	>();

	constructor() {}

	/**
	 * Ensure the worker is started (lazy initialization).
	 * Uses esbuild-plugin-inline-worker to inline the worker as a blob URL.
	 */
	private ensureWorker(): Worker {
		if (this.worker) return this.worker;

		this.worker = createCompilationWorker();

		this.worker.onmessage = (event: MessageEvent) => {
			const data = event.data;
			if (!data || data.type !== "COMPILE_RESULT") return;

			const pending = this.pending.get(data.id);
			if (!pending) return;

			this.pending.delete(data.id);

			const results: CompileResponseItem[] = [];
			for (const raw of data.results as WorkerCompileResult[]) {
				results.push(this.reconstructResult(raw));
			}
			pending.resolve(results);
		};

		this.worker.onerror = (err) => {
			// Reject all pending requests on worker error
			for (const [id, pending] of this.pending) {
				pending.reject(
					new Error(`Compilation worker error: ${err.message}`)
				);
				this.pending.delete(id);
			}
		};

		return this.worker;
	}

	/**
	 * Batch-compile expressions in the worker.
	 *
	 * Sends a batch of { lineId, expression, textHash } to the worker,
	 * which compiles each and transfers bytecode ArrayBuffers back.
	 * Bytecode is reconstructed into BytecodeProgram objects.
	 *
	 * Results are returned in the same order as the input items.
	 *
	 * @param items Expressions to compile.
	 * @returns Compiled bytecode for each item (or error).
	 */
	async compileBatch(items: CompileRequestItem[]): Promise<CompileResponseItem[]> {
		if (items.length === 0) return [];

		const worker = this.ensureWorker();
		const id = this.nextId++;

		return new Promise<CompileResponseItem[]>((resolve, reject) => {
			this.pending.set(id, { resolve, reject });

			worker.postMessage({
				type: "COMPILE_BATCH",
				id,
				items,
			});
		});
	}

	/**
	 * Store worker-compiled bytecode into the DocumentModel, with safety
	 * validation. Only stores bytecode for lines whose text has not changed
	 * since the compilation request was dispatched.
	 *
	 * Results for the same lineId are batched — all bytecodes from
	 * successful compilations are passed to updateLineCompiled in a single
	 * call. This supports multi-expression lines (inline solves).
	 *
	 * @param results Compiled results from the worker.
	 * @param doc The target document model.
	 * @returns Number of results successfully stored (passed safety check).
	 */
	storeResults(
		results: CompileResponseItem[],
		doc: DocumentModel
	): number {
		// Batch results by lineId (multiple inline solves share the same lineId)
		const byLineId = new Map<
			number,
			{
				bytecodes: BytecodeProgram[];
				reads: Set<string>;
				writes: Set<string>;
				isVariableDef: boolean;
				expressions: string[];
				textHash: number;
			}
		>();
		let validCount = 0;

		for (const result of results) {
			if (result.error) continue;

			// Safety check: has the line been edited since dispatch?
			const state = doc.getLineById(result.lineId);
			if (!state) continue;

			// Validate that the line text hasn't changed since dispatch.
			if (state.textHash !== result.compiledAgainstHash) continue;

			// Batch by lineId
			let batch = byLineId.get(result.lineId);
			if (!batch) {
				batch = {
					bytecodes: [],
					reads: new Set(),
					writes: new Set(),
					isVariableDef: false,
					expressions: state.expressions.length > 0 ? [...state.expressions] : [],
					textHash: result.compiledAgainstHash,
				};
				byLineId.set(result.lineId, batch);
			}

			batch.bytecodes.push(result.program);
			for (const r of result.reads) batch.reads.add(r);
			for (const w of result.writes) batch.writes.add(w);
			if (result.isVariableDef) batch.isVariableDef = true;
			validCount++;
		}

		// Store batched results
		let stored = 0;
		for (const [lineId, batch] of byLineId) {
			if (batch.bytecodes.length === 0) continue;
			// Preserve inlineSolveCount from the LineState so the evaluator
			// knows this line has multiple expressions (avoids re-extraction).
			const state = doc.getLineById(lineId);
			const inlineSolveCount = state?.inlineSolveCount ?? 0;
			doc.updateLineCompiled(
				lineId,
				batch.expressions,
				batch.bytecodes,
				[...batch.reads],
				[...batch.writes],
				batch.isVariableDef,
				inlineSolveCount,
			);
			stored += batch.bytecodes.length;
		}

		return stored;
	}

	/**
	 * Terminate the worker and clean up.
	 */
	terminate(): void {
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
			this.pending.clear();
		}
	}

	/**
	 * Whether the worker is currently active.
	 */
	get isActive(): boolean {
		return this.worker !== null;
	}

	// ── Private helpers ────────────────────────────────────────────────

	/**
	 * Reconstruct a BytecodeProgram from transferred ArrayBuffers.
	 *
	 * The transferred ArrayBuffers are zero-copy — we create TypedArray
	 * views directly over them. No data is copied or serialized.
	 */
	private reconstructResult(raw: WorkerCompileResult): CompileResponseItem {
		if (raw.error) {
			return {
				lineId: raw.lineId,
				compiledAgainstHash: raw.compiledAgainstHash,
				program: { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [], hasAsync: false },
				reads: [],
				writes: [],
				isVariableDef: false,
				error: raw.error,
			};
		}

		// Reconstruct TypedArrays from transferred ArrayBuffers.
		// These are views over the same memory — zero-copy from worker.
		const opcodes =
			raw.opcodesLength > 0
				? new Uint8Array(raw.opcodesBuffer, 0, raw.opcodesLength)
				: new Uint8Array(0);
		const numbers =
			raw.numbersLength > 0
				? new Float64Array(raw.numbersBuffer, 0, raw.numbersLength)
				: new Float64Array(0);

		const program: BytecodeProgram = {
			opcodes,
			numbers,
			strings: raw.strings,
			hasAsync: false,
		};

		return {
			lineId: raw.lineId,
			compiledAgainstHash: raw.compiledAgainstHash,
			program,
			reads: raw.reads,
			writes: raw.writes,
			isVariableDef: raw.isVariableDef,
			error: null,
		};
	}
}
