/**
 * UoM Converter using the `convert` package (v7.0.0)
 * 
 * Units are strictly case-sensitive and passed through to the convert package
 * without aliasing. No unit remapping — what you type is what you get.
 * e.g. 'C' = Celsius, 'c' = centiliter; 'MB' = megabytes, 'mb' = millibar.
 */

import convert, { getMeasureKind, MeasureKind } from "convert";
import { LFUCache } from "@solve-js/cache";

// Cache for valid units to avoid repeated conversion attempts
const validUnitsCache = new LFUCache<string>(1000);

export function resolveUnit(unit: string): string {
  // Check cache first for performance
  const cached = validUnitsCache.get(unit);
  if (cached !== null) {
    return cached;
  }
  
  try {
    // Validate the unit with the convert package
    convert(1, unit as any).to(unit as any);
    validUnitsCache.put(unit, unit);
    return unit;
  } catch {
    // Return the original unit (will likely cause an error later)
    return unit;
  }
}

export function getMeasure(unit: string): string | undefined {
  try {
    const resolved = resolveUnit(unit);
    const kindId = getMeasureKind(resolved as any);
    if (kindId === undefined) return undefined;
    
    const measureKinds: Record<number, string> = {
      [MeasureKind.Angle]: "angle",
      [MeasureKind.Area]: "area",
      [MeasureKind.Data]: "data",
      [MeasureKind.Energy]: "energy",
      [MeasureKind.Force]: "force",
      [MeasureKind.Frequency]: "frequency",
      [MeasureKind.Illuminance]: "illuminance",
      [MeasureKind.Length]: "length",
      [MeasureKind.Luminance]: "luminance",
      [MeasureKind.LuminousIntensity]: "luminousIntensity",
      [MeasureKind.Mass]: "mass",
      [MeasureKind.Power]: "power",
      [MeasureKind.Pressure]: "pressure",
      [MeasureKind.Temperature]: "temperature",
      [MeasureKind.Time]: "time",
      [MeasureKind.Volume]: "volume",
    };
    
    return measureKinds[kindId];
  } catch {
    return undefined;
  }
}

export function canConvert(from: string, to: string): boolean {
  if (from === to) return true;
  try {
    const f = resolveUnit(from);
    const t = resolveUnit(to);
    
    // Check if units have the same measure before attempting conversion
    const fromMeasure = getMeasure(f);
    const toMeasure = getMeasure(t);
    if (!fromMeasure || !toMeasure || fromMeasure !== toMeasure) {
      return false;
    }
    
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
  // The convert package returns a number when converting to a specific unit
  // Use unknown intermediate cast to satisfy TypeScript
  const result = convert(value, f as any).to(t as any);
  return result as unknown as number;
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
