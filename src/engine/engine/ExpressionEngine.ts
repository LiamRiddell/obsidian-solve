import { Value, numberValue } from "@/engine/vm/Value";
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

export class ExpressionEngine {
  private dag = new DependencyGraph();
  private lineCache = new LineCache();
  private scopeManager = new ScopeManager();
  private memoCache = new MemoCache();
  private lexer = new Lexer();
  private registry: ParseletRegistry;
  private parser: Parser;

  constructor() {
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
  }

  evaluateLine(
    lineNumber: number,
    lineText: string
  ): Value {
    const tokens: any[] = [];
    this.lexer.reset(lineText);
    for (const t of this.lexer) {
      if (t.type === TokenTypes.WS) continue;
      tokens.push(t);
    }

    if (tokens.length === 0) {
      const v = numberValue(0);
      this.lineCache.set(lineNumber, new LineCacheEntry(v, { opcodes: [], numbers: [], strings: [] }, [], null, false));
      return v;
    }

    const builder = new BytecodeBuilder();
    this.parser.load(tokens);

    const reads: string[] = [];
    const writes: string[] = [];
    for (const t of tokens) {
      if (t.value.startsWith(":") && t.type === "COLON") reads.push(t.value.slice(1));
    }

    this.parser.parseExpression(0, builder);
    const program = builder.build();

    const vmUint8 = new Uint8Array(program.opcodes);
    const vmFloat64 = new Float64Array(program.numbers);
    const vm = createVM(sharedOpRegistry);

    const memoized = this.memoCache.getOrCompute(lineText, lineNumber, () => {
      const result = executeBytecode(
        { opcodes: vmUint8, numbers: vmFloat64, strings: program.strings },
        vm
      );
      return result!;
    });

    this.dag.registerLine(lineNumber, reads, writes);
    this.lineCache.set(lineNumber, new LineCacheEntry(
      memoized,
      program,
      reads,
      writes.length > 0 ? writes[0] : null,
      false
    ));

    return memoized;
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

  getMemoCache(): MemoCache {
    return this.memoCache;
  }

  clear(): void {
    this.dag.clear();
    this.lineCache.clear();
    this.scopeManager.clear();
    this.memoCache.clear();
  }
}