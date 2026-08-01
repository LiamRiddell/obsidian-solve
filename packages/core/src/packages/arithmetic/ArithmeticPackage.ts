import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { BindingPower } from "@solve-js/parser/BindingPower";
import { OpCode } from "@solve-js/parser/OpCode";
import { NumberParselet } from "./parselets/NumberParselet";
import { PrefixOpParselet } from "./parselets/PrefixOpParselet";
import { BinaryOpParselet } from "./parselets/BinaryOpParselet";
import { GroupParselet } from "./parselets/GroupParselet";
import { ConstantParselet } from "./parselets/ConstantParselet";
import { largeNumberSuffixNormalizerRule } from "./normalizer/LargeNumberSuffixNormalizerRule";

/** Core arithmetic: numbers, `()` grouping, `pi`/`e` constants, `+ - * / % ^`, bitwise `<< >> & | ^`, and their `*_by` word forms. */
export const ARITHMETIC_PACKAGE: IEnginePackage = {
  name: "solve-arithmetic",
  prefixParselets: [
    { tokenType: "NUMBER", parselet: new NumberParselet() },
    { tokenType: "LPAREN", parselet: new GroupParselet() },
    { tokenType: "PI", parselet: new ConstantParselet() },
    { tokenType: "E", parselet: new ConstantParselet() },
    { tokenType: "PLUS", parselet: new PrefixOpParselet(OpCode.POS) },
    { tokenType: "MINUS", parselet: new PrefixOpParselet(OpCode.NEG) },
  ],
  infixParselets: [
    { tokenType: "PLUS", parselet: new BinaryOpParselet(BindingPower.Sum, OpCode.ADD) },
    { tokenType: "MINUS", parselet: new BinaryOpParselet(BindingPower.Sum, OpCode.SUB) },
    { tokenType: "STAR", parselet: new BinaryOpParselet(BindingPower.Product, OpCode.MUL) },
    { tokenType: "SLASH", parselet: new BinaryOpParselet(BindingPower.Product, OpCode.DIV) },
    { tokenType: "MOD", parselet: new BinaryOpParselet(BindingPower.Product, OpCode.MOD) },
    { tokenType: "CARET", parselet: new BinaryOpParselet(BindingPower.Exponent, OpCode.EXP) },
    { tokenType: "TIMES_BY", parselet: new BinaryOpParselet(BindingPower.Product, OpCode.MUL) },
    { tokenType: "MULTIPLY_BY", parselet: new BinaryOpParselet(BindingPower.Product, OpCode.MUL) },
    { tokenType: "DIVIDE_BY", parselet: new BinaryOpParselet(BindingPower.Product, OpCode.DIV) },
    { tokenType: "LSHIFT", parselet: new BinaryOpParselet(BindingPower.Sum, OpCode.LSHIFT) },
    { tokenType: "RSHIFT", parselet: new BinaryOpParselet(BindingPower.Sum, OpCode.RSHIFT) },
    { tokenType: "BIT_AND", parselet: new BinaryOpParselet(BindingPower.Product, OpCode.BIT_AND) },
    { tokenType: "BIT_OR", parselet: new BinaryOpParselet(BindingPower.Sum, OpCode.BIT_OR) },
    { tokenType: "BIT_XOR", parselet: new BinaryOpParselet(BindingPower.BitwiseXor, OpCode.BIT_XOR) },
  ],
  normalizerRules: [largeNumberSuffixNormalizerRule()],
};
