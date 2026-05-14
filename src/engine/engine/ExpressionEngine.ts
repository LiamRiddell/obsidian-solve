import { VM } from "@/engine/vm/OpRegistry";
import { DependencyGraph } from "@/engine/vm/DependencyGraph";
import { LineCache, LineCacheEntry } from "@/engine/cache/LineCache";
import { ScopeManager } from "@/engine/vm/ScopeManager";
import { MemoCache } from "@/engine/vm/MemoCache";
import { Lexer } from "@/engine/lexer/Lexer";
import { Parser } from "@/engine/parser/Parser";
import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { createVM, executeBytecode } from "@/engine/vm/VM";
import { sharedOpRegistry } from "@/engine/vm/OpRegistry";
import { Value, numberValue } from "@/engine/vm/Value";
import { registerArithmeticParselets } from "@/providers/arithmetic/parselets/index";
import { registerPercentageParselets } from "@/providers/percentage/parselets/index";
import { registerFunctionParselets } from "@/providers/function/parselets/index";
import { registerDatetimeParselets } from "@/providers/datetime/parselets/index";
import { registerDiceParselets } from "@/providers/dice/parselets/index";
import { registerVariableParselets } from "@/providers/variables/parselets/index";
import { registerUomParselets } from "@/providers/uom/parselets/index";
import { registerVectorParselets } from "@/providers/vector/parselets/index";
import { registerBigIntParselets } from "@/providers/biginteger/parselets/index";
import { TokenTypes } from "@/engine/lexer/Token";
import { 
    ParsingResult, 
    ParsedLine, 
    InlineSolvePosition, 
    UnifiedParsingOptions 
} from "@/engine/types/ParsingResult";

export class ExpressionEngine {
  private dag = new DependencyGraph();
  private lineCache = new LineCache();
  private scopeManager = new ScopeManager();
  private memoCache = new MemoCache();
  private lexer: Lexer;
  private registry: ParseletRegistry;
  private parser: Parser;
  private localeCode: string;
  private vm: VM; // VM instance for maintaining state across lines

  constructor(localeCode = "en") {
    this.localeCode = localeCode;
    this.lexer = new Lexer(localeCode);
    this.registry = new ParseletRegistry();
    registerArithmeticParselets(this.registry);
    registerPercentageParselets(this.registry);
    registerFunctionParselets(this.registry);
    registerDatetimeParselets(this.registry);
    registerDiceParselets(this.registry);
    registerVariableParselets(this.registry);
    registerUomParselets(this.registry);
    registerVectorParselets(this.registry);
    registerBigIntParselets(this.registry);
    this.parser = new Parser(this.registry);
    this.vm = createVM(sharedOpRegistry);
  }

  /**
   * Unified parsing method that handles different input types and returns comprehensive results
   * with precise coordinate mapping for inline solves.
   */
  parseDocument(input: string, options: UnifiedParsingOptions = { inputType: 'markdown' }): ParsingResult {
    const lines = input.split('\n');
    const result: ParsingResult = {
      lines: [],
      totalLines: lines.length,
      errors: []
    };

    let currentPosition = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      const lineNumber = i + 1;
      const startPosition = currentPosition;
      const endPosition = startPosition + lineText.length;
      
      // Move to next line position (accounting for newline character)
      currentPosition = endPosition + 1;

      // Check if line is empty (whitespace only or only markdown markers)
      const isEmpty = this.isEmptyLine(lineText);
      
      // Find inline solves in the line
      const inlineSolves = this.findInlineSolvesInLine(lineText, lineNumber);
      const hasInlineSolves = inlineSolves.length > 0;

      let parsedLine: ParsedLine = {
        lineNumber,
        text: lineText,
        startPosition,
        endPosition,
        isEmpty,
        hasInlineSolves,
        inlineSolves,
        expression: null,
        result: null,
        error: null
      };

      if (!isEmpty) {
        // Check if this is a variable assignment (starts with colon)
        const isVariableAssignment = lineText.trim().startsWith(":");
        
        if (hasInlineSolves && !isVariableAssignment) {
          // Process each inline solve
          for (const solve of inlineSolves) {
            try {
              const value = this.evaluateLine(lineNumber, solve.expression);
              solve.result = value;
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              result.errors.push(`Line ${lineNumber}: ${errorMessage}`);
              solve.error = errorMessage;
            }
          }
        } else {
          // Process as a regular expression line
          const expression = lineText.trim();
          if (expression) {
            try {
              const value = this.evaluateLine(lineNumber, expression);
              parsedLine.expression = expression;
              parsedLine.result = value;
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              parsedLine.error = errorMessage;
              result.errors.push(`Line ${lineNumber}: ${errorMessage}`);
            }
          }
        }
      }

      result.lines.push(parsedLine);
    }

    return result;
  }

  /**
   * Check if a line is effectively empty (whitespace only or only markdown syntax)
   */
  private isEmptyLine(lineText: string): boolean {
    // Optimized regex: matches empty/whitespace-only lines OR lines containing only a markdown marker
    return /^\s*$|^\s*([#>-]|\*|\+)\s*$/.test(lineText);
  }

  /**
   * Find all inline solves in a line with precise coordinate mapping
   */
  private findInlineSolvesInLine(lineText: string, lineNumber: number): InlineSolvePosition[] {
    const results: InlineSolvePosition[] = [];
    const regex = /s`([^`]*)`/g;
    let match: RegExpExecArray | null;
    
    while ((match = regex.exec(lineText)) !== null) {
      const start = match.index;
      const expression = match[1];
      const end = start + match[0].length;
      const columnNumber = start + 1; // 1-based column number
      
      results.push({
        start,
        end,
        expression,
        lineNumber,
        columnNumber
      });
    }
    
    return results;
  }

  evaluateLine(
    lineNumber: number,
    lineText: string
  ): Value {
    const result = this.evaluateLineWithDebug(lineNumber, lineText);
    if (result.error) {
      throw new Error(result.error);
    }
    return result.value;
  }

  /**
   * Evaluate a line with debug information, supporting both regular expressions and inline solves
   */
  evaluateLineWithDebug(
    lineNumber: number,
    lineText: string
  ): { value: Value; tokens: any[]; program: any; error?: string; inlineSolve?: InlineSolvePosition } {
    // Check if this is an inline solve
    const inlineSolveMatch = lineText.match(/^s`([^`]*)`$/);
    if (inlineSolveMatch) {
      const expression = inlineSolveMatch[1];
      const result = this.evaluateExpression(expression, lineNumber);
      return {
        ...result,
        inlineSolve: {
          start: 0,
          end: lineText.length,
          expression,
          lineNumber,
          columnNumber: 1
        }
      };
    }

    // Regular expression evaluation
    return this.evaluateExpression(lineText, lineNumber);
  }

  /**
   * Core expression evaluation logic
   */
  private evaluateExpression(expression: string, lineNumber: number): { value: Value; tokens: any[]; program: any; error?: string } {
    const tokens: any[] = [];
    this.lexer.reset(expression);
    for (const t of this.lexer) {
      if (t.type === TokenTypes.WS) continue;
      if (t.type.startsWith("MD_")) continue; // Filter out markdown tokens
      tokens.push(t);
    }

    if (tokens.length === 0) {
      const v = numberValue(0);
      this.lineCache.set(lineNumber, new LineCacheEntry(v, { opcodes: [], numbers: [], strings: [] }, [], null, false));
      return { value: v, tokens, program: { opcodes: [], numbers: [], strings: [] } };
    }

    const builder = new BytecodeBuilder();
    this.parser.load(tokens);

    const reads: string[] = [];
    const writes: string[] = [];
    for (const t of tokens) {
      if (t.value.startsWith(":") && t.type === "COLON") reads.push(t.value.slice(1));
    }

    try {
      this.parser.parseExpression(0, builder);
      const program = builder.build();

      const vmUint8 = new Uint8Array(program.opcodes);
      const vmFloat64 = new Float64Array(program.numbers);
      
      // Use the shared VM instance to maintain state across lines
      const result = executeBytecode(
        { opcodes: vmUint8, numbers: vmFloat64, strings: program.strings },
        this.vm
      );

      if (result) {
        this.dag.registerLine(lineNumber, reads, writes);
        this.lineCache.set(lineNumber, new LineCacheEntry(
          result,
          program,
          reads,
          writes.length > 0 ? writes[0] : null,
          false
        ));
      }

      return { value: result!, tokens, program };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { value: numberValue(0), tokens, program: { opcodes: [], numbers: [], strings: [] }, error: errorMessage };
    }
  }

  reEvaluateLine(lineNumber: number): Value | undefined {
    const entry = this.lineCache.get(lineNumber);
    if (!entry) return undefined;

    const program = entry.bytecode;
    const vmUint8 = new Uint8Array(program.opcodes);
    const vmFloat64 = new Float64Array(program.numbers);
    const vm = createVM(sharedOpRegistry);

    const result = executeBytecode(
      { opcodes: vmUint8, numbers: vmFloat64, strings: program.strings },
      vm
    );

    if (result) {
      entry.result = result;
      this.lineCache.markClean(lineNumber);
    }

    return result;
  }

  markDirtyFromVariable(variable: string): void {
    const affected = this.dag.getAffectedLines(variable);
    for (const line of affected) {
      this.lineCache.markDirty(line);
    }
  }

  getDag(): DependencyGraph {
    return this.dag;
  }

  getLineCache(): LineCache {
    return this.lineCache;
  }

  getScopeManager(): ScopeManager {
    return this.scopeManager;
  }

  getLexer(): Lexer {
    return this.lexer;
  }

  getParser(): Parser {
    return this.parser;
  }

  getMemoCache(): MemoCache {
    return this.memoCache;
  }

  /**
   * Get the parselet type for a given expression
   * This is used by the playground to display which parselet handled the expression
   */
  getParseletType(expression: string): string {
    const tokens: any[] = [];
    this.lexer.reset(expression);
    for (const t of this.lexer) {
      if (t.type === TokenTypes.WS) continue;
      if (t.type.startsWith("MD_")) continue;
      tokens.push(t);
    }

    if (tokens.length === 0) return 'Expression';

    // Check for specific token types that indicate the parselet
    for (const t of tokens) {
      if (t.type === 'PERCENT') return 'Percentage';
      if (t.type === 'UNIT') return 'UoM';
      if (t.type === 'CONVERT' || t.type === 'TO' || t.type === 'BEST') return 'UoM';
      if (t.type === 'FUNC') return 'Function';
      if (t.type === 'ROLL') return 'Dice';
      if (t.type === 'NOW' || t.type === 'TODAY' || t.type === 'TOMORROW' || t.type === 'YESTERDAY') return 'Date/Time';
      if (t.type === 'VEC2' || t.type === 'VEC3' || t.type === 'VEC4') return 'Vector';
      if (t.type === 'BIGINT') return 'BigInt';
      if (t.type === 'COLON' || t.type === 'EQUALS') return 'Variable';
      if (t.type === 'INCREASE' || t.type === 'DECREASE' || t.type === 'INCREASE_BY' || t.type === 'DECREASE_BY') return 'Percentage';
    }

    if (tokens.some(t => t.type === 'NUMBER')) return 'Arithmetic';
    if (tokens.some(t => t.type === 'PI' || t.type === 'E')) return 'Arithmetic';
    return 'Expression';
  }

  clear(): void {
    this.dag.clear();
    this.lineCache.clear();
    this.scopeManager.clear();
    this.memoCache.clear();
  }
}
