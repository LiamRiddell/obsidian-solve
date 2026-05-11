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
  private entries: Map<number, LineCacheEntry> = new Map();
  private dirtyLines: Set<number> = new Set();

  get(line: number): LineCacheEntry | undefined {
    return this.entries.get(line);
  }

  set(line: number, entry: LineCacheEntry): void {
    this.entries.set(line, entry);
  }

  markDirty(line: number): void {
    const entry = this.entries.get(line);
    if (entry) {
      entry.dirty = true;
    }
    this.dirtyLines.add(line);
  }

  markClean(line: number): void {
    const entry = this.entries.get(line);
    if (entry) {
      entry.dirty = false;
    }
    this.dirtyLines.delete(line);
  }

  isDirty(line: number): boolean {
    const entry = this.entries.get(line);
    return entry ? entry.dirty : false;
  }

  getDirtyLines(): Set<number> {
    return new Set(this.dirtyLines);
  }

  has(line: number): boolean {
    return this.entries.has(line);
  }

  remove(line: number): void {
    this.entries.delete(line);
    this.dirtyLines.delete(line);
  }

  clear(): void {
    this.entries.clear();
    this.dirtyLines.clear();
  }
}
