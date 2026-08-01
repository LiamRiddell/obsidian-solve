import { Value, ValueType } from "@solve-js/vm/Value";
import { getLocale, type ILocale } from "@solve-js/constants/locales";
import { autoFormatIntegerOrFloat } from "@solve-js/utilities/Number";
import { FormattingSettings, DEFAULT_FORMATTING_SETTINGS } from "./FormattingSettings";
import { CURRENCY_DISPLAY } from "@solve-js/uom/CurrencyAliases";

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

function formatDatetime(value: number, locale: ILocale): string {
  const d = new Date(value);
  if (locale.display.dateFormat === "default") {
    return `= ${d.toLocaleString()}`;
  }
  return `= ${d.toLocaleString()}`;
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

function formatVector(values: number[], locale: ILocale): string {
  return `= [${values.join(", ")}]`;
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
 * of measurement, vector, percentage, ...).
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
    case ValueType.Array:
      return formatVector(value.value as number[], locale);
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
