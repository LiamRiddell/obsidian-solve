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
const self = this;

import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { Value } from "@solve-js/vm/Value";

let engine: ExpressionEngine | null = null;

function getEngine(locale = "en"): ExpressionEngine {
  if (!engine) {
    engine = new ExpressionEngine(locale, false);
  }
  return engine;
}

function postError(id: number, error: string) {
  self.postMessage({ id, type: "ERROR", error });
}

function postResult(id: number, value: any) {
  self.postMessage({ id, type: "RESULT", value });
}

function handleEval(msg: any) {
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

function handleEvalDoc(msg: any) {
  try {
    const eng = getEngine(msg.locale);
    const result = eng.parseDocument(msg.document, msg.options || { inputType: "markdown" });
    const lines = result.lines.map((line: any) => ({
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
    self.postMessage({ id: msg.id, type: "DONE", lines, errors: result.errors });
  } catch (err) {
    postError(msg.id, (err as Error).message);
  }
}

self.onmessage = (event: MessageEvent) => {
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