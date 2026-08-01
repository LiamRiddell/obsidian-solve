/**
 * Set of all known unit identifiers (case-sensitive).
 * Includes length, mass, volume, time, temperature, frequency, power, energy,
 * pressure, angle, data storage, area, and ISO 4217 currency codes.
 *
 * Units are case-sensitive to eliminate ambiguity
 * (e.g., `C` = Celsius vs `c` = centiliter, `B` = bytes vs `b` = bits).
 */
export const knownUnits = new Set([
  // Length
  // NOTE: "in" (inches) is deliberately NOT listed here even though the
  // underlying `convert` package accepts it — the lexer prioritizes the
  // reserved "IN" keyword (conversion operator) over unit recognition for
  // that exact word, and registering "in" as a known unit interferes with
  // that priority (regressed "3 ft in in" to silently drop the conversion
  // when tried). ConvertParselet/UomLiteralParselet/PercentageChangeParselet
  // all special-case token TYPE "IN" directly instead, trusting its literal
  // text as the unit name without consulting this set — see each of their
  // "in in" collision comments.
  "mm", "cm", "m", "km", "ft", "yd", "mi",
  "inch", "inches", "foot", "feet", "yard", "yards", "mile", "miles",
  // Mass
  "g", "kg", "lb", "oz", "mcg", "mg", "t",
  // Mass -- full-word/plural forms, added for the cooking package's
  // source-unit position (e.g. "300 grams butter in cups"); all are
  // real names the `convert` npm package already accepts directly.
  "gram", "grams", "pound", "pounds", "ounce", "ounces",
  // Volume
  "ml", "l", "cl", "dl", "gal", "cup", "pnt", "qt",
  // Volume -- plural/full-word forms, added for the cooking package
  // (packages/uom/) so e.g. "10 cups olive oil in grams" lexes "cups"
  // as a real UNIT token (needed for the NUMBER+UNIT literal path to
  // fire at all -- see uom/normalizer/IngredientNameNormalizerRule.ts).
  // US Customary only -- see CookingPluginFunctions.ts's scope note.
  "cups", "tbsp", "tsp", "tablespoon", "tablespoons", "teaspoon", "teaspoons",
  // Time
  "s", "min", "h", "d",
  "day", "days", "week", "weeks", "month", "months", "year", "years",
  "hour", "hours", "minute", "minutes", "second", "seconds",
  // "workday"/"workdays" — a business day (Mon-Fri), backing the datetime
  // package's `<date> + N workdays` arithmetic and `$X/workday` Rate
  // literals (packages/datetime/). NOT a real unit the `convert` package
  // knows about (a business day has no fixed physical duration — it
  // depends on which calendar dates are weekends) — see
  // uom/UomConverter.ts's isWorkdayUnit()/workday shim, which handles
  // conversion to/from other Time-measure units via a fixed 7/5 ratio
  // (5 workdays per 7-day week) for RATE-MATH purposes only. Registering
  // it here (rather than a bespoke IDENT-matching normalizer rule, the
  // "fps"/"am"/"pm" approach used elsewhere in this codebase) is safe re:
  // the ":name = expr" variable-name collision policy — VariableParselet.ts
  // explicitly accepts UNIT-typed tokens as variable names (e.g. ":b = 5"
  // already works for the "b" bits unit), so ":workday = 5" keeps working.
  "workday", "workdays",
  // Temperature (uppercase: C=Celsius ≠ c=centiliter)
  "C", "F", "K",
  // Frequency
  "Hz", "kHz", "MHz", "GHz", "THz",
  // Power
  "W", "kW", "MW", "GW",
  // Energy
  "Wh", "kWh", "MWh", "GWh",
  // Pressure
  "Pa", "kPa", "MPa", "bar", "psi", "torr",
  // Angle
  "deg", "rad", "grad",
  // Data storage (uppercase = bytes, lowercase = bits)
  "b", "bit", "kb", "mb", // bits (lowercase)
  "B", "KB", "MB", "GB", "TB", // bytes (uppercase, decimal/SI: 1000^n)
  // Binary-prefix (IEC) byte units — 1024^n, distinct from the decimal
  // KB/MB/GB/TB above (e.g. 1 GiB = 1073741824 B, 1 GB = 1000000000 B).
  // The `convert` npm package already recognizes these exact casings
  // natively (confirmed via its generated type union) — this was purely a
  // lexer allowlist gap, not a conversion-logic one.
  "KiB", "MiB", "GiB", "TiB", "PiB",
  // Area
  "m2", "ft2",
  // Speed — custom measure, `convert` package has no MeasureKind for this
  // (see ExtendedUnits.ts). "fps" (feet/s) is deliberately NOT registered —
  // collides with the Time package's "fps" (frames/s), which requires an
  // IDENT token; "ft_s" is used instead.
  "mps", "kph", "mph", "kn", "ft_s",
  // Pace — custom measure (time/distance, the reciprocal of speed).
  // Underscore stands in for "/" since the lexer only tokenizes
  // [a-zA-Z0-9_] as a single UNIT token — "min/km" isn't representable.
  "min_km", "min_mi",
  // Voltage / Current — custom measures. Bare "V" is deliberately NOT
  // registered — collides with the stocks package's "V" (Visa) ticker,
  // which also requires an IDENT token (see ExtendedUnits.ts).
  "mV", "kV", "mA", "A", "kA",
  // Apparent Power / Reactive Power / Reactive Energy — custom measures.
  // `convert`'s Power/Energy kinds cover real power (W) and real energy
  // (Wh) only, not these. The bare IEC symbol "var" is deliberately NOT
  // registered — see the comment in ExtendedUnits.ts (collides with "var"
  // as a variable name).
  "VA", "kVA", "MVA", "kvar", "Mvar", "varh", "kvarh", "Mvarh",
  // Volume Flow Rate — custom measure.
  "m3s", "m3h", "lps", "lpm", "gpm", "cfs",
  // Parts-Per — custom measure (dimensionless ratio). "%" is intentionally
  // excluded — owned by the dedicated Percentage provider, not UoM.
  "ppm", "ppb", "ppt", "permille",
  // Currencies — ISO 4217 uppercase by convention
  "USD", "EUR", "GBP", "JPY",
  "AUD", "CAD", "CHF", "CNY", "SEK", "NOK", "DKK", "NZD",
  "KRW", "SGD", "HKD", "TWD", "INR", "BRL", "ZAR", "MXN",
  "RUB", "TRY", "SAR", "AED", "ILS", "PLN", "CZK", "HUF",
  "THB", "IDR", "MYR", "PHP", "CLP", "COP", "ARS", "NGN",
  "EGP", "PKR", "BDT", "VND", "KES", "XOF", "XAF", "MAD",
  "QAR", "KWD", "OMR", "BHD", "JOD", "LKR", "MMK", "UZS",
  "KZT", "RON", "BGN", "HRK", "ISK", "UAH", "GEL", "AZN",
  "BTN", "BND", "BOB", "BWP", "BYN", "BZD", "CDF", "CRC",
  "CUP", "DOP", "DZD", "ERN", "ETB", "FJD", "FKP", "GMD",
  "GNF", "GYD", "HNL", "HTG", "JMD", "KGZ", "KHR", "KMF",
  "KYD", "LAK", "LBP", "LRD", "LSL", "LYD", "MDL", "MGA",
  "MKD", "MNT", "MOP", "MRU", "MUR", "MVR", "MWK", "MZN",
  "NAD", "NIO", "NPR", "PGK", "PYG", "RSD", "RWF", "SBD",
  "SCR", "SDG", "SHP", "SLE", "SOS", "SRD", "SSP", "STN",
  "SVC", "SYP", "SZL", "TJS", "TMT", "TND", "TOP", "TTD",
  "TZS", "UGX", "UYU", "VEB", "VUV", "WST", "XCD", "XDR",
  "XPF", "YER", "ZMW", "ZWL",
  // Cryptocurrencies — not ISO 4217, but recognized the same way as fiat
  // currency codes: routed through CurrencyExchangeService, not the
  // `convert` package. Must stay in sync with CurrencyExchangeService's
  // isCurrency() list, which already recognized these — without a matching
  // lexer entry, a code never becomes a UNIT token in the first place, so
  // e.g. `1 BTC to USD` failed at tokenization with "Undefined variable: BTC"
  // before ever reaching the currency service that could have handled it.
  "BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "DOT",
  // Currency WORD forms (singular/plural, lowercase only — no aliasing
  // policy applies here too) — resolved to their canonical ISO code by
  // UomLiteralParselet.ts via uom/CurrencyAliases.ts's
  // CURRENCY_WORD_ALIASES, same table that doc-comments every ambiguous
  // choice (peso->MXN, franc->CHF, krona->SEK, etc.) and explains why
  // "pound"/"pounds" is deliberately EXCLUDED (already claimed above by
  // the Mass category, matching "lb") rather than remapped to GBP.
  "dollar", "dollars", "euro", "euros", "yen",
  "ruble", "rubles", "rouble", "roubles", "won",
  "rupee", "rupees", "yuan", "renminbi", "franc", "francs", "rand",
  "krona", "kronor", "krone", "kroner", "real", "reais", "peso", "pesos",
  "shekel", "shekels", "lira", "hryvnia", "hryvnias", "zloty", "zlotys",
  "forint", "koruna", "dirham", "dirhams", "riyal", "riyals", "rial", "rials",
  "ringgit", "rupiah", "baht", "dong", "naira",
]);

/** Units are case-sensitive to eliminate ambiguity (e.g. C=Celsius ≠ c=centiliter). */
export function isKnownUnit(text: string): boolean {
  return knownUnits.has(text);
}
