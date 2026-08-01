/**
 * Currency symbol/word → ISO 4217 code aliases, and the reverse table used
 * for display formatting (see `format/FormatEngine.ts`'s `formatUom()`).
 *
 * Single source of truth for BOTH directions so the same ambiguity
 * decisions (documented inline below) aren't made twice, inconsistently,
 * in two different files.
 */

/**
 * Currency SYMBOLS (non-alphanumeric characters) — safe to recognize as
 * bare lexer tokens with zero risk of colliding with a variable name,
 * since `:name = expr` variable names can never be symbol characters.
 * `CurrencySymbolParselet.ts` consumes these directly.
 *
 * `¥`/`₱`/`peso` ambiguity note: the PESO SIGN (₱) is, per Unicode, the
 * Philippine peso specifically — but the WORD "peso" (see
 * `CURRENCY_WORD_ALIASES` below) defaults to the Mexican peso, the most
 * globally recognized "peso" in English financial writing. This is a
 * deliberate inconsistency between the symbol and the word for the same
 * general concept, same reasoning as `¥` (JPY) vs "yuan" (CNY) below —
 * document rather than silently guess, and a user wanting the other one
 * can always type the ISO code directly ("PHP"/"CNY").
 */
export const CURRENCY_SYMBOL_ALIASES: Record<string, string> = {
  "$": "USD",
  "£": "GBP",
  "€": "EUR",
  // ¥ is genuinely ambiguous between JPY and CNY in real-world usage — JPY
  // is the conventional default (matches Numi/most calculator apps' own
  // choice); a user wanting CNY specifically can still type "CNY" directly.
  "¥": "JPY",
  "₽": "RUB",
  "₩": "KRW",
  "₹": "INR",
  "₺": "TRY",
  "₴": "UAH",
  "₪": "ILS",
  "₫": "VND",
  "₦": "NGN",
  "₱": "PHP",
};

/**
 * Currency WORD forms (singular/plural, all lowercase — this codebase's
 * unit table is strictly case-sensitive with no aliasing, so "Euro"/"EURO"
 * are deliberately NOT recognized, matching every other word-unit here).
 * Registered as `UNIT` tokens (see `lexer/units.ts`) rather than bare
 * keywords: a bare keyword can never be a `:variableName` (this codebase's
 * tested, intentional policy — see `VariableParselet.ts`'s doc comment),
 * but `:dollar = 5` etc. must keep working, and UNIT-typed tokens ARE
 * accepted as variable names (e.g. ":b = 5" already works for the "b" bits
 * unit) — so these ride the same safe mechanism `workday`/`workdays` used.
 *
 * Deliberately NOT included: "pound"/"pounds" — already a MASS unit in
 * `lexer/units.ts` (450g, matching "lb"). Remapping it to GBP would be a
 * real, silent regression for anyone using "5 pounds" to mean weight; GBP
 * stays reachable via the £ symbol or the "GBP" code, same as before.
 *
 * Deliberately NOT included: "dinar" — used by ~10 countries (Kuwaiti,
 * Bahraini, Jordanian, Iraqi, Algerian, ... dinars) with wildly different
 * values (a Kuwaiti dinar is worth roughly 1000x an Algerian one) — no
 * single default is defensible the way ¥→JPY or peso→MXN are. Type the
 * ISO code directly (KWD/BHD/JOD/...).
 *
 * Ambiguous-but-resolved cases, and why:
 * - "peso"/"pesos" → MXN (Mexican peso is the most globally recognized
 *   "peso" in English financial writing) — see the ₱ symbol note above
 *   for why this deliberately differs from the ₱ SYMBOL's PHP mapping.
 * - "franc"/"francs" → CHF (Swiss franc; also used by several African
 *   currencies — CHF is the overwhelmingly dominant "franc" in English use).
 * - "krona"/"kronor" → SEK (Swedish); "krone"/"kroner" → NOK (Norwegian) —
 *   Danish also uses "krone" (DKK) with the identical spelling as
 *   Norwegian; NOK was picked arbitrarily as the more commonly-referenced
 *   of the two in English text. Type "DKK" directly for Danish krone.
 * - "riyal"/"riyals"/"rial"/"rials" → SAR (Saudi riyal) — both spellings
 *   also refer to Qatari/Omani riyals and the Iranian rial; SAR is the
 *   most commonly referenced in English. Type "QAR"/"OMR"/"IRR" directly
 *   for the others.
 */
export const CURRENCY_WORD_ALIASES: Record<string, string> = {
  dollar: "USD", dollars: "USD",
  euro: "EUR", euros: "EUR",
  yen: "JPY",
  ruble: "RUB", rubles: "RUB", rouble: "RUB", roubles: "RUB",
  won: "KRW",
  rupee: "INR", rupees: "INR",
  yuan: "CNY", renminbi: "CNY",
  franc: "CHF", francs: "CHF",
  rand: "ZAR",
  krona: "SEK", kronor: "SEK",
  krone: "NOK", kroner: "NOK",
  real: "BRL", reais: "BRL",
  peso: "MXN", pesos: "MXN",
  shekel: "ILS", shekels: "ILS",
  lira: "TRY",
  hryvnia: "UAH", hryvnias: "UAH",
  zloty: "PLN", zlotys: "PLN",
  forint: "HUF",
  koruna: "CZK",
  dirham: "AED", dirhams: "AED",
  riyal: "SAR", riyals: "SAR", rial: "SAR", rials: "SAR",
  ringgit: "MYR",
  rupiah: "IDR",
  baht: "THB",
  dong: "VND",
  naira: "NGN",
};

/**
 * Resolve a raw lexed unit/symbol string to its canonical ISO 4217 code —
 * e.g. `"euro"` -> `"EUR"`, `"$"` -> `"USD"`, `"USD"` -> `"USD"` (already
 * canonical, returned unchanged). Returns `undefined` if `text` isn't a
 * recognized currency alias at all (distinct from "already canonical" —
 * callers should fall back to the original text in that case).
 */
export function resolveCurrencyAlias(text: string): string | undefined {
  return CURRENCY_SYMBOL_ALIASES[text] ?? CURRENCY_WORD_ALIASES[text.toLowerCase()];
}

/** How a currency's amount and symbol are conventionally arranged for display. */
export interface CurrencyDisplayInfo {
  /** The symbol/abbreviation to render, e.g. "$", "kr", "R$". */
  readonly symbol: string;
  /** Whether the symbol comes before or after the formatted amount. */
  readonly position: "prefix" | "suffix";
  /** Whether a space separates the symbol from the amount. */
  readonly spaced: boolean;
}

/**
 * Display convention per ISO code, for currencies with a widely-recognized
 * symbol/abbreviation and an unambiguous placement convention. NOT
 * exhaustive — any code absent here (most of the ~150 codes
 * `CurrencyExchange.isCurrency()` recognizes) falls back to the existing
 * "amount CODE" format (e.g. "100.00 AED") in `FormatEngine.formatUom()`,
 * exactly as before this table existed. Extend as needed, same pattern as
 * this session's other "not exhaustive, additive" tables (city timezones,
 * ingredient densities).
 *
 * Several currencies share the same symbol (USD/AUD/CAD/NZD/HKD/SGD/MXN
 * all conventionally use "$" locally) — this is safe here because OUTPUT
 * formatting always starts from an already-resolved, unambiguous ISO code
 * (`value.unit`), unlike INPUT parsing where a bare "$" genuinely is
 * ambiguous (see `CURRENCY_SYMBOL_ALIASES`'s USD default above).
 */
export const CURRENCY_DISPLAY: Record<string, CurrencyDisplayInfo> = {
  USD: { symbol: "$", position: "prefix", spaced: false },
  AUD: { symbol: "$", position: "prefix", spaced: false },
  CAD: { symbol: "$", position: "prefix", spaced: false },
  NZD: { symbol: "$", position: "prefix", spaced: false },
  HKD: { symbol: "$", position: "prefix", spaced: false },
  SGD: { symbol: "$", position: "prefix", spaced: false },
  MXN: { symbol: "$", position: "prefix", spaced: false },
  GBP: { symbol: "£", position: "prefix", spaced: false },
  // English-language convention (€100.00) — many EU locales instead suffix
  // with a space ("100,00 €"); this engine's default locale is "en", so
  // the English convention was chosen. A locale-aware override would be a
  // reasonable future extension, not attempted here.
  EUR: { symbol: "€", position: "prefix", spaced: false },
  JPY: { symbol: "¥", position: "prefix", spaced: false },
  CNY: { symbol: "¥", position: "prefix", spaced: false },
  KRW: { symbol: "₩", position: "prefix", spaced: false },
  INR: { symbol: "₹", position: "prefix", spaced: false },
  // Russian convention places the ruble sign AFTER the amount, with a space.
  RUB: { symbol: "₽", position: "suffix", spaced: true },
  TRY: { symbol: "₺", position: "prefix", spaced: false },
  UAH: { symbol: "₴", position: "suffix", spaced: true },
  ILS: { symbol: "₪", position: "prefix", spaced: false },
  // Vietnamese convention: no space, symbol after the amount.
  VND: { symbol: "₫", position: "suffix", spaced: false },
  NGN: { symbol: "₦", position: "prefix", spaced: false },
  PHP: { symbol: "₱", position: "prefix", spaced: false },
  BRL: { symbol: "R$", position: "prefix", spaced: false },
  ZAR: { symbol: "R", position: "prefix", spaced: false },
  // Scandinavian convention: amount then "kr", space-separated.
  SEK: { symbol: "kr", position: "suffix", spaced: true },
  NOK: { symbol: "kr", position: "suffix", spaced: true },
  DKK: { symbol: "kr", position: "suffix", spaced: true },
  PLN: { symbol: "zł", position: "suffix", spaced: true },
  CHF: { symbol: "Fr", position: "suffix", spaced: true },
  HUF: { symbol: "Ft", position: "suffix", spaced: true },
  CZK: { symbol: "Kč", position: "suffix", spaced: true },
};
