export { Lexer, sharedLexer, LexerState } from "./lexer";
export type { Token } from "./lexer";
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
export { OpRegistry, sharedOpRegistry } from "./vm/OpRegistry";
export type { OpcodeHandler, IOpcodeHandlerRegistration, VM } from "./vm/OpRegistry";

export { ExpressionEngine } from "./engine/ExpressionEngine";
export { Solve, solve } from "./api/SolveAPI";
export type { ISolve, ISolvePackage } from "./api/SolveAPI";

export { GrammarDSL, createGrammarDSL } from "./compiler/GrammarDSL";

export { LineCache, LineCacheEntry } from "./cache/LineCache";
export { DependencyGraph } from "./vm/DependencyGraph";
export { ScopeManager } from "./vm/ScopeManager";
export { MemoCache } from "./vm/MemoCache";
export type { ExpressionRecord } from "./vm/ScopeManager";

export { VariableResolver, sharedVariableResolver } from "./variables/VariableResolver";
export type { IVariableSource } from "./variables/IVariableSource";
