/**
 * Solve Expression Worker
 * Runs a full ExpressionEngine instance inside a Web Worker so that
 * heavy document parsing and evaluation can be parallelised off the main thread.
 *
 * Communication protocol:
 *   Main → Worker: { type: "EVAL", id, expression, lineNumber }
 *   Main → Worker: { type: "EVAL_DOC", id, document, options }
 *   Main → Worker: { type: "REGISTER_PLUGIN", plugin }
 *   Main → Worker: { type: "UNREGISTER_PLUGIN", name }
 *   Main → Worker: { type: "SET_LOCALE", locale }
 *   Main → Worker: { type: "TERMINATE" }
 *
 *   Worker → Main: { id, type: "RESULT", value }
 *   Worker → Main: { id, type: "ERROR", error }
 *   Worker → Main: { type: "DONE", results } (for EVAL_DOC)
 *
 * All messages are structured-cloneable — no functions or class instances cross the boundary.
 */

import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { Value } from "@solve-js/vm/Value";
import type { ParsedLine } from "@solve-js/types/ParsingResult";
import type { SolvePlugin } from "@solve-js/plugins/PluginSystem";

type WorkerPostMessage = { postMessage(msg: unknown): void };
const workerSelf = self as unknown as WorkerPostMessage;
let engine: ExpressionEngine | null = null;
let nextId = 0;
const pending = new Map<number, (result: unknown, error?: string) => void>();

function getEngine(locale?: string): ExpressionEngine {
  // Lazy init — engine is created once and reused across messages.
  // Options (locale, diagnostic) can only change via a reset.
  if (!engine) {
    engine = new ExpressionEngine(locale || "en", false);
  }
  return engine;
}

function postError(id: number, error: string) {
  workerSelf.postMessage({ id, type: "ERROR", error });
}

function postResult(id: number, value: unknown) {
  workerSelf.postMessage({ id, type: "RESULT", value });
}

// --- Message handler interfaces ---

interface EvalMsg { id: number; type: "EVAL"; expression: string; lineNumber: number; locale?: string }
interface EvalDocMsg { id: number; type: "EVAL_DOC"; document: string; options?: { inputType: "raw" | "code" | "markdown" }; locale?: string }
interface RegisterPluginMsg { id: number; type: "REGISTER_PLUGIN"; plugin: SolvePlugin }
interface UnregisterPluginMsg { id: number; type: "UNREGISTER_PLUGIN"; name: string }
interface SetLocaleMsg { id: number; type: "SET_LOCALE"; locale: string }
interface TerminateMsg { id: number; type: "TERMINATE" }

type WorkerMessage = EvalMsg | EvalDocMsg | RegisterPluginMsg | UnregisterPluginMsg | SetLocaleMsg | TerminateMsg;

export type { WorkerMessage };

// --- Message handlers -------------------------------------------------------

function handleEval(msg: EvalMsg) {
  try {
    const engine = getEngine(msg.locale);
    const val: Value = engine.evaluateLine(msg.lineNumber, msg.expression);
    postResult(msg.id, {
      value: val?.toNumber() ?? null,
      type: val?.type ?? null,
      formatted: val ? `${val.toNumber()}` : null,
    });
  } catch (err) {
    postError(msg.id, (err as Error).message);
  }
}

function handleEvalDoc(msg: EvalDocMsg) {
  try {
    const engine = getEngine(msg.locale);
    const result = engine.parseDocument(msg.document, msg.options || ({ inputType: "markdown" } as const));
    // Serialize results — class instances don't cross the boundary
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

function handleRegisterPlugin(msg: RegisterPluginMsg) {
  try {
    const engine = getEngine();
    engine.registerPlugin(msg.plugin);
    postResult(msg.id, { ok: true });
  } catch (err) {
    postError(msg.id, (err as Error).message);
  }
}

function handleUnregisterPlugin(msg: UnregisterPluginMsg) {
  try {
    const engine = getEngine();
    engine.unregisterPlugin(msg.name);
    postResult(msg.id, { ok: true });
  } catch (err) {
    postError(msg.id, (err as Error).message);
  }
}

function handleSetLocale(msg: SetLocaleMsg) {
  if (engine) {
    // Force re-creation on next access with new locale
    engine.clear();
    engine = null;
  }
  postResult(msg.id, { ok: true });
}

// --- Boot --------------------------------------------------------------------

self.onmessage = (event: MessageEvent) => {
  const msg = event.data;
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
      pending.clear();
      break;
    default:
      postError(msg.id ?? -1, `Unknown message type: ${msg.type}`);
  }
};