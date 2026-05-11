import { Lexer } from "@/engine/lexer/Lexer";
import { Parser } from "@/engine/parser/Parser";
import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { HighlightRange } from "@/engine/cache/LineCache";
import { registerArithmeticParselets } from "@/providers/arithmetic/parselets/index";
import { registerPercentageParselets } from "@/providers/percentage/parselets/index";
import { registerFunctionParselets } from "@/providers/function/parselets/index";
import { registerDatetimeParselets } from "@/providers/datetime/parselets/index";
import { registerDiceParselets } from "@/providers/dice/parselets/index";
import { registerVariableParselets } from "@/providers/variables/parselets/index";

export class SolveHighlightProvider {
  private lexer: Lexer;
  private parser: Parser;
  private cache: Map<string, HighlightRange[]> = new Map();

  constructor(registry?: ParseletRegistry) {
    this.lexer = new Lexer();
    if (registry) {
      this.parser = new Parser(registry);
    } else {
      const reg = new ParseletRegistry();
      registerArithmeticParselets(reg);
      registerPercentageParselets(reg);
      registerFunctionParselets(reg);
      registerDatetimeParselets(reg);
      registerDiceParselets(reg);
      registerVariableParselets(reg);
      this.parser = new Parser(reg);
    }
  }

  getLineHighlights(lineText: string, lineNumber?: number): HighlightRange[] {
    const cacheKey = lineNumber !== undefined ? `${lineNumber}:${lineText}` : lineText;

    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const tokens = this.lexer.getHighlightTokens(lineText);
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
      const parseTokens = filteredTokens.map(t => ({
        type: t.type,
        value: t.value,
        text: t.value,
        offset: t.offset,
        lineBreaks: 0,
        line: 0,
        col: t.col,
      }));

      this.parser.load(parseTokens);
      this.parser.parseExpression(0);

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