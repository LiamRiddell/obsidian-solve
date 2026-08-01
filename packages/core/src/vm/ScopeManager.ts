import { Value } from "@solve-js/vm/Value";

/**
 * Record of a compiled expression in the scope.
 * Tracks the expression text, compiled bytecode, last evaluation result,
 * and the variable reads/writes for dependency tracking.
 */
export interface ExpressionRecord {
  lineNumber: number;
  expression: string;
  bytecode: { opcodes: Uint8Array; numbers: Float64Array; strings: string[] };
  lastResult: Value;
  readVariables: string[];
  writeVariable: string | null;
}

/**
 * Scoped variable manager for expression evaluation.
 *
 * Tracks variable definitions across line numbers with write-on-read semantics.
 * When a value is read, the most recent definition at or before the reading line
 * is returned. Invalidation trims downstream definitions when a variable is redefined.
 */
export class ScopeManager {
  private definitions: Map<string, { line: number; expr: ExpressionRecord }[]> = new Map();

  /**
   * Record a variable definition at `lineNumber`. A variable may have
   * multiple definitions across different lines (e.g. redefined further
   * down a document) — each call adds one, keeping the internal stack
   * sorted by line so {@link read} can binary-scan for "most recent
   * definition at or before" a given line.
   */
  write(variable: string, lineNumber: number, expr: ExpressionRecord): void {
    if (!this.definitions.has(variable)) {
      this.definitions.set(variable, []);
    }
    const stack = this.definitions.get(variable)!;
    stack.push({ line: lineNumber, expr });
    stack.sort((a, b) => a.line - b.line);
  }

  /**
   * Look up a variable's value as seen from `readLine`: returns the result
   * of the closest definition at or before `readLine`, not simply the most
   * recently-written one — so a read on line 5 of a variable redefined on
   * lines 2 and 10 sees line 2's value, not line 10's. Returns `undefined`
   * if the variable has no definition at or before `readLine`.
   */
  read(variable: string, readLine: number): Value | undefined {
    const stack = this.definitions.get(variable);
    if (!stack) return undefined;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].line <= readLine) return stack[i].expr.lastResult;
    }
    return undefined;
  }

  /**
   * Drop every definition of `variable` that comes strictly after
   * `definitionLine`. Call this when a line is re-evaluated with a new
   * definition, so stale later-line definitions from a previous edit don't
   * linger and get returned by {@link read}.
   */
  invalidateDownstream(variable: string, definitionLine: number): void {
    const stack = this.definitions.get(variable);
    if (!stack) return;
    const idx = stack.findIndex(s => s.line === definitionLine);
    if (idx === -1) return;
    stack.splice(idx + 1);
  }

  /** Remove every tracked variable definition — used when an engine/document is reset. */
  clear(): void {
    this.definitions.clear();
  }
}
