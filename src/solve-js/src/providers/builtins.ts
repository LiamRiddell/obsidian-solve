/**
 * Built-in provider packages.
 *
 * Each provider is registered as an ISolvePackage so internal and external
 * packages use the same registration system. This enables:
 * - Selective disable of built-in providers
 * - External packages to replace/extend built-in ones
 * - Package introspection via PluginManager
 */
import type { ISolvePackage } from "@solve-js/api/SolveAPI";
import { BindingPower } from "@solve-js/parser/BindingPower";
import { OpCode } from "@solve-js/parser/OpCode";

// ── Arithmetic ────────────────────────────────────────────────────────────
import { NumberParselet } from "./arithmetic/parselets/NumberParselet";
import { PrefixOpParselet } from "./arithmetic/parselets/PrefixOpParselet";
import { BinaryOpParselet } from "./arithmetic/parselets/BinaryOpParselet";
import { GroupParselet } from "./arithmetic/parselets/GroupParselet";
import { ConstantParselet } from "./arithmetic/parselets/ConstantParselet";

export const ARITHMETIC_PACKAGE: ISolvePackage = {
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
};

// ── Percentage ────────────────────────────────────────────────────────────
import { PercentParselet } from "./percentage/parselets/PercentParselet";
import { OfParselet } from "./percentage/parselets/OfParselet";
import { IncreaseDecreaseParselet } from "./percentage/parselets/IncreaseDecreaseParselet";
import { PercentageChangeParselet } from "./percentage/parselets/PercentageChangeParselet";

export const PERCENTAGE_PACKAGE: ISolvePackage = {
  name: "solve-percentage",
  infixParselets: [
    { tokenType: "PERCENT", parselet: new PercentParselet() },
    { tokenType: "OF", parselet: new OfParselet() },
    { tokenType: "TO", parselet: new PercentageChangeParselet() },
  ],
  prefixParselets: [
    { tokenType: "INCREASE", parselet: new IncreaseDecreaseParselet(1) },
    { tokenType: "DECREASE", parselet: new IncreaseDecreaseParselet(-1) },
  ],
};

// ── Function ──────────────────────────────────────────────────────────────
import { FunctionCallParselet } from "./function/parselets/FunctionCallParselet";

export const FUNCTION_PACKAGE: ISolvePackage = {
  name: "solve-function",
  prefixParselets: [
    { tokenType: "FUNC", parselet: new FunctionCallParselet() },
  ],
};

// ── Datetime ──────────────────────────────────────────────────────────────
import { NowParselet } from "./datetime/parselets/NowParselet";
import { NextLastParselet } from "./datetime/parselets/NextLastParselet";

export const DATETIME_PACKAGE: ISolvePackage = {
  name: "solve-datetime",
  prefixParselets: [
    { tokenType: "NOW", parselet: new NowParselet() },
    { tokenType: "TODAY", parselet: new NowParselet() },
    { tokenType: "TOMORROW", parselet: new NowParselet() },
    { tokenType: "YESTERDAY", parselet: new NowParselet() },
    { tokenType: "NEXT", parselet: new NextLastParselet(7) },
    { tokenType: "LAST", parselet: new NextLastParselet(-7) },
  ],
};

// ── Dice ──────────────────────────────────────────────────────────────────
import { DiceRollParselet } from "./dice/parselets/DiceRollParselet";

export const DICE_PACKAGE: ISolvePackage = {
  name: "solve-dice",
  prefixParselets: [
    { tokenType: "ROLL", parselet: new DiceRollParselet() },
  ],
};

// ── Variables ─────────────────────────────────────────────────────────────
import { VariableParselet } from "./variables/parselets/VariableParselet";
import { IdentifierParselet } from "./variables/parselets/IdentifierParselet";

export const VARIABLES_PACKAGE: ISolvePackage = {
  name: "solve-variables",
  prefixParselets: [
    { tokenType: "COLON", parselet: new VariableParselet() },
    { tokenType: "IDENT", parselet: new IdentifierParselet() },
    // UNIT tokens in prefix position (standalone or after operators) are
    // resolved as variable references via LOAD_VAR, same as IDENT tokens.
    // This handles cases like `a + b` where "b" is classified as UNIT
    // because it collides with a known unit (e.g., "b" = bits).
    { tokenType: "UNIT", parselet: new IdentifierParselet() },
  ],
};

// ── UOM (Units of Measurement) ───────────────────────────────────────────
import { UomLiteralParselet } from "./uom/parselets/UomLiteralParselet";
import { ConvertParselet } from "./uom/parselets/ConvertParselet";

export const UOM_PACKAGE: ISolvePackage = {
  name: "solve-uom",
  prefixParselets: [
    { tokenType: "CONVERT", parselet: new ConvertParselet() },
  ],
  infixParselets: [
    { tokenType: "UNIT", parselet: new UomLiteralParselet() },
  ],
};

// ── Currency ──────────────────────────────────────────────────────────────
import { CurrencySymbolParselet } from "./uom/parselets/CurrencySymbolParselet";
import { InParselet } from "./uom/parselets/InParselet";
import { CurrencyAsyncResolver } from "@solve-js/uom/CurrencyResolver";

export const CURRENCY_PACKAGE: ISolvePackage = {
  name: "solve-currency",
  asyncResolvers: [new CurrencyAsyncResolver()],
  prefixParselets: [
    { tokenType: "DOLLAR", parselet: new CurrencySymbolParselet() },
    { tokenType: "POUND", parselet: new CurrencySymbolParselet() },
    { tokenType: "EURO", parselet: new CurrencySymbolParselet() },
  ],
  infixParselets: [
    { tokenType: "IN", parselet: new InParselet() },
  ],
};

// ── Vector ────────────────────────────────────────────────────────────────
import { VectorParselet } from "./vector/parselets/VectorParselet";
import { FloatParselet } from "./vector/parselets/FloatParselet";

export const VECTOR_PACKAGE: ISolvePackage = {
  name: "solve-vector",
  prefixParselets: [
    { tokenType: "VEC2", parselet: new VectorParselet(2) },
    { tokenType: "VEC3", parselet: new VectorParselet(3) },
    { tokenType: "VEC4", parselet: new VectorParselet(4) },
    { tokenType: "FLOAT", parselet: new FloatParselet() },
  ],
};

// ── BigInteger ────────────────────────────────────────────────────────────
import { BigIntNumberParselet } from "./biginteger/parselets/BigIntNumberParselet";

export const BIGINT_PACKAGE: ISolvePackage = {
  name: "solve-bigint",
  prefixParselets: [
    { tokenType: "BIGINT", parselet: new BigIntNumberParselet() },
  ],
};

// ── OSRS bare-item-name / keyword support (normalizer + parselet + opcode approach) ──
import { OSRS_PACKAGE } from "@solve-js/packages/osrs";

// ── All built-in packages (registration order matters: arithmetic first) ──
export const BUILTIN_PACKAGES: ISolvePackage[] = [
  ARITHMETIC_PACKAGE,
  PERCENTAGE_PACKAGE,
  FUNCTION_PACKAGE,
  DATETIME_PACKAGE,
  DICE_PACKAGE,
  VARIABLES_PACKAGE,
  UOM_PACKAGE,
  CURRENCY_PACKAGE,
  VECTOR_PACKAGE,
  BIGINT_PACKAGE,
  OSRS_PACKAGE,
];
