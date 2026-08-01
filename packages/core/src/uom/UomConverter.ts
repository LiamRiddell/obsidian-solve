/**
 * UoM Converter using the `convert` package (v7.0.0)
 * 
 * Units are strictly case-sensitive and passed through to the convert package
 * without aliasing. No unit remapping — what you type is what you get.
 * e.g. 'C' = Celsius, 'c' = centiliter; 'MB' = megabytes, 'mb' = millibar.
 */

import convert, { getMeasureKind, MeasureKind } from "convert";
import { conversions } from "convert/conversions";
import { LFUCache } from "@solve-js/cache";
import { EXTENDED_UNITS } from "@solve-js/uom/ExtendedUnits";

// Cache for valid units to avoid repeated conversion attempts
const validUnitsCache = new LFUCache<string>(1000);

// ── "workday" — a synthetic, non-`convert`-package unit ────────────────────
//
// A business day (Mon-Fri) backing the datetime package's `<date> + N
// workdays` arithmetic and `$X/workday` Rate literals
// (packages/datetime/). NOT a real physical unit — a business day has no
// fixed duration, since it depends on which calendar dates are weekends —
// so the third-party `convert` package has no concept of it and can't be
// taught one without monkey-patching its internal unit table.
//
// For RATE-MATH purposes only (e.g. "$500/workday x 4 weeks" needs a
// workday count to multiply by), a workday is treated as a FIXED 7/5 of a
// calendar day: 5 workdays span exactly 7 calendar days in a whole week,
// so this ratio is exact for whole-week spans and a reasonable linear
// approximation otherwise. This is deliberately NOT the same
// calendar-aware, weekend-skipping logic real "<date> + N workdays" date
// arithmetic needs (see vm/VM.ts's addBusinessDays()) — that can't be
// reduced to a fixed ratio, since the exact skip pattern depends on which
// day of the week the calculation actually starts from.
//
// Handled here as a thin pre/post layer in front of the normal
// `convert`-package path (rather than inside the package itself) so every
// caller of getMeasure()/convertUnit()/canConvert() automatically gets
// workday support for free.
const WORKDAY_UNIT_NAMES = new Set(["workday", "workdays"]);
const WORKDAY_TO_DAY_FACTOR = 7 / 5; // 1 workday == 1.4 calendar days

/** Whether `unit` is the synthetic "workday" unit (see module note above). */
export function isWorkdayUnit(unit: string | undefined): unit is string {
  return typeof unit === "string" && WORKDAY_UNIT_NAMES.has(unit);
}

// Cache for unit-to-unit conversion rates.
// Key: "from|to"  Value: conversion factor (convert(1, from, to)).
// Since unit conversion is linear (value × factor), caching the factor
// avoids calling the `convert` package on every UOM operation. For
// temperature conversions (which use offset-based formulas like C→F),
// the cache is bypassed — factor-based multiplication doesn't apply.
// Size 500 covers typical Obsidian vault usage (a few dozen unique
// unit pairs across all notes).
const conversionRateCache = new LFUCache<number>(500);

/**
 * Validate `unit` against the `convert` package's known unit table.
 *
 * @returns `unit` unchanged in all cases — this does NOT normalize casing
 *   or aliasing (units are strictly case-sensitive, see the module note
 *   above). A unit the `convert` package doesn't recognize is still
 *   returned as-is (not thrown), so callers must not assume a returned
 *   string is actually convertible — check with {@link isConvertibleUnit}
 *   or {@link canConvert} first if that matters.
 */
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

/**
 * Get the measure/dimension kind for `unit` (e.g. `"length"`, `"mass"`,
 * `"temperature"`) — used to check whether two units are even in the same
 * dimension before attempting a conversion.
 *
 * @returns `undefined` if `unit` isn't recognized, rather than throwing.
 */
export function getMeasure(unit: string): string | undefined {
  // Workday is a Time-measure unit by convention (see isWorkdayUnit's doc
  // comment) — the `convert` package has never heard of it, so resolve its
  // measure via "day" instead of attempting the real lookup below.
  if (isWorkdayUnit(unit)) return getMeasure("day");

  // Extended (custom) categories the `convert` package doesn't know about —
  // see ExtendedUnits.ts. Checked before the try block since it's a plain
  // object lookup, cheaper than round-tripping through convert()'s try/catch.
  const extended = EXTENDED_UNITS[unit];
  if (extended) return extended.measure;

  try {
    const resolved = resolveUnit(unit);
    const kindId = getMeasureKind(resolved as any);
    if (kindId === undefined) return undefined;

    return MEASURE_KIND_NAMES[kindId];
  } catch {
    return undefined;
  }
}

/**
 * Check whether `from` can be converted to `to` — same unit, or same
 * measure kind (length, mass, ...) and the underlying `convert` package
 * accepts the pair. Never throws; returns `false` on any failure.
 */
export function canConvert(from: string, to: string): boolean {
  if (from === to) return true;
  if (isWorkdayUnit(from) || isWorkdayUnit(to)) {
    const fromMeasure = getMeasure(from);
    const toMeasure = getMeasure(to);
    return !!fromMeasure && fromMeasure === toMeasure;
  }
  try {
    const f = resolveUnit(from);
    const t = resolveUnit(to);
    
    // Check if units have the same measure before attempting conversion
    const fromMeasure = getMeasure(f);
    const toMeasure = getMeasure(t);
    if (!fromMeasure || !toMeasure || fromMeasure !== toMeasure) {
      return false;
    }

    // Extended (custom) categories aren't known to the `convert` package at
    // all — calling convert() below would throw. The measure check above
    // already proves f and t both resolve to this same extended category
    // (that measure name can only have come from EXTENDED_UNITS), so no
    // further validation is needed.
    if (EXTENDED_UNITS[f]) {
      return true;
    }

    convert(1, f as any).to(t as any);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert `value` from unit `from` to unit `to`.
 *
 * Most conversions are multiplicative and served from a per-unit-pair
 * factor cache after the first call. Temperature is the one exception —
 * offset-based formulas (e.g. °F = °C × 9/5 + 32) can't be reduced to a
 * factor, so temperature pairs always go through the `convert` package
 * directly and are never cached.
 *
 * Does not validate that the conversion is possible — callers should check
 * with {@link canConvert} first if `from`/`to` aren't already known-good.
 */
export function convertUnit(value: number, from: string, to: string): number {
  if (from === to) return value;

  // Workday <-> any other Time-measure unit: pivot through "day" using the
  // fixed 7/5 ratio (see isWorkdayUnit's doc comment above). Handled before
  // the normal `convert`-package path since "workday" isn't a unit that
  // package has ever heard of.
  if (isWorkdayUnit(from) && isWorkdayUnit(to)) return value; // "workday" <-> "workdays" alias
  if (isWorkdayUnit(from)) {
    const days = value * WORKDAY_TO_DAY_FACTOR;
    return to === "day" ? days : convertUnit(days, "day", to);
  }
  if (isWorkdayUnit(to)) {
    const days = from === "day" ? value : convertUnit(value, from, "day");
    return days / WORKDAY_TO_DAY_FACTOR;
  }

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

  // Extended (custom) categories the `convert` package doesn't know about
  // (see ExtendedUnits.ts) — compute the ratio directly from each unit's
  // factor-to-base value instead of calling convert(), which would throw on
  // an unrecognized unit string. Every extended category is a pure linear
  // ratio scale (no Temperature-style offset), so this is always safe.
  const fExt = EXTENDED_UNITS[f];
  const tExt = EXTENDED_UNITS[t];
  if (fExt && tExt) {
    const rate = fExt.toBase / tExt.toBase;
    conversionRateCache.put(cacheKey, rate);
    return value * rate;
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

/**
 * List every unit symbol in the same measure/dimension as `unit` (wiki:
 * Units-Of-Measurement — "Conversion Possibilities", `sourceUnit to ?`,
 * e.g. `cm to ?"` → every Length unit). Excludes `unit` itself.
 *
 * The `convert` package has no dedicated "possibilities" method, but its
 * `convert/conversions` subpath (a real, package.json-declared public
 * export, not a deep dist/ reach-around) exposes the full conversion table
 * keyed by measure kind — reading that directly enumerates every symbol
 * for a measure without hardcoding a duplicate unit list here.
 *
 * @returns `[]` if `unit` isn't recognized, rather than throwing.
 */
export function getConvertiblePossibilities(unit: string): string[] {
  try {
    const resolved = resolveUnit(unit);
    const kind = getMeasureKind(resolved as any);
    if (kind === undefined) return [];
    const entry = conversions.get(kind);
    if (!entry) return [];
    const symbols = entry.units.flatMap((u) => u.symbols);
    return symbols.filter((s) => s !== resolved);
  } catch {
    return [];
  }
}

/** Check whether `unit` is a unit the `convert` package recognizes. Never throws. */
export function isConvertibleUnit(unit: string): boolean {
  if (isWorkdayUnit(unit)) return true;
  if (EXTENDED_UNITS[unit]) return true;
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

/**
 * Convert `value` (in `unit`) to whichever unit of the same measure gives
 * the most human-readable magnitude (the `convert` package's `"best"`
 * target) — e.g. 1500 metres becomes 1.5 km. Falls back to returning
 * `value`/`unit` unchanged if `unit` isn't recognized.
 */
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
