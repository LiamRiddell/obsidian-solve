import { Value, ValueType } from "@solve-js/vm/Value";
import { getLocale, type ILocale } from "@solve-js/constants/locales";
import { autoFormatIntegerOrFloat } from "@solve-js/utilities/Number";
import { FormattingSettings, DEFAULT_FORMATTING_SETTINGS } from "./FormattingSettings";

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

function formatUom(value: number, unit: string | undefined, locale: ILocale, settings: FormattingSettings): string {
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
  
  const unitLabel = useUnitNames ? (unit || "") : (unit || "");
  return `= ${formatted} ${unitLabel}`.trim();
}

function formatVector(values: number[], locale: ILocale): string {
  return `= [${values.join(", ")}]`;
}

function formatPercentage(value: number, locale: ILocale, settings: FormattingSettings): string {
  const dp = settings.percentageResult.decimalPlaces;
  const formatted = value.toFixed(dp);
  return `= ${formatted}${locale.display.percentageSuffix}`;
}

function formatUnit(value: number, unit: string | undefined): string {
  return `= ${value} ${unit || ""}`.trim();
}

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
    case ValueType.Vector2:
    case ValueType.Vector3:
    case ValueType.Vector4:
      return formatVector(value.value as number[], locale);
    case ValueType.Percentage:
      return formatPercentage(value.value as number, locale, us);
    case ValueType.Unit:
      return formatUnit(value.value as number, value.unit);
    default:
      return `= ${String(value.value)}`;
  }
}
