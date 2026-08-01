/**
 * UOM — "sourceUnit to ?" conversion-possibilities query (wiki:
 * Units-Of-Measurement — "Explore what units a particular unit can be
 * converted into"). Previously entirely unimplemented: QUESTION was a
 * lexed token type with no parselet anywhere, so "cm to ?" silently
 * dropped the trailing "?" and fell through to a plain UOM_CONVERT.
 */

import { registerPackageForTesting } from "@tools/testUtils";
import { ARITHMETIC_PACKAGE, UOM_PACKAGE } from "@solve-js/packages";
import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@solve-js/lexer/Lexer";
import { TokenTypes } from "@solve-js/lexer/Token";
import { Parser } from "@solve-js/parser/Parser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";

import { createVM, executeBytecode, unwrapEvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { Value, ValueType } from "@solve-js/vm/Value";
import { TokenNormalizer } from "@solve-js/normalizer";
import { uomPossibilitiesNormalizerRule } from "@solve-js/packages/uom/normalizer/PossibilitiesNormalizerRule";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { getConvertiblePossibilities } from "@solve-js/uom/UomConverter";

const normalizer = new TokenNormalizer();
normalizer.register(uomPossibilitiesNormalizerRule());

function tokenize(lexer: Lexer, input: string) {
  lexer.reset(input);
  const tokens = [];
  for (const t of lexer) {
    if (t.type === TokenTypes.WS || t.type === "NEWLINE") continue;
    tokens.push(t);
  }
  return tokens;
}

function parseAndExecute(input: string): Value {
  const lexer = new Lexer();
  const rawTokens = tokenize(lexer, input);
  const tokens = normalizer.normalize(rawTokens);
  const registry = new ParseletRegistry();
  registerPackageForTesting(ARITHMETIC_PACKAGE, registry);
  registerPackageForTesting(UOM_PACKAGE, registry);
  const parser = new Parser(registry);
  const builder = new BytecodeBuilder();
  parser.load(tokens);
  parser.parseExpression(0, builder);
  const program = builder.build();
  const vmUint8 = new Uint8Array(program.opcodes);
  const vmFloat64 = new Float64Array(program.numbers);
  const vm = createVM(sharedOpRegistry);
  const result = executeBytecode(
    { opcodes: vmUint8, numbers: vmFloat64, strings: program.strings },
    vm
  );
  return unwrapEvalResult(result);
}

describe("sourceUnit to ? — conversion possibilities (isolated registry)", () => {
  test("cm to ? returns a String value", () => {
    const result = parseAndExecute("cm to ?");
    expect(result.type).toBe(ValueType.String);
  });

  test("cm to ? lists other length units, not itself", () => {
    const result = parseAndExecute("cm to ?");
    const list = result.value as string;
    expect(list).toContain("m");
    expect(list).toContain("mm");
    expect(list.split(",").map((s) => s.trim())).not.toContain("cm");
  });

  test("kg to ? lists mass units", () => {
    const result = parseAndExecute("kg to ?");
    const list = result.value as string;
    expect(list).toContain("g");
    expect(list).toContain("lb");
  });

});

describe("getConvertiblePossibilities — unrecognized unit", () => {
  // A bare unrecognized word can never actually reach UOM_POSSIBILITIES
  // through the full pipeline (it wouldn't lex as a UNIT token at all,
  // so the normalizer rule never fires and the fused prefix token never
  // exists) — but the VM opcode handler still calls this function
  // directly and must degrade gracefully if it's ever handed one.
  test("returns an empty array instead of throwing", () => {
    expect(getConvertiblePossibilities("bogusunit")).toEqual([]);
  });
});

describe("UOM_PACKAGE — real engine wiring", () => {
  test("cm to ? works via the real, default-constructed ExpressionEngine", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("cm to ?");
    expect(value.type).toBe(ValueType.String);
    expect(value.value as string).toContain("mm");
  });

  test("10 cm to m still converts normally (no regression from the ? handling)", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("10 cm to m");
    expect(value.type).toBe(ValueType.Uom);
    expect(value.toNumber()).toBeCloseTo(0.1);
  });
});
