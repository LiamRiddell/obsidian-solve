export { DependencyGraph } from "./DependencyGraph";
export { ScopeManager } from "./ScopeManager";
export { MemoCache } from "./MemoCache";
export { Value, ValueType, numberValue, hexValue, bigIntValue, stringValue, uomValue, vectorValue } from "./Value";
export { createVM, executeBytecode } from "./VM";
export type { Bytecode } from "./VM";
export { OpRegistry, sharedOpRegistry } from "./OpRegistry";
export type { OpcodeHandler, IOpcodeHandlerRegistration, VM } from "./OpRegistry";
export type { ExpressionRecord } from "./ScopeManager";
