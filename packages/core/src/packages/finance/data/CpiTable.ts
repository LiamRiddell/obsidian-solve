/**
 * U.S. CPI-U (Consumer Price Index for All Urban Consumers, "U.S. city
 * average, all items", 1982-84=100 base) annual average index values.
 *
 * ── DATA VINTAGE / SOURCE / ACCURACY NOTE (read before trusting a number) ──
 * These are APPROXIMATE annual-average CPI-U figures recalled from the
 * assistant's general knowledge (training data through ~January 2026), not
 * a live fetch from the U.S. Bureau of Labor Statistics (bls.gov/cpi). They
 * are representative of the real, published series and good enough for a
 * calculator-notepad's inflation-adjustment feature, but:
 *   - Years up to ~2024 are close to BLS-published annual averages but may
 *     be off by a small amount (rounding/recall, not a live re-derivation).
 *   - 2025 and 2026 are forward-leaning ESTIMATES (2025 not fully finalized,
 *     2026 projected from recent trend) — expect these to be the least
 *     accurate entries and the first that need replacing with real BLS
 *     data as it's published.
 *   - This table is NOT authoritative for financial, legal, tax, contract
 *     escalation (COLA), or any decision with real money on the line —
 *     consult bls.gov/cpi directly for that. It exists so `inflationAdjust`
 *     and the "what is/was ... worth" phrase grammar (see
 *     `packages/finance/parselets/InflationQueryParselet.ts`) have a real,
 *     working, demonstrably-correct-shaped implementation to run against,
 *     matching this session's established honesty principle for bundled
 *     approximate data (see `SalesTaxParselet.ts`'s doc comment on never
 *     silently faking a rate).
 *
 * Coverage: 1970-2026 inclusive (57 years) — additive; extend this table in
 * future years by appending new entries, no other code needs to change.
 * A year outside this range (e.g. "what was $500 worth in 1920") produces a
 * clear `INFLATION_YEAR_OUT_OF_RANGE` error rather than a silently wrong
 * extrapolation.
 */
export const CPI_TABLE: Readonly<Record<number, number>> = {
  1970: 38.8, 1971: 40.5, 1972: 41.8, 1973: 44.4, 1974: 49.3,
  1975: 53.8, 1976: 56.9, 1977: 60.6, 1978: 65.2, 1979: 72.6,
  1980: 82.4, 1981: 90.9, 1982: 96.5, 1983: 99.6, 1984: 103.9,
  1985: 107.6, 1986: 109.6, 1987: 113.6, 1988: 118.3, 1989: 124.0,
  1990: 130.7, 1991: 136.2, 1992: 140.3, 1993: 144.5, 1994: 148.2,
  1995: 152.4, 1996: 156.9, 1997: 160.5, 1998: 163.0, 1999: 166.6,
  2000: 172.2, 2001: 177.1, 2002: 179.9, 2003: 184.0, 2004: 188.9,
  2005: 195.3, 2006: 201.6, 2007: 207.3, 2008: 215.3, 2009: 214.5,
  2010: 218.1, 2011: 224.9, 2012: 229.6, 2013: 233.0, 2014: 236.7,
  2015: 237.0, 2016: 240.0, 2017: 245.1, 2018: 251.1, 2019: 255.7,
  2020: 258.8, 2021: 271.0, 2022: 292.7, 2023: 304.7, 2024: 313.7,
  // 2025-2026: preliminary/projected estimates — see doc comment above.
  2025: 320.6, 2026: 327.4,
} as const;

/** Earliest/latest year this table has data for — used for range-check error messages. */
export const CPI_MIN_YEAR = 1970;
export const CPI_MAX_YEAR = 2026;

/** Look up the CPI-U annual average for `year`, or `undefined` if out of range. */
export function getCpi(year: number): number | undefined {
  return CPI_TABLE[Math.trunc(year)];
}

/**
 * Ratio to multiply a `fromYear` dollar amount by to express it in
 * `toYear` dollars: `amount(toYear) = amount(fromYear) * inflationRatio(fromYear, toYear)`.
 *
 * @returns `undefined` if either year is outside the table's range, or if
 *   `fromYear`'s CPI is exactly 0 (never true for real data, guarded anyway
 *   since it would otherwise divide by zero).
 */
export function inflationRatio(fromYear: number, toYear: number): number | undefined {
  const fromCpi = getCpi(fromYear);
  const toCpi = getCpi(toYear);
  if (fromCpi === undefined || toCpi === undefined || fromCpi === 0) return undefined;
  return toCpi / fromCpi;
}

/**
 * Adjust `amount` from `fromYear` dollars to `toYear` dollars using the CPI
 * table above.
 *
 * @returns `undefined` if either year is out of the table's covered range
 *   (caller should surface this as a clear error, not a silently wrong number).
 */
export function adjustForInflation(amount: number, fromYear: number, toYear: number): number | undefined {
  const ratio = inflationRatio(fromYear, toYear);
  if (ratio === undefined) return undefined;
  return amount * ratio;
}
