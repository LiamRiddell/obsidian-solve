import convert, { Unit } from "convert-units";

export function convertUnitOfMeasurementValue(
  fromValue: number,
  fromUnit: string,
  toUnit: string
): number {
  return convert(fromValue)
    .from(fromUnit as Unit)
    .to(toUnit as Unit);
}

