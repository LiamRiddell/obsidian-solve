/**
 * Expression evaluation worker
 * Bundled by esbuild-plugin-inline-worker into a Blob URL at build time.
 *
 * Communication protocol:
 *   Main → Worker: { type: "EVAL", id, expression, lineNumber, locale }
 *   Main → Worker: { type: "EVAL_DOC", id, document, options, locale }
 *   Main → Worker: { type: "TERMINATE" }
 *
 *   Worker → Main: { id, type: "RESULT", value }
 *   Worker → Main: { id, type: "ERROR", error }
 *   Worker → Main: { id, type: "DONE", lines, errors } (for EVAL_DOC)
 */
// @ts-ignore — Worker global is available at runtime
type WorkerPostMessage = { postMessage(msg: unknown): void; onmessage: ((ev: MessageEvent) => void) | null };
const workerSelf = this as unknown as WorkerPostMessage;

import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { Value } from "@solve-js/vm/Value";
import type { ParsedLine } from "@solve-js/types/ParsingResult";

let engine: ExpressionEngine | null = null;

function getEngine(locale = "en"): ExpressionEngine {
  if (!engine) {
    engine = new ExpressionEngine(locale, false);
  }
  return engine;
}

function postError(id: number, error: string) {
  workerSelf.postMessage({ id, type: "ERROR", error });
}

function postResult(id: number, value: unknown) {
  workerSelf.postMessage({ id, type: "RESULT", value });
}

interface EvalMessage {
  id: number;
  type: string;
  expression: string;
  lineNumber: number;
  locale?: string;
}

interface EvalDocMessage {
  id: number;
  type: string;
  document: string;
  options?: { inputType: "raw" | "code" | "markdown" };
  locale?: string;
}

type WorkerMessage = EvalMessage | EvalDocMessage | { id: number; type: "TERMINATE" };

function handleEval(msg: EvalMessage) {
  try {
    const eng = getEngine(msg.locale);
    const val: Value = eng.evaluateLine(msg.lineNumber, msg.expression);
    postResult(msg.id, {
      value: val?.toNumber() ?? null,
      type: val?.type ?? null,
    });
  } catch (err) {
    postError(msg.id, (err as Error).message);
  }
}

function handleEvalDoc(msg: EvalDocMessage) {
  try {
    const eng = getEngine(msg.locale);
    const result = eng.parseDocument(msg.document, msg.options || { inputType: "markdown" });
    const lines = result.lines.map((line: ParsedLine) => ({
      lineNumber: line.lineNumber,
      text: line.text,
      isEmpty: line.isEmpty,
      hasInlineSolves: line.hasInlineSolves,
      expression: line.expression,
      result: line.result
        ? { value: (line.result as Value).toNumber(), type: (line.result as Value).type }
        : null,
      error: line.error || null,
    }));
    workerSelf.postMessage({ id: msg.id, type: "DONE", lines, errors: result.errors });
  } catch (err) {
    postError(msg.id, (err as Error).message);
  }
}

workerSelf.onmessage = (event: MessageEvent) => {
  const msg = event.data;
  switch (msg.type) {
    case "EVAL":
      handleEval(msg);
      break;
    case "EVAL_DOC":
      handleEvalDoc(msg);
      break;
    case "TERMINATE":
      engine?.clear();
      engine = null;
      postResult(msg.id, { ok: true });
      break;
    default:
      postError(msg.id ?? -1, `Unknown message type: ${msg.type}`);
  }
};