export { Lexer, sharedLexer, LexerState } from "./lexer";
export type { Token, LexerPlugin, PhraseEntry } from "./lexer";
export { TokenTypes, type TokenType } from "./lexer";
export { TokenRegistry, sharedTokenRegistry } from "./lexer/registry/TokenRegistry";

export { Parser } from "./parser";
export { BytecodeBuilder } from "./parser/BytecodeBuilder";
export type { BytecodeProgram } from "./parser/BytecodeBuilder";
export { OpCode, getOpCodeName } from "./parser/OpCode";
export { BindingPower } from "./parser/BindingPower";
export { ParseletRegistry, sharedParseletRegistry } from "./parser/registry/ParseletRegistry";
export type { PrefixParselet, InfixParselet } from "./parser/Parselet";

export { Value, ValueType, numberValue, stringValue, bigIntValue, hexValue, uomValue, vectorValue } from "./vm/Value";
export { createVM, executeBytecode } from "./vm/VM";
export type { Bytecode } from "./vm/VM";
export { builtinFunctions } from "./vm/VMBuiltins";
export { unifyUom, binaryOp } from "./vm/VMConversion";
export { OpRegistry, sharedOpRegistry } from "./vm/OpRegistry";
export type { OpcodeHandler, IOpcodeHandlerRegistration, VM } from "./vm/OpRegistry";

export { ExpressionEngine } from "./engine/ExpressionEngine";
export { checkExpressionLength, checkExpressionComplexity, extractReadsAndWrites, isEmptyLine, findInlineSolvesInLine } from "./engine/ExpressionEngineSafety";
export type { ValidationConfig, SafetyCheckResult } from "./engine/ExpressionEngineSafety";
export { Solve, solve } from "./api/SolveAPI";
export type { ISolve, ISolvePackage } from "./api/SolveAPI";

export { GrammarDSL, createGrammarDSL } from "./compiler/GrammarDSL";

export { LineCache, LineCacheEntry } from "./cache/LineCache";
export { DependencyGraph } from "./vm/DependencyGraph";
export { ScopeManager } from "./vm/ScopeManager";
// MemoCache consolidated into LineCache — removed from exports
export type { ExpressionRecord } from "./vm/ScopeManager";

export { DiagnosticPipeline } from "./diagnostics/pipeline";
export { NullDiagnosticCollector } from "./diagnostics/null-collector";
export { TimelineDiagnosticCollector } from "./diagnostics/timeline-collector";
export type {
  DiagnosticEvent,
  DiagnosticReport,
  CategorizedParselet,
} from "./diagnostics/events";

export { VariableResolver, sharedVariableResolver } from "./variables/VariableResolver";
export type { IVariableSource } from "./variables/IVariableSource";
