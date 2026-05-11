import { Value } from "@/engine/vm/Value";

export interface ExpressionRecord {
  lineNumber: number;
  expression: string;
  bytecode: { opcodes: number[]; numbers: number[]; strings: string[] };
  lastResult: Value;
  readVariables: string[];
  writeVariable: string | null;
}

export class ScopeManager {
  private definitions: Map<string, { line: number; expr: ExpressionRecord }[]> = new Map();

  write(variable: string, lineNumber: number, expr: ExpressionRecord): void {
    if (!this.definitions.has(variable)) {
      this.definitions.set(variable, []);
    }
    const stack = this.definitions.get(variable)!;
    stack.push({ line: lineNumber, expr });
    stack.sort((a, b) => a.line - b.line);
  }

  read(variable: string, readLine: number): Value | undefined {
    const stack = this.definitions.get(variable);
    if (!stack) return undefined;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].line <= readLine) return stack[i].expr.lastResult;
    }
    return undefined;
  }

  invalidateDownstream(variable: string, definitionLine: number): void {
    const stack = this.definitions.get(variable);
    if (!stack) return;
    const idx = stack.findIndex(s => s.line === definitionLine);
    if (idx === -1) return;
    stack.splice(idx + 1);
  }

  clear(): void {
    this.definitions.clear();
  }
}