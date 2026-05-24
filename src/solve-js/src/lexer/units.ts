export const knownUnits = new Set([
  // Length
  "mm", "cm", "m", "km", "ft", "yd", "mi",
  "inch", "inches", "foot", "feet", "yard", "yards", "mile", "miles",
  // Mass
  "g", "kg", "lb", "oz", "mcg", "mg", "t",
  // Volume
  "ml", "l", "cl", "dl", "gal", "cup", "pnt", "qt",
  // Time
  "s", "min", "h", "d",
  "day", "days", "week", "weeks", "month", "months", "year", "years",
  "hour", "hours", "minute", "minutes", "second", "seconds",
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
  "B", "KB", "MB", "GB", "TB", // bytes (uppercase)
  // Area
  "m2", "ft2",
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
]);

/** Units are case-sensitive to eliminate ambiguity (e.g. C=Celsius ≠ c=centiliter). */
export function isKnownUnit(text: string): boolean {
  return knownUnits.has(text);
}
