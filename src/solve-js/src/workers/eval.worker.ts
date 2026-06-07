/**
 * Canonical solve-js eval worker entry point.
 *
 * Runs a full ExpressionEngine instance inside a Web Worker so that
 * heavy document parsing and evaluation can be parallelised off the main thread.
 *
 * This is the single canonical worker — consolidates the previous three
 * near-duplicate files (worker-entry.ts, worker-entry.worker.ts, SolveEvalWorker.ts).
 *
 * Communication protocol:
 *   Main → Worker: { type: "EVAL", id, expression, lineNumber, locale? }
 *   Main → Worker: { type: "EVAL_DOC", id, document, options?, locale? }
 *   Main → Worker: { type: "REGISTER_PLUGIN", id, plugin }
 *   Main → Worker: { type: "UNREGISTER_PLUGIN", id, name }
 *   Main → Worker: { type: "SET_LOCALE", id, locale }
 *   Main → Worker: { type: "TERMINATE", id }
 *
 *   Worker → Main: { id, type: "RESULT", value }
 *   Worker → Main: { id, type: "ERROR", error }
 *   Worker → Main: { id, type: "DONE", lines, errors } (for EVAL_DOC)
 *
 * All messages are structured-cloneable — no functions or class instances cross the boundary.
 */

import { ExpressionEngine, type EvalResults } from "../engine/ExpressionEngine";
import { Value } from "../vm/Value";
import type { ParsedLine } from "../types/ParsingResult";
import type { SolvePackage as SolvePlugin } from "../packages/PackageSystem";

type WorkerPostMessage = { postMessage(msg: unknown): void };
const workerSelf = self as unknown as WorkerPostMessage;
let engine: ExpressionEngine | null = null;

function getEngine(locale?: string): ExpressionEngine {
  if (!engine) {
    engine = new ExpressionEngine(locale || "en", false);
  }
  return engine;
}

function postError(id: number, error: string): void {
  workerSelf.postMessage({ id, type: "ERROR", error });
}

function postResult(id: number, value: unknown): void {
  workerSelf.postMessage({ id, type: "RESULT", value });
}

// ── Message handler interfaces ─────────────────────────────────────────────

interface EvalMsg { id: number; type: "EVAL"; expression: string; lineNumber: number; locale?: string }
interface EvalDocMsg { id: number; type: "EVAL_DOC"; document: string; options?: { inputType: "raw" | "code" | "markdown" }; locale?: string }
interface RegisterPluginMsg { id: number; type: "REGISTER_PLUGIN"; plugin: SolvePlugin }
interface UnregisterPluginMsg { id: number; type: "UNREGISTER_PLUGIN"; name: string }
interface SetLocaleMsg { id: number; type: "SET_LOCALE"; locale: string }
interface TerminateMsg { id: number; type: "TERMINATE" }

/** Discriminated union of all eval-worker message types (main → worker). */
export type EvalWorkerMessage = EvalMsg | EvalDocMsg | RegisterPluginMsg | UnregisterPluginMsg | SetLocaleMsg | TerminateMsg;

// ── Message handlers ───────────────────────────────────────────────────────

function handleEval(msg: EvalMsg): void {
  try {
    const eng = getEngine(msg.locale);
    const vals: EvalResults = eng.evaluateLine(msg.lineNumber, msg.expression);
    const val = vals[0];
    postResult(msg.id, {
      value: val?.toNumber() ?? null,
      type: val?.type ?? null,
      formatted: val ? `${val.toNumber()}` : null,
    });
  } catch (err) {
    postError(msg.id, (err as Error).message);
  }
}

function handleEvalDoc(msg: EvalDocMsg): void {
  try {
    const eng = getEngine(msg.locale);
    const result = eng.parseDocument(msg.document, msg.options || ({ inputType: "markdown" } as const));
    const lines = result.lines.map((line: ParsedLine) => ({
      lineNumber: line.lineNumber,
      text: line.text,
      isEmpty: line.isEmpty,
      hasInlineSolves: line.hasInlineSolves,
      expression: line.expression,
      result: line.result
        ? {
            value: (line.result as Value).toNumber(),
            type: (line.result as Value).type,
          }
        : null,
      error: line.error || null,
      inlineSolves: line.inlineSolves?.map((s) => ({
        start: s.start,
        end: s.end,
        expression: s.expression,
        result: s.result
          ? {
              value: (s.result as Value).toNumber(),
              type: (s.result as Value).type,
            }
          : null,
        error: s.error || null,
      })),
    }));
    workerSelf.postMessage({ id: msg.id, type: "DONE", lines, errors: result.errors });
  } catch (err) {
    postError(msg.id, (err as Error).message);
  }
}

function handleRegisterPlugin(msg: RegisterPluginMsg): void {
  try {
    const eng = getEngine();
    eng.registerPlugin(msg.plugin);
    postResult(msg.id, { ok: true });
  } catch (err) {
    postError(msg.id, (err as Error).message);
  }
}

function handleUnregisterPlugin(msg: UnregisterPluginMsg): void {
  try {
    const eng = getEngine();
    eng.unregisterPlugin(msg.name);
    postResult(msg.id, { ok: true });
  } catch (err) {
    postError(msg.id, (err as Error).message);
  }
}

function handleSetLocale(msg: SetLocaleMsg): void {
  if (engine) {
    engine.clear();
    engine = null;
  }
  postResult(msg.id, { ok: true });
}

// ── Boot ───────────────────────────────────────────────────────────────────

// This file is transformed by esbuild-plugin-inline-worker into a factory
// that returns Worker. If you see this error, the plugin isn't configured.
export default (() => {
	throw new Error("eval.worker.ts must be processed by esbuild-plugin-inline-worker");
}) as unknown as () => Worker;

// Worker message boundaries are inherently untyped — data arrives as unknown.
// We cast to the discriminated union for internal dispatch safety.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
self.onmessage = (event: MessageEvent) => {
  const msg = event.data as EvalWorkerMessage;
  switch (msg.type) {
    case "EVAL":
      handleEval(msg);
      break;
    case "EVAL_DOC":
      handleEvalDoc(msg);
      break;
    case "REGISTER_PLUGIN":
      handleRegisterPlugin(msg);
      break;
    case "UNREGISTER_PLUGIN":
      handleUnregisterPlugin(msg);
      break;
    case "SET_LOCALE":
      handleSetLocale(msg);
      break;
    case "TERMINATE":
      engine?.clear();
      engine = null;
      break;
    default: {
      // After exhaustive switch, msg is narrowed to never — cast back for the fallback handler.
      const unknownMsg = event.data as { id?: number; type?: string };
      postError(unknownMsg.id ?? -1, `Unknown message type: ${unknownMsg.type}`);
    }
  }
};
