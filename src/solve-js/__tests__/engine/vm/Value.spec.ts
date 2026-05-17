import { describe, expect, test } from "@jest/globals";
import { ValueType, numberValue, stringValue, bigIntValue, hexValue, vectorValue, uomValue } from "@solve-js/vm/Value";

describe("Value", () => {
  test("numberValue creates number type", () => {
    const v = numberValue(42);
    expect(v.type).toBe(ValueType.Number);
    expect(v.value).toBe(42);
    expect(v.isNumber()).toBe(true);
    expect(v.toNumber()).toBe(42);
  });

test("stringValue creates string type", () => {
     const v = stringValue("hello");
     expect(v.type).toBe(ValueType.String);
     expect(v.value).toBe("hello");
     expect(v.isString()).toBe(true);
     expect(v.toNumber()).toBe(0);
   });

  test("hexValue creates hex type", () => {
    const v = hexValue(255);
    expect(v.type).toBe(ValueType.Hex);
    expect(v.value).toBe(255);
    expect(v.isHex()).toBe(true);
    expect(v.toNumber()).toBe(255);
  });

  test("bigIntValue creates bigint type", () => {
    const v = bigIntValue(BigInt(9007199254740991));
    expect(v.type).toBe(ValueType.BigInt);
    expect(v.value).toBe(BigInt(9007199254740991));
    expect(v.isBigInt()).toBe(true);
    expect(v.toNumber()).toBe(9007199254740991);
  });

  test("vectorValue creates vector types by dimension", () => {
    const v2 = vectorValue([1, 2]);
    expect(v2.type).toBe(ValueType.Vector2);
    expect(v2.isVector()).toBe(true);
    expect(v2.value).toEqual([1, 2]);

    const v3 = vectorValue([1, 2, 3]);
    expect(v3.type).toBe(ValueType.Vector3);
    expect(v3.isVector()).toBe(true);

    const v4 = vectorValue([1, 2, 3, 4]);
    expect(v4.type).toBe(ValueType.Vector4);
    expect(v4.isVector()).toBe(true);
  });

  test("uomValue creates uom type with unit", () => {
    const v = uomValue(100, "USD");
    expect(v.type).toBe(ValueType.Uom);
    expect(v.value).toBe(100);
    expect(v.unit).toBe("USD");
  });

  test("toNumber converts numeric string", () => {
    const v = stringValue("42.5");
    expect(v.toNumber()).toBe(42.5);
  });

test("toNumber returns 0 for non-numeric string", () => {
     const v = stringValue("hello");
     expect(v.toNumber()).toBe(0);
   });
});
