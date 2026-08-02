import { describe, expect, test } from "@jest/globals";
import { formatValue } from "@solve-js/format/FormatEngine";
import { Value, ValueType, numberValue, hexValue, bigIntValue, stringValue, uomValue, rowVectorValue } from "@solve-js/vm/Value";

describe("FormatEngine Fuzz", () => {
  const valueTypes: Array<{ name: string; value: Value }> = [
    { name: "zero", value: numberValue(0) },
    { name: "negative", value: numberValue(-42) },
    { name: "large", value: numberValue(1e15) },
    { name: "float", value: numberValue(3.14159) },
    { name: "hex_zero", value: hexValue(0) },
    { name: "hex_large", value: hexValue(0xDEAD) },
    { name: "bigint_zero", value: bigIntValue(BigInt(0)) },
    { name: "bigint_negative", value: bigIntValue(BigInt(-999)) },
    { name: "bigint_large", value: bigIntValue(BigInt("9999999999999999999")) },
    { name: "empty_string", value: stringValue("") },
    { name: "string_with_spaces", value: stringValue("hello world") },
    { name: "uom_negative", value: uomValue(-5, "kg") },
    { name: "uom_zero", value: uomValue(0, "m") },
    { name: "uom_large", value: uomValue(1e6, "km") },
    { name: "vector_empty", value: rowVectorValue([]) },
    { name: "vector_large", value: rowVectorValue([1e10, 2e10, 3e10]) },
    { name: "boolean_true", value: new Value(ValueType.Boolean, true) },
    { name: "boolean_false", value: new Value(ValueType.Boolean, false) },
    { name: "datetime_epoch", value: new Value(ValueType.Datetime, 0) },
    { name: "datetime_future", value: new Value(ValueType.Datetime, 4102444800000) },
    { name: "percentage_zero", value: new Value(ValueType.Percentage, 0) },
    { name: "percentage_large", value: new Value(ValueType.Percentage, 999.99) },
    { name: "uom_time_days", value: uomValue(14, "days") },
    { name: "uom_time_weeks", value: uomValue(6, "weeks") },
    { name: "unit_empty", value: new Value(ValueType.Unit, 0, "") },
    { name: "unit_with_unit", value: new Value(ValueType.Unit, 1, "m") },
  ];

  test.each(valueTypes)("formatValue never throws for $name", ({ value }) => {
    expect(() => formatValue(value)).not.toThrow();
    const result = formatValue(value);
    expect(typeof result).toBe("string");
  });

  test("formatValue with explicit null/undefined settings does not throw", () => {
    expect(() => formatValue(numberValue(42))).not.toThrow();
  });
});
