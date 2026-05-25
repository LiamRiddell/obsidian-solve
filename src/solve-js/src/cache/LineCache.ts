import { Value } from "@solve-js/vm/Value";
import { BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";

export interface HighlightRange {
  from: number;
  to: number;
  className: string;
}

export class LineCacheEntry {
  constructor(
    public result: Value,
    public bytecode: BytecodeProgram,
    public readVariables: string[],
    public writeVariable: string | null,
    public highlights: HighlightRange[] = []
  ) {}
}

export class LineCache {
  private entries: Map<string, LineCacheEntry> = new Map();

  private getKey(line: number, expression?: string): string {
    return expression ? `${line}:${expression}` : `${line}`;
  }

get(line: number, expression?: string): LineCacheEntry | undefined {
     return this.entries.get(this.getKey(line, expression));
   }

   /** Find any cache entry for the given line number, regardless of expression suffix */
   getEntryForLine(line: number): LineCacheEntry | undefined {
     const linePrefix = `${line}:`;
     for (const [key, entry] of this.entries) {
       if (key === `${line}` || key.startsWith(linePrefix)) {
         return entry;
       }
     }
     return undefined;
   }

  set(line: number, entry: LineCacheEntry, expression?: string): void {
    this.entries.set(this.getKey(line, expression), entry);
  }

/**
   * Mark a line's cache entries as stale.
   *
   * NOTE: Dirty-state tracking has been consolidated into DocumentModel.
   * This method is retained for backward compatibility but is a no-op —
   * the caller (DynamicValueResolver, markDirtyFromVariable) manages
   * dirty state through DocumentModel.LineState.dirty instead.
   */
  markDirty(_line: number, _expression?: string): void {
    // DocumentModel.LineState.dirty is the canonical dirty flag.
  }

  /**
   * Mark a line's cache entries as clean.
   *
   * NOTE: See markDirty — dirty state is tracked in DocumentModel.
   */
  markClean(_line: number, _expression?: string): void {
    // DocumentModel.LineState.dirty is the canonical dirty flag.
  }

  has(line: number, expression?: string): boolean {
    return this.entries.has(this.getKey(line, expression));
  }

  remove(line: number, expression?: string): void {
    const key = this.getKey(line, expression);
    this.entries.delete(key);
  }

  removeAllForLine(line: number): void {
    const prefix = `${line}:`;
    for (const key of Array.from(this.entries.keys())) {
      if (key === `${line}` || key.startsWith(prefix)) {
        this.entries.delete(key);
      }
    }
  }

  clearLine(line: number): void {
    this.removeAllForLine(line);
  }

  /**
   * Number of entries in the cache. Useful for diagnostics.
   */
  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}