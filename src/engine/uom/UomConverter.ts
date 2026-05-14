import convert from "convert-units";

export const unitAliases: Record<string, string> = {
  mt: "t",
  day: "d",
  days: "d",
  week: "week",
  weeks: "week",
  month: "month",
  months: "month",
  year: "year",
  years: "year",
  hour: "h",
  hours: "h",
  minute: "min",
  minutes: "min",
  second: "s",
  seconds: "s",
  inch: "in",
  inches: "in",
  foot: "ft",
  feet: "ft",
  yard: "yd",
  yards: "yd",
  mile: "mi",
  miles: "mi",
  floz: "fl-oz",
  mph: "m/h",
  c: "C",
  f: "F",
  k: "K",
};

export function resolveUnit(unit: string): string {
  const lower = unit.toLowerCase().trim();
  return unitAliases[lower] ?? lower;
}

export function getMeasure(unit: string): string | undefined {
  try {
    return convert().describe(resolveUnit(unit) as any).measure;
  } catch {
    return undefined;
  }
}

export function canConvert(from: string, to: string): boolean {
  if (from === to) return true;
  try {
    convert(1).from(resolveUnit(from) as any).to(resolveUnit(to) as any);
    return true;
  } catch {
    return false;
  }
}

export function convertUnit(value: number, from: string, to: string): number {
  const f = resolveUnit(from);
  const t = resolveUnit(to);
  if (f === t) return value;
  return convert(value).from(f as any).to(t as any);
}

export function isConvertibleUnit(unit: string): boolean {
  return convert().possibilities().includes(resolveUnit(unit) as any);
}

export function getBestUnit(value: number, unit: string): { value: number; unit: string } {
  const u = resolveUnit(unit);
  const measure = getMeasure(u);
  if (!measure) return { value, unit: u };

  const units = convert().possibilities(measure as any);
  let best = { value, unit: u, dist: Infinity };
  for (const candidate of units) {
    try {
      const v = convert(value).from(u as any).to(candidate as any);
      if (v >= 1 && v < best.dist) {
        best = { value: v, unit: candidate, dist: v };
      }
    } catch {
      // Ignore conversion errors
    }
  }
  if (!isFinite(best.dist)) {
    let largest = { value, unit: u, dist: -Infinity };
    for (const candidate of units) {
    try {
      const v = convert(value).from(u as any).to(candidate as any);
      if (v > 0 && v > largest.dist) {
        largest = { value: v, unit: candidate, dist: v };
      }
    } catch {
      // Ignore conversion errors
    }
    }
    return { value: largest.value, unit: largest.unit };
  }
  return { value: best.value, unit: best.unit };
}
