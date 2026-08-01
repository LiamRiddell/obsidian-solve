/**
 * Extended unit categories not supported by the `convert` npm package (v7.0.0).
 *
 * `convert` only ships 16 measure kinds (Angle, Area, Data, Energy, Force,
 * Frequency, Illuminance, Length, Luminance, LuminousIntensity, Mass, Power,
 * Pressure, Temperature, Time, Volume — see MEASURE_KIND_NAMES in
 * UomConverter.ts). The project's own wiki documents several more
 * (Volume Flow Rate, Speed, Pace, Voltage, Current, Apparent Power,
 * Reactive Power, Reactive Energy, Parts-Per) that the library has no
 * concept of at all.
 *
 * A hand-rolled table is deliberately used instead of pulling in a bigger
 * unit-conversion library (e.g. js-quantities, convert-units, mathjs's unit
 * system): every category here is a pure linear ratio scale (no
 * Temperature-style offset formula needed), so the whole extension is a
 * `{ measure, toBase }` lookup plus a couple of arithmetic call sites in
 * UomConverter.ts. Pulling in a heavier dependency for ~30 extra unit
 * symbols would undo the earlier deliberate migration to `convert` for its
 * small size, and would reintroduce the aliasing/normalization behavior
 * this project explicitly moved away from (units here are case-sensitive,
 * no aliasing — matching UomConverter.ts's existing design).
 *
 * Unit symbols are restricted to what the lexer can tokenize as a single
 * UNIT token: `tokenizeIdentifier()` (ExpressionLexer.ts) only reads
 * `[a-zA-Z0-9_]` (plus Unicode) — no `/`, no `-`. That rules out
 * slash-notation like "km/h" or "min/km" as literal unit text. Every
 * category below uses a plain-letters abbreviation where a standard one
 * exists (mph, kn, gpm, cfs, ...); Pace has no standard non-slash
 * abbreviation, so it uses an underscore instead ("min_km", "min_mi") —
 * the one place in this table where that's necessary.
 */

export interface ExtendedUnitDef {
  /** Category name, matching the style of UomConverter.ts's MEASURE_KIND_NAMES (lowerCamelCase). */
  measure: string;
  /** Multiply a value in this unit by this factor to get the value in the category's base unit. */
  toBase: number;
}

export const EXTENDED_UNITS: Record<string, ExtendedUnitDef> = {
  // ── Speed (base: mps, meters per second) ──────────────────────────────
  mps: { measure: "speed", toBase: 1 },
  kph: { measure: "speed", toBase: 1000 / 3600 },
  mph: { measure: "speed", toBase: 0.44704 }, // 1 mile (1609.344m) / 3600s
  kn: { measure: "speed", toBase: 1852 / 3600 }, // 1 nautical mile = 1852m exactly
  // "fps" (feet per second) deliberately NOT used — confirmed via a real
  // regression (20 failures in VideoTimecode.spec.ts) that it collides with
  // the Time package's "fps" (frames per second), which FpsRateNormalizerRule
  // requires to lex as a plain IDENT token. "ft_s" avoids the collision,
  // following the same underscore convention as Pace below.
  ft_s: { measure: "speed", toBase: 0.3048 }, // 1 ft = 0.3048m exactly

  // ── Pace (base: seconds per meter — time/distance, the reciprocal of speed) ──
  // Pace and Speed are deliberately separate measures: converting between them
  // is a reciprocal (1/x) relationship, not a linear scale, so they can't share
  // this table's plain factor-ratio conversion.
  min_km: { measure: "pace", toBase: 60 / 1000 },
  min_mi: { measure: "pace", toBase: 60 / 1609.344 },

  // ── Voltage (base: V, expressed in mV/kV only) ─────────────────────────
  // The bare symbol "V" is deliberately NOT registered — it collides with
  // "V" the stock ticker (Visa) in packages/stocks/MajorTickers.ts, whose
  // StockTickerNormalizerRule also requires an IDENT token (same class of
  // issue as "var"/"fps" above; not currently test-covered since bare-ticker
  // recognition is opt-in, but a real latent conflict). "mV"/"kV" don't
  // collide with anything and cover the practically useful range.
  mV: { measure: "voltage", toBase: 0.001 },
  kV: { measure: "voltage", toBase: 1000 },

  // ── Current (base: A) ───────────────────────────────────────────────
  mA: { measure: "current", toBase: 0.001 },
  A: { measure: "current", toBase: 1 },
  kA: { measure: "current", toBase: 1000 },

  // ── Apparent Power (base: VA) — S = V × I, not real power ─────────────
  VA: { measure: "apparentPower", toBase: 1 },
  kVA: { measure: "apparentPower", toBase: 1000 },
  MVA: { measure: "apparentPower", toBase: 1_000_000 },

  // ── Reactive Power (base: var, expressed in kvar/Mvar only) ────────────
  // The bare IEC symbol "var" is deliberately NOT registered as a unit —
  // confirmed via a real regression (ExpressionLexer.identifiers-keywords.spec.ts's
  // "$var" test) that it collides with "var" as an extremely common variable
  // name (and former JS keyword). "kvar"/"Mvar" don't collide with anything
  // and cover the practically useful range.
  kvar: { measure: "reactivePower", toBase: 1000 },
  Mvar: { measure: "reactivePower", toBase: 1_000_000 },

  // ── Reactive Energy (base: varh) — IEC standard symbol "varh" ─────────
  varh: { measure: "reactiveEnergy", toBase: 1 },
  kvarh: { measure: "reactiveEnergy", toBase: 1000 },
  Mvarh: { measure: "reactiveEnergy", toBase: 1_000_000 },

  // ── Volume Flow Rate (base: m3s, cubic meters per second) ─────────────
  m3s: { measure: "volumeFlowRate", toBase: 1 },
  m3h: { measure: "volumeFlowRate", toBase: 1 / 3600 },
  lps: { measure: "volumeFlowRate", toBase: 0.001 }, // 1 L/s = 0.001 m3/s
  lpm: { measure: "volumeFlowRate", toBase: 0.001 / 60 },
  gpm: { measure: "volumeFlowRate", toBase: 0.003785411784 / 60 }, // US gallon = 3.785411784 L exactly
  cfs: { measure: "volumeFlowRate", toBase: 0.028316846592 }, // 1 ft3 = 0.028316846592 m3 exactly

  // ── Parts-Per (base: dimensionless fraction, 1 = whole) ───────────────
  // "%" is intentionally excluded — it's owned by the project's dedicated
  // Percentage provider, not the UoM system.
  ppm: { measure: "partsPer", toBase: 1e-6 },
  ppb: { measure: "partsPer", toBase: 1e-9 },
  ppt: { measure: "partsPer", toBase: 1e-12 }, // parts per trillion (chemistry/environmental convention)
  permille: { measure: "partsPer", toBase: 1e-3 },
};
