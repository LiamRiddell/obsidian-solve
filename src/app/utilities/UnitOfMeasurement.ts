import convert from "convert";

/**
 * Convert a numeric value from one unit of measurement to another.
 *
 * Delegates to the `convert` package for actual conversion logic.
 *
 * @param fromValue - The numeric value in the source unit.
 * @param fromUnit - Source unit abbreviation (e.g., `"cm"`, `"m"`, `"kg"`).
 * @param toUnit - Target unit abbreviation.
 * @returns The equivalent value in the target unit.
 */
export function convertUnitOfMeasurementValue(
  fromValue: number,
  fromUnit: string,
  toUnit: string
): number {
  // The convert package returns a number when converting to a specific unit
  const result = convert(fromValue, fromUnit as any).to(toUnit as any);
  return result as unknown as number;
}

