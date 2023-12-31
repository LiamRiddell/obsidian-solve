// AUTOGENERATED FILE
// This file was generated from Dice.ohm by `ohm generateBundles`.

import {
  BaseActionDict,
  Grammar,
  IterationNode,
  Node,
  NonterminalNode,
  Semantics,
  TerminalNode
} from 'ohm-js';

export interface DiceActionDict<T> extends BaseActionDict<T> {
  Expression?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  Roll?: (this: NonterminalNode, arg0: NonterminalNode, arg1: IterationNode, arg2: NonterminalNode, arg3: IterationNode, arg4: NonterminalNode, arg5: IterationNode) => T;
  Primitive_positive?: (this: NonterminalNode, arg0: TerminalNode, arg1: NonterminalNode) => T;
  Primitive_negative?: (this: NonterminalNode, arg0: TerminalNode, arg1: NonterminalNode) => T;
  Primitive?: (this: NonterminalNode, arg0: NonterminalNode) => T;
  rollOpen?: (this: NonterminalNode, arg0: NonterminalNode | TerminalNode) => T;
  rollSeperator?: (this: NonterminalNode, arg0: NonterminalNode | TerminalNode) => T;
  rollEnd?: (this: NonterminalNode, arg0: TerminalNode) => T;
  number_fract?: (this: NonterminalNode, arg0: IterationNode, arg1: TerminalNode, arg2: IterationNode) => T;
  number_whole?: (this: NonterminalNode, arg0: IterationNode) => T;
  number?: (this: NonterminalNode, arg0: NonterminalNode) => T;
}

export interface DiceSemantics extends Semantics {
  addOperation<T>(name: string, actionDict: DiceActionDict<T>): this;
  extendOperation<T>(name: string, actionDict: DiceActionDict<T>): this;
  addAttribute<T>(name: string, actionDict: DiceActionDict<T>): this;
  extendAttribute<T>(name: string, actionDict: DiceActionDict<T>): this;
}

export interface DiceGrammar extends Grammar {
  createSemantics(): DiceSemantics;
  extendSemantics(superSemantics: DiceSemantics): DiceSemantics;
}

declare const grammar: DiceGrammar;
export default grammar;

