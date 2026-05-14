import convert from "convert";

export const unitAliases: Record<string, string> = {
  // Case-sensitive aliases (lowercase input -> proper case output)
  "mt": "t",
  "day": "d",
  "days": "d",
  "week": "week",
  "weeks": "week",
  "month": "month",
  "months": "month",
  "year": "year",
  "years": "year",
  "hour": "h",
  "hours": "h",
  "minute": "min",
  "minutes": "min",
  "second": "s",
  "seconds": "s",
  "inch": "in",
  "inches": "in",
  "foot": "ft",
  "feet": "ft",
  "yard": "yd",
  "yards": "yd",
  "mile": "mi",
  "miles": "mi",
  "floz": "fl-oz",
  "mph": "m/h",
  "c": "C",
  "f": "F",
  "k": "K",
  // Case-sensitive aliases for specific unit cases
  "km": "km",
  "kg": "kg",
  "mm": "mm",
  "cm": "cm",
  "m": "m",
  "g": "g",
  "mg": "mg",
  "L": "L",
  "ml": "ml",
  "ft": "ft",
  "in": "in",
  "mi": "mi",
  "yd": "yd",
  "lb": "lb",
  "oz": "oz",
  "t": "t",
  "d": "d",
  "h": "h",
  "min": "min",
  "s": "s",
  "ms": "ms",
  "B": "B",
  "kB": "kB",
  "KB": "KB",
  "MB": "MB",
  "GB": "GB",
  "TB": "TB",
  "KiB": "KiB",
  "MiB": "MiB",
  "GiB": "GiB",
  "TiB": "TiB",
};

export function resolveUnit(unit: string): string {
  // Try exact match first (case-sensitive)
  if (unitAliases[unit]) {
    return unitAliases[unit];
  }
  // Try lowercase match for common aliases
  const lower = unit.toLowerCase().trim();
  return unitAliases[lower] ?? unit;
}

export function getMeasure(unit: string): string | undefined {
  try {
    // The convert package doesn't have a describe method
    // We'll need to determine the measure based on the unit
    const resolved = resolveUnit(unit);
    // Try to convert to a common unit to determine the measure
    // This is a simplified approach - in a real implementation,
    // you might need a mapping of units to measures
    return undefined;
  } catch {
    return undefined;
  }
}

export function canConvert(from: string, to: string): boolean {
  if (from === to) return true;
  try {
    const f = resolveUnit(from);
    const t = resolveUnit(to);
    convert(1, f as any).to(t as any);
    return true;
  } catch {
    return false;
  }
}

export function convertUnit(value: number, from: string, to: string): number {
  const f = resolveUnit(from);
  const t = resolveUnit(to);
  if (f === t) return value;
  const result = convert(value, f as any).to(t as any);
  return result.quantity;
}

export function isConvertibleUnit(unit: string): boolean {
  // The convert package doesn't have a possibilities method
  // We'll need to check if the unit can be converted to a known unit
  try {
    const resolved = resolveUnit(unit);
    // Try a common conversion to see if the unit is valid
    convert(1, resolved as any).to(resolved as any);
    return true;
  } catch {
    return false;
  }
}

export function getBestUnit(value: number, unit: string): { value: number; unit: string } {
  const u = resolveUnit(unit);
  // The convert package has a "best" option
  try {
    const result = convert(value, u as any).to("best" as any);
    return { value: result.quantity, unit: result.unit };
  } catch {
    return { value, unit: u };
  }
}
