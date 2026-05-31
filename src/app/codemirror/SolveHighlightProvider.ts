import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { HighlightRange } from "@solve-js/cache/LineCache";

/**
 * SolveHighlightProvider — syntax highlighting for CodeMirror decorations.
 *
 * FIX #1: Accepts a shared ExpressionEngine instance instead of creating its own.
 * This ensures the same lexer, registry, and locale are used across components.
 */
export class SolveHighlightProvider {
  private engine: ExpressionEngine | null;
  private cache: Map<string, HighlightRange[]> = new Map();

  constructor(engine?: ExpressionEngine | null) {
    this.engine = engine ?? null;
  }

  getLineHighlights(lineText: string, lineNumber?: number): HighlightRange[] {
    const cacheKey = lineNumber !== undefined ? `${lineNumber}:${lineText}` : lineText;

    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    // No engine available (e.g. playground where eval runs in a worker) — skip highlighting
    if (!this.engine) {
      return [];
    }

    // Use the shared engine's integrated lexer to get highlight tokens
    const tokens = this.engine.getLexer().getHighlightTokens(lineText);
    if (tokens.length === 0) {
      this.cache.set(cacheKey, []);
      return [];
    }

    const filteredTokens = tokens.filter(t => t.type !== "WS" && t.type !== "NEWLINE");
    if (filteredTokens.length === 0) {
      this.cache.set(cacheKey, []);
      return [];
    }

    try {
      const ranges: HighlightRange[] = [];
      for (const token of filteredTokens) {
        const className = token.className;
        if (className) {
          ranges.push({
            from: token.offset,
            to: token.offset + token.length,
            className,
          });
        }
      }

      this.cache.set(cacheKey, ranges);
      return ranges;
    } catch {
      this.cache.set(cacheKey, []);
      return [];
    }
  }

  invalidateCache(): void {
    this.cache.clear();
  }
}