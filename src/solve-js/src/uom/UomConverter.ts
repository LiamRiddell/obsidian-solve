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

// Cache for unit-to-unit conversion rates.
// Key: "from|to"  Value: conversion factor (convert(1, from, to)).
// Since unit conversion is linear (value × factor), caching the factor
// avoids calling the `convert` package on every UOM operation. For
// temperature conversions (which use offset-based formulas like C→F),
// the cache is bypassed — factor-based multiplication doesn't apply.
// Size 500 covers typical Obsidian vault usage (a few dozen unique
// unit pairs across all notes).
const conversionRateCache = new LFUCache<number>(500);

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

// Built once at module load rather than inside getMeasure() — this is a pure
// lookup table with no per-call state, but it was previously reallocated
// (16 computed-key entries) on every single call. getMeasure() runs at least
// twice per unit conversion (VM.ts's UOM_CONVERT_TO checks it for both the
// source and target unit) plus again inside convertUnit()'s temperature
// branch, so this was a real, avoidable allocation on a hot path.
const MEASURE_KIND_NAMES: Record<number, string> = {
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

export function getMeasure(unit: string): string | undefined {
  try {
    const resolved = resolveUnit(unit);
    const kindId = getMeasureKind(resolved as any);
    if (kindId === undefined) return undefined;

    return MEASURE_KIND_NAMES[kindId];
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

  // Check the conversion-rate cache for this unit pair.
  // On cache hit: result = value × factor — one multiplication instead of a
  // full convert() call. Temperature pairs never enter the cache (see below),
  // so a cache hit is always safe for multiplicative conversion.
  const cacheKey = `${f}|${t}`;
  const cachedRate = conversionRateCache.get(cacheKey);
  if (cachedRate !== null) {
    return value * cachedRate;
  }

  // Temperature conversions use offset-based formulas (e.g. C→F: °F = °C × 9/5 + 32)
  // and cannot be reduced to a simple multiplicative factor. Bypass the cache.
  // Only checked on cache miss — the hot path skips this getMeasure() call.
  if (getMeasure(f) === 'temperature') {
    return convert(value, f as any).to(t as any) as unknown as number;
  }

  // Cache miss: compute the conversion factor from a reference value of 1,
  // store it, and apply to the requested value.
  const rate = convert(1, f as any).to(t as any) as unknown as number;
  conversionRateCache.put(cacheKey, rate);
  return value * rate;
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
