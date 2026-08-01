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
 *
 * INVARIANT: at most one entry per line number at a time. `set()` stores
 * the expression alongside the entry ONLY as a same-key staleness check for
 * `get(line, expression)` — a line's previous text is never meaningfully
 * cacheable once the line has moved on, since `get()`/`getEntryForLine()`
 * are only ever called with the line's CURRENT text (see
 * `ExpressionEngine.reEvaluateLine()`). Before this invariant was enforced,
 * every distinct keystroke state of a line accumulated its own entry here
 * forever (nothing ever called `remove()`/`removeAllForLine()` per-edit,
 * only a full `clear()` on document switch) — an unbounded, session-long
 * memory leak reachable via ordinary typing, and a latent correctness bug
 * in `getEntryForLine()`, which picks "first in insertion order" and could
 * silently return a STALE entry from an old edit of the line instead of
 * its current one once more than one entry had piled up.
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
    // Enforce the one-entry-per-line invariant (see class doc comment):
    // any entry under a DIFFERENT expression key for this same line is for
    // text this line no longer has — drop it rather than let it pile up.
    if (entries.size > 0 && !entries.has(key)) {
      this.count -= entries.size;
      entries.clear();
    }
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
