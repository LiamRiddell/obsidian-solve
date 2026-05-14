import convert from "convert";

export function convertUnitOfMeasurementValue(
  fromValue: number,
  fromUnit: string,
  toUnit: string
): number {
  // The convert package returns a number when converting to a specific unit
  const result = convert(fromValue, fromUnit as any).to(toUnit as any);
  return result as unknown as number;
}

