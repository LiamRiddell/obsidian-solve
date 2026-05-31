/**
 * FormatEngine — TimeSpan Formatting Tests
 *
 * Tests the formatting of UOM-based timespan values (days, weeks, hours).
 */

import { describe, expect, test } from "@jest/globals";
import { formatValue } from "@solve-js/format/FormatEngine";
import { uomValue } from "@solve-js/vm/Value";

describe("FormatEngine TimeSpan Formatting", () => {
  test("formats TimeSpan (Uom) with unit correctly", () => {
    const value = uomValue(14, "days");
    const result = formatValue(value);
    expect(result).toBe("= 14 days");
  });

  test("formats TimeSpan (Uom) with weeks correctly", () => {
    const value = uomValue(6, "weeks");
    const result = formatValue(value);
    expect(result).toBe("= 6 weeks");
  });

  test("formats TimeSpan (Uom) with hours correctly", () => {
    const value = uomValue(2, "hours");
    const result = formatValue(value);
    expect(result).toBe("= 2 hours");
  });
});
