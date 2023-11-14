// AUTOGENERATED FILE
// This file was generated from FunctionArithmetic.ohm by `ohm generateBundles`.

import {
  BaseActionDict,
  Grammar,
  IterationNode,
  Namespace,
  Node,
  NonterminalNode,
  Semantics,
  TerminalNode
} from 'ohm-js';

export interface BasicArithmeticActionDict<T> extends BaseActionDict<T> {
  Expression?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  LogicalShift_left?: (this: NonterminalNode, arg0: NonterminalNode, arg1: TerminalNode, arg2: NonterminalNode) => T;
  LogicalShift_right?: (this: NonterminalNode, arg0: NonterminalNode, arg1: TerminalNode, arg2: NonterminalNode) => T;
  LogicalShift?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  AS_addition?: (this: NonterminalNode, arg0: NonterminalNode, arg1: NonterminalNode, arg2: NonterminalNode) => T;
  AS_subtraction?: (this: NonterminalNode, arg0: NonterminalNode, arg1: NonterminalNode, arg2: NonterminalNode) => T;
  AS?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  MD_multiplication?: (this: NonterminalNode, arg0: NonterminalNode, arg1: NonterminalNode, arg2: NonterminalNode) => T;
  MD_division?: (this: NonterminalNode, arg0: NonterminalNode, arg1: NonterminalNode, arg2: NonterminalNode) => T;
  MD_modulo?: (this: NonterminalNode, arg0: NonterminalNode, arg1: NonterminalNode, arg2: NonterminalNode) => T;
  MD?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  E_exponent?: (this: NonterminalNode, arg0: NonterminalNode, arg1: NonterminalNode, arg2: NonterminalNode) => T;
  E?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  P_parenthesis?: (this: NonterminalNode, arg0: TerminalNode, arg1: NonterminalNode, arg2: TerminalNode) => T;
  P?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  Primitive_positive?: (this: NonterminalNode, arg0: TerminalNode, arg1: NonterminalNode) => T;
  Primitive_negative?: (this: NonterminalNode, arg0: TerminalNode, arg1: NonterminalNode) => T;
  Primitive?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  add?: (this: NonterminalNode, arg0: NonterminalNode | TerminalNode) => T;
  subtract?: (this: NonterminalNode, arg0: NonterminalNode | TerminalNode) => T;
  multiply?: (this: NonterminalNode, arg0: NonterminalNode | TerminalNode) => T;
  divide?: (this: NonterminalNode, arg0: NonterminalNode | TerminalNode) => T;
  modulo?: (this: NonterminalNode, arg0: NonterminalNode | TerminalNode) => T;
  exponent?: (this: NonterminalNode, arg0: NonterminalNode | TerminalNode) => T;
  constant?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  number_fract?: (this: NonterminalNode, arg0: IterationNode, arg1: TerminalNode, arg2: IterationNode) => T;
  number_whole?: (this: NonterminalNode, arg0: IterationNode) => T;
  number?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  hex?: (this: NonterminalNode, arg0: IterationNode | TerminalNode, arg1: IterationNode | TerminalNode) => T;
}

export interface BasicArithmeticSemantics extends Semantics {
  addOperation<T>(name: string, actionDict: BasicArithmeticActionDict<T>): this;
  extendOperation<T>(name: string, actionDict: BasicArithmeticActionDict<T>): this;
  addAttribute<T>(name: string, actionDict: BasicArithmeticActionDict<T>): this;
  extendAttribute<T>(name: string, actionDict: BasicArithmeticActionDict<T>): this;
}

export interface BasicArithmeticGrammar extends Grammar {
  createSemantics(): BasicArithmeticSemantics;
  extendSemantics(superSemantics: BasicArithmeticSemantics): BasicArithmeticSemantics;
}

export interface FunctionArithmeticActionDict<T> extends BasicArithmeticActionDict<T> {
  P_parenthesis?: (this: NonterminalNode, arg0: TerminalNode, arg1: NonterminalNode, arg2: TerminalNode) => T;
  P?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  Function?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  LogBaseFunction?: (this: NonterminalNode, arg0: NonterminalNode, arg1: TerminalNode, arg2: NonterminalNode, arg3: TerminalNode, arg4: NonterminalNode, arg5: TerminalNode) => T;
  DegreesToRadians?: (this: NonterminalNode, arg0: NonterminalNode, arg1: TerminalNode, arg2: NonterminalNode, arg3: TerminalNode) => T;
  RadiansToDegrees?: (this: NonterminalNode, arg0: NonterminalNode, arg1: TerminalNode, arg2: NonterminalNode, arg3: TerminalNode) => T;
  JavascriptMathObjectFunction?: (this: NonterminalNode, arg0: NonterminalNode, arg1: TerminalNode, arg2: NonterminalNode, arg3: TerminalNode) => T;
  mathJsName?: (this: NonterminalNode, arg0: NonterminalNode) => T;
}

export interface FunctionArithmeticSemantics extends Semantics {
  addOperation<T>(name: string, actionDict: FunctionArithmeticActionDict<T>): this;
  extendOperation<T>(name: string, actionDict: FunctionArithmeticActionDict<T>): this;
  addAttribute<T>(name: string, actionDict: FunctionArithmeticActionDict<T>): this;
  extendAttribute<T>(name: string, actionDict: FunctionArithmeticActionDict<T>): this;
}

export interface FunctionArithmeticGrammar extends Grammar {
  createSemantics(): FunctionArithmeticSemantics;
  extendSemantics(superSemantics: FunctionArithmeticSemantics): FunctionArithmeticSemantics;
}

declare const ns: {
  BasicArithmetic: BasicArithmeticGrammar;
  FunctionArithmetic: FunctionArithmeticGrammar;
};
export default ns;

