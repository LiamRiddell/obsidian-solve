import { Value, ValueType, type MatrixData, type MatrixEntry, type RangeData } from "@solve-js/vm/Value";
import { getLocale, type ILocale } from "@solve-js/constants/locales";
import { autoFormatIntegerOrFloat } from "@solve-js/utilities/Number";
import { FormattingSettings, DEFAULT_FORMATTING_SETTINGS } from "./FormattingSettings";
import { CURRENCY_DISPLAY } from "@solve-js/uom/CurrencyAliases";
import { columnMajorToRowMajor } from "@solve-js/vm/MatrixOps";
import { formatSymbolic, type SymbolicNode } from "@solve-js/vm/Symbolic";

function formatNumber(value: number, locale: ILocale, settings: FormattingSettings): string {
  const dp = settings.floatResult.decimalPlaces;
  const sep = settings.floatResult.enableSeperator;
  const loc = settings.numberResult.decimalSeparatorLocale;
  const formatted = autoFormatIntegerOrFloat(value, dp, sep, loc);
  return `${locale.display.resultPrefix}${formatted}`;
}

function formatHex(value: number, settings: FormattingSettings): string {
  const padding = settings.hexResult.enablePadding ? settings.hexResult.paddingZeros : 0;
  const hex = (value as number).toString(16).toUpperCase().padStart(padding, "0");
  return `= 0x${hex}`;
}

function formatBigInt(value: bigint): string {
  return `= ${value}`;
}

function formatString(value: string): string {
  return `= ${value}`;
}

function formatBoolean(value: boolean): string {
  return `= ${value}`;
}

/**
 * Renders a Datetime value locale-aware — the previous implementation
 * called `d.toLocaleString()` with no arguments, which always uses the JS
 * runtime's own default locale and never actually consulted `locale.code`
 * despite receiving it as a parameter (both branches of its old
 * `dateFormat === "default"` check were byte-for-byte identical — dead
 * groundwork for a distinction that was never implemented). Concretely,
 * this meant every configured locale (including the shipped German one)
 * always displayed weekday/month names in English — see GitHub issue #77.
 *
 * Uses `weekday`/`month`: "long" for a spelled-out date ("Monday,
 * November 17, 2025" / "lundi 17 novembre 2025") since that's what a
 * literal weekday name is for; a bare numeric date doesn't need
 * localizing beyond the decimal/thousands separators `formatNumber()`
 * already handles. The time-of-day portion is only appended when it's
 * not exactly local midnight — bare date literals ("today", "17/11/2025")
 * always anchor to local midnight, and showing "00:00:00" on every one of
 * those would be noise, not information.
 */
function formatDatetime(value: number, locale: ILocale): string {
  const d = new Date(value);
  const dateStr = d.toLocaleDateString(locale.code, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const isMidnight = d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
  if (isMidnight) return `= ${dateStr}`;
  return `= ${dateStr}, ${d.toLocaleTimeString(locale.code)}`;
}

/**
 * Renders a millisecond duration as clock-style `H:MM` (or `H:MM:SS` when
 * there's a non-zero seconds component). `ms` is never a user-typeable
 * unit (confirmed: it appears nowhere in `lexer/units.ts`) — it's only
 * ever produced by subtracting two clock times/datetimes (`9:30 - 8:30`,
 * `VM.ts`'s Datetime SUB case), so this is a safe, narrow special case,
 * not a general change to how durations display.
 */
function formatMsDuration(ms: number): string {
  const sign = ms < 0 ? "-" : "";
  const totalSeconds = Math.round(Math.abs(ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  if (seconds === 0) return `${sign}${hours}:${mm}`;
  const ss = String(seconds).padStart(2, "0");
  return `${sign}${hours}:${mm}:${ss}`;
}

function formatUom(value: number, unit: string | undefined, locale: ILocale, settings: FormattingSettings): string {
  if (unit === "ms") return `= ${formatMsDuration(value)}`;

  const dp = settings.unitOfMeasurementResult.decimalPlaces;
  const useUnitNames = settings.unitOfMeasurementResult.unitNames;

  // For TimeSpan values (days, weeks, hours, etc.), format as integer if the value is a whole number
  const timeSpanUnits = ["days", "weeks", "hours", "minutes", "seconds", "day", "week", "hour", "minute", "second"];
  const isTimeSpan = unit && timeSpanUnits.includes(unit);

  let formatted: string;
  if (isTimeSpan && value === Math.floor(value)) {
    // For whole number TimeSpan values, format as integer
    formatted = value.toString();
  } else {
    // For other values, use the configured decimal places
    formatted = value.toFixed(dp);
  }

  // Currency display: symbol + culturally-conventional placement (e.g.
  // "$100.00" prefix vs "100.00 kr" suffix) instead of the generic
  // "amount CODE" fallback below — see uom/CurrencyAliases.ts's
  // CURRENCY_DISPLAY table for the exact set covered and the reasoning
  // behind each placement choice. Any currency code NOT in that table
  // (most of the ~150 `CurrencyExchange.isCurrency()` recognizes) falls
  // through to the unchanged "amount CODE" format below.
  const currencyDisplay = unit ? CURRENCY_DISPLAY[unit.toUpperCase()] : undefined;
  if (currencyDisplay) {
    const sep = currencyDisplay.spaced ? " " : "";
    const withSymbol = currencyDisplay.position === "prefix"
      ? `${currencyDisplay.symbol}${sep}${formatted}`
      : `${formatted}${sep}${currencyDisplay.symbol}`;
    return `= ${withSymbol}`;
  }

  const unitLabel = useUnitNames ? (unit || "") : (unit || "");
  return `= ${formatted} ${unitLabel}`.trim();
}

function formatMatrixEntry(entry: MatrixEntry, settings: FormattingSettings): string {
  if (typeof entry === "boolean") return entry ? "true" : "false";
  if (typeof entry === "object" && entry !== null) return formatSymbolic(entry);
  const dp = settings.floatResult.decimalPlaces;
  const sep = settings.floatResult.enableSeperator;
  const loc = settings.numberResult.decimalSeparatorLocale;
  return autoFormatIntegerOrFloat(entry, dp, sep, loc);
}

/**
 * Renders a Matrix matching its own literal syntax: a single row (1xN,
 * including plain vectors) as `[a, b, c]`, a single column (Nx1) as
 * `[a; b; c]`, and a general shape as `[r0c0, r0c1; r1c0, r1c1]` — row-major
 * textual output read back out of the column-major storage
 * (`columnMajorToRowMajor()`), matching how `[1,2;3,4]` is written.
 */
function formatMatrix(m: MatrixData, locale: ILocale, settings: FormattingSettings): string {
  const rowMajor = columnMajorToRowMajor(m);
  const rows: string[] = [];
  for (let r = 0; r < m.rows; r++) {
    const cells: string[] = [];
    for (let c = 0; c < m.cols; c++) {
      cells.push(formatMatrixEntry(rowMajor[r * m.cols + c], settings));
    }
    rows.push(cells.join(", "));
  }
  return `${locale.display.resultPrefix}[${rows.join("; ")}]`;
}

function formatRange(min: number, max: number, locale: ILocale): string {
  return `${locale.display.resultPrefix}${min}:${max}`;
}

function formatPercentage(value: number, locale: ILocale, settings: FormattingSettings): string {
  // ValueType.Percentage stores a fraction (0.25 for 25%) — see Value.ts's
  // documented contract and the sole producer, VM.ts's TO_PERCENTAGE opcode
  // (`right/left - 1`, e.g. 0.25 for "800 to 1000"). Multiply by 100 before
  // formatting; without this every percentage-change result displayed as
  // e.g. "0.25%" instead of "25.00%".
  const dp = settings.percentageResult.decimalPlaces;
  const formatted = (value * 100).toFixed(dp);
  return `= ${formatted}${locale.display.percentageSuffix}`;
}

function formatUnit(value: number, unit: string | undefined): string {
  return `= ${value} ${unit || ""}`.trim();
}

/**
 * Render an evaluated {@link Value} as a display string, dispatching on
 * `value.type` to the type-specific formatter (number, hex, datetime, unit
 * of measurement, matrix, range, percentage, ...).
 *
 * Most branches produce a `"= "`-prefixed result string (matching the
 * plugin's inline-result convention); `ValueType.Error` is the one
 * exception — it returns the human-readable error message directly
 * (stored in `value.unit`), not an `"= "`-prefixed string.
 *
 * @param value - The evaluated value to format.
 * @param settings - Locale/precision/separator options; defaults to
 *   {@link DEFAULT_FORMATTING_SETTINGS} when omitted.
 * @example
 * ```typescript
 * const [value] = engine.evaluateExpression("10 USD to GBP");
 * formatValue(value); // "= £7.85" (exact output depends on live exchange rates)
 * ```
 */
export function formatValue(value: Value, settings?: FormattingSettings): string {
  const us = settings || DEFAULT_FORMATTING_SETTINGS;
  const localeCode = us.numberResult.decimalSeparatorLocale || "en";
  const locale = getLocale(localeCode);

  switch (value.type) {
    case ValueType.Number:
      return formatNumber(value.value as number, locale, us);
    case ValueType.Hex:
      return formatHex(value.value as number, us);
    case ValueType.BigInt:
      return formatBigInt(value.value as bigint);
    case ValueType.String:
      return formatString(value.value as string);
    case ValueType.Boolean:
      return formatBoolean(value.value as boolean);
    case ValueType.Datetime:
      return formatDatetime(value.value as number, locale);
    case ValueType.Uom:
      return formatUom(value.value as number, value.unit, locale, us);
    case ValueType.Matrix:
      return formatMatrix(value.value as MatrixData, locale, us);
    case ValueType.Range: {
      const r = value.value as RangeData;
      return formatRange(r.min, r.max, locale);
    }
    case ValueType.Symbolic:
      return formatSymbolic(value.value as SymbolicNode);
    case ValueType.Percentage:
      return formatPercentage(value.value as number, locale, us);
    case ValueType.Unit:
      return formatUnit(value.value as number, value.unit);
    case ValueType.Error:
      // errorValue(code, message) stores the human-readable message in
      // `.unit` (code goes in `.value`) — falling through to the default
      // case here previously displayed the raw code (e.g.
      // "CURRENCY_RATE_UNAVAILABLE") instead of the actual message.
      return value.unit ?? String(value.value);
    default:
      return `= ${String(value.value)}`;
  }
}
