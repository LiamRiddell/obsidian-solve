export const knownUnits = new Set([
  "mm", "cm", "m", "km", "in", "ft", "yd", "mi",
  "g", "kg", "lb", "oz", "mcg", "mg", "t", "mt",
  "ml", "l", "cl", "dl", "gal", "cup", "pnt", "qt",
  "s", "min", "h", "d", "day", "week", "month", "year",
  "c", "f", "k",
  "hz", "khz", "mhz", "ghz", "thz",
  "w", "kw", "mw", "gw", "wh", "kwh", "mwh", "gwh",
  "v", "kv", "mv", "a", "ka", "ma",
  "pa", "kpa", "mpa", "bar", "psi", "ksi", "torr",
  "usd", "eur", "gbp", "jpy",
  "deg", "rad", "grad",
  "b", "kb", "mb", "gb", "tb", "bit",
]);

export function isKnownUnit(text: string): boolean {
  return knownUnits.has(text.toLowerCase());
}