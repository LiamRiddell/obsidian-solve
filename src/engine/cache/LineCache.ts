import { Value } from "@/engine/vm/Value";

export interface BytecodeSnapshot {
  opcodes: number[];
  numbers: number[];
  strings: string[];
}

export interface HighlightRange {
  from: number;
  to: number;
  className: string;
}

export class LineCacheEntry {
  constructor(
    public result: Value,
    public bytecode: BytecodeSnapshot,
    public readVariables: string[],
    public writeVariable: string | null,
    public dirty: boolean,
    public highlights: HighlightRange[] = []
  ) {}
}

export class LineCache {
  private entries: Map<string, LineCacheEntry> = new Map();
  private dirtyLines: Set<string> = new Set();

  private getKey(line: number, expression?: string): string {
    return expression ? `${line}:${expression}` : `${line}`;
  }

  get(line: number, expression?: string): LineCacheEntry | undefined {
    return this.entries.get(this.getKey(line, expression));
  }

  set(line: number, entry: LineCacheEntry, expression?: string): void {
    this.entries.set(this.getKey(line, expression), entry);
  }

  markDirty(line: number, expression?: string): void {
    const key = this.getKey(line, expression);
    const entry = this.entries.get(key);
    if (entry) {
      entry.dirty = true;
    }
    this.dirtyLines.add(key);
  }

  markClean(line: number, expression?: string): void {
    const key = this.getKey(line, expression);
    const entry = this.entries.get(key);
    if (entry) {
      entry.dirty = false;
    }
    this.dirtyLines.delete(key);
  }

  isDirty(line: number, expression?: string): boolean {
    const key = this.getKey(line, expression);
    const entry = this.entries.get(key);
    return entry ? entry.dirty : false;
  }

  getDirtyLines(): Set<number> {
    // Return line numbers for any dirty entries
    const dirtyLineNumbers = new Set<number>();
    for (const key of this.dirtyLines) {
      const line = parseInt(key.split(':')[0]);
      dirtyLineNumbers.add(line);
    }
    return dirtyLineNumbers;
  }

  has(line: number, expression?: string): boolean {
    return this.entries.has(this.getKey(line, expression));
  }

  remove(line: number, expression?: string): void {
    const key = this.getKey(line, expression);
    this.entries.delete(key);
    this.dirtyLines.delete(key);
  }

  removeAllForLine(line: number): void {
    const prefix = `${line}:`;
    for (const key of Array.from(this.entries.keys())) {
      if (key === `${line}` || key.startsWith(prefix)) {
        this.entries.delete(key);
        this.dirtyLines.delete(key);
      }
    }
  }

  clear(): void {
    this.entries.clear();
    this.dirtyLines.clear();
  }
}
