/**
 * solve-js Worker entry point
 * Bundled separately by esbuild and loaded as a Web Worker.
 * Mirrors src/solve-js/src/workers/worker-entry.ts for bundling.
 */

import { ExpressionEngine } from "../../solve-js/src/engine/ExpressionEngine";
import { Value } from "../../solve-js/src/vm/Value";
import type { ParsedLine } from "../../solve-js/src/types/ParsingResult";

type WorkerPostMessage = { postMessage(msg: unknown): void };
const workerSelf = self as unknown as WorkerPostMessage;
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

self.onmessage = (event: MessageEvent) => {
  const msg = event.data;

  try {
    switch (msg.type) {
      case "EVAL": {
        const eng = getEngine(msg.locale);
        const val: Value = eng.evaluateLine(msg.lineNumber, msg.expression);
        postResult(msg.id, {
          value: val?.toNumber() ?? null,
          type: val?.type ?? null,
        });
        break;
      }

      case "EVAL_DOC": {
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
        break;
      }

      case "REGISTER_PLUGIN": {
        const eng = getEngine();
        eng.registerPlugin(msg.plugin);
        postResult(msg.id, { ok: true });
        break;
      }

      case "UNREGISTER_PLUGIN": {
        const eng = getEngine();
        eng.unregisterPlugin(msg.name);
        postResult(msg.id, { ok: true });
        break;
      }

      case "TERMINATE": {
        engine?.clear();
        engine = null;
        postResult(msg.id, { ok: true });
        break;
      }

      default:
        postError(msg.id ?? -1, `Unknown message type: ${msg.type}`);
    }
  } catch (err) {
    postError(msg.id ?? -1, (err as Error).message);
  }
};