import { Value } from "@solve-js/vm/Value";
import { BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";

export class LineCacheEntry {
  constructor(
    public result: Value,
    public bytecode: BytecodeProgram,
    public readVariables: string[],
    public writeVariable: string | null
  ) {}
}

/**
 * Per-line result + bytecode cache.
 *
 * Entries are stored in a two-level map (line number → expression → entry)
 * so per-line operations — getEntryForLine, removeAllForLine — are O(1)
 * lookups instead of scans over every cached key. Entries with no
 * expression are stored under the empty-string key.
 *
 * The string keys exposed by keys()/forEach() keep the historical
 * "line" / "line:expression" format for diagnostics consumers.
 */
export class LineCache {
  /** line number → (expression, or "" for expressionless entries) → entry */
  private byLine: Map<number, Map<string, LineCacheEntry>> = new Map();
  private count = 0;

  private static exprKey(expression?: string): string {
    return expression ?? "";
  }

  private static displayKey(line: number, exprKey: string): string {
    return exprKey === "" ? `${line}` : `${line}:${exprKey}`;
  }

  get(line: number, expression?: string): LineCacheEntry | undefined {
    return this.byLine.get(line)?.get(LineCache.exprKey(expression));
  }

  /** Find any cache entry for the given line number, regardless of expression suffix */
  getEntryForLine(line: number): LineCacheEntry | undefined {
    const entries = this.byLine.get(line);
    if (!entries) return undefined;
    // First entry in insertion order — matches the historical scan behavior.
    for (const entry of entries.values()) {
      return entry;
    }
    return undefined;
  }

  set(line: number, entry: LineCacheEntry, expression?: string): void {
    let entries = this.byLine.get(line);
    if (!entries) {
      entries = new Map();
      this.byLine.set(line, entries);
    }
    const key = LineCache.exprKey(expression);
    if (!entries.has(key)) this.count++;
    entries.set(key, entry);
  }

  has(line: number, expression?: string): boolean {
    return this.byLine.get(line)?.has(LineCache.exprKey(expression)) ?? false;
  }

  remove(line: number, expression?: string): void {
    const entries = this.byLine.get(line);
    if (!entries) return;
    if (entries.delete(LineCache.exprKey(expression))) {
      this.count--;
      if (entries.size === 0) this.byLine.delete(line);
    }
  }

  removeAllForLine(line: number): void {
    const entries = this.byLine.get(line);
    if (!entries) return;
    this.count -= entries.size;
    this.byLine.delete(line);
  }

  clearLine(line: number): void {
    this.removeAllForLine(line);
  }

  /**
   * Number of entries in the cache. Useful for diagnostics.
   */
  get size(): number {
    return this.count;
  }

  clear(): void {
    this.byLine.clear();
    this.count = 0;
  }

  /**
   * Iterate all cache entries for diagnostics/debugging.
   */
  forEach(callback: (key: string, entry: LineCacheEntry) => void): void {
    for (const [line, entries] of this.byLine) {
      for (const [exprKey, entry] of entries) {
        callback(LineCache.displayKey(line, exprKey), entry);
      }
    }
  }

  /**
   * Get all entry keys.
   */
  keys(): string[] {
    const result: string[] = [];
    for (const [line, entries] of this.byLine) {
      for (const exprKey of entries.keys()) {
        result.push(LineCache.displayKey(line, exprKey));
      }
    }
    return result;
  }
}
