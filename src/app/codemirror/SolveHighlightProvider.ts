import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { HighlightRange } from "@solve-js/cache/LineCache";
import UserSettings from "@app/settings/UserSettings";

export class SolveHighlightProvider {
  private expressionEngine: ExpressionEngine;
  private cache: Map<string, HighlightRange[]> = new Map();

  constructor() {
    const userSettings = UserSettings.getInstance();
    this.expressionEngine = new ExpressionEngine(userSettings.settings.engine.locale);
  }

  getLineHighlights(lineText: string, lineNumber?: number): HighlightRange[] {
    const cacheKey = lineNumber !== undefined ? `${lineNumber}:${lineText}` : lineText;

    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    // Use the ExpressionEngine's integrated lexer to get highlight tokens
    const tokens = this.expressionEngine.getLexer().getHighlightTokens(lineText);
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
