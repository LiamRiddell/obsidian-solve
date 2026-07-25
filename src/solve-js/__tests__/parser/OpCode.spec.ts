import { describe, expect, test } from "@jest/globals";
import { OpCode, getOpCodeName } from "@solve-js/parser/OpCode";

describe("getOpCodeName", () => {
  test("returns the correct name for every declared OpCode value", () => {
    for (const [key, value] of Object.entries(OpCode)) {
      if (typeof value !== "number") continue;
      expect(getOpCodeName(value)).toBe(key);
    }
  });

  test("returns a specific known mapping", () => {
    expect(getOpCodeName(OpCode.ADD)).toBe("ADD");
    expect(getOpCodeName(OpCode.HALT)).toBe("HALT");
  });

  test("returns UNKNOWN_<value> for a value with no matching OpCode", () => {
    expect(getOpCodeName(9999)).toBe("UNKNOWN_9999");
    expect(getOpCodeName(-1)).toBe("UNKNOWN_-1");
  });
});
