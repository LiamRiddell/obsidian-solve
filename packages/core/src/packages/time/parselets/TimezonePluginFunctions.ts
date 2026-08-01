import { Value, stringValue } from "@solve-js/vm/Value";
import { allocatePluginFunctionIndex } from "@solve-js/vm/VMBuiltins";
import {
  zonedWallClockToUtcMs, formatTimeInZone, formatDateInZone,
  dayShiftBetweenZones, resolveOffsetMinutes,
} from "../timezones/ZoneMath";

/**
 * Timezone plugin functions — registered via `pluginFunctions` (not
 * `VMBuiltins.ts`'s shared `builtinFunctions` registry), since this logic
 * is genuinely Time-package-specific (city/IANA-zone lookups), unlike the
 * generic math functions (`gcd`, `sqrt`, ...) that belong in the shared
 * registry. Matches `examples/osrs`'s `OsrsParselet.ts` pattern:
 * `allocatePluginFunctionIndex()` once at module scope per function,
 * `CALL_PLUGIN` + the allocated index in the parselet, the actual handler
 * registered in `TimePackage.ts`'s `pluginFunctions` field.
 */

export const ZONE_CONVERT_FN_IDX = allocatePluginFunctionIndex();
export const TIME_IN_ZONE_FN_IDX = allocatePluginFunctionIndex();
export const DATE_IN_ZONE_FN_IDX = allocatePluginFunctionIndex();
export const TIME_DIFFERENCE_FN_IDX = allocatePluginFunctionIndex();

/**
 * `<clock-time> <sourceZone> in <targetZone>` -> targetZone's wall-clock
 * for that instant, e.g. "6pm Sydney in Chicago" -> "1:00 AM (-1 day)".
 * Anchored to today's (system-local) calendar date, matching
 * `ClockTimeParselet`'s own "today" convention for the bare (no zone)
 * form.
 */
export function zoneConvertHandler(args: Value[]): Value {
  const totalMinutes = args[0].toNumber();
  const sourceZoneRef = args[1].value as string;
  const targetZoneRef = args[2].value as string;

  const today = new Date();
  const utcMs = zonedWallClockToUtcMs(
    today.getFullYear(), today.getMonth(), today.getDate(),
    Math.floor(totalMinutes / 60), totalMinutes % 60,
    sourceZoneRef,
  );

  const time = formatTimeInZone(utcMs, targetZoneRef);
  const dayShift = dayShiftBetweenZones(utcMs, targetZoneRef, sourceZoneRef);
  if (dayShift === 0) return stringValue(time);
  const sign = dayShift > 0 ? "+" : "";
  return stringValue(`${time} (${sign}${dayShift} day${Math.abs(dayShift) === 1 ? "" : "s"})`);
}

/** `time in <city>` -> that zone's current wall-clock time, e.g. "3:45 PM". */
export function timeInZoneHandler(args: Value[]): Value {
  const zoneRef = args[0].value as string;
  return stringValue(formatTimeInZone(Date.now(), zoneRef));
}

/** `date in <city>` -> that zone's current calendar date, e.g. "July 31, 2026". */
export function dateInZoneHandler(args: Value[]): Value {
  const zoneRef = args[0].value as string;
  return stringValue(formatDateInZone(Date.now(), zoneRef));
}

/**
 * `time difference between <city1> and <city2>` -> a directional,
 * human-readable offset delta, e.g. "Moscow is 8 hours ahead of Seattle".
 * Computed at the current instant — a zone's offset can shift across a
 * DST transition, so this is a live "right now" answer, not a fixed
 * constant.
 *
 * Takes 4 args: [zoneRef1, zoneRef2, displayName1, displayName2]. The
 * display names are the user's OWN typed text (see
 * `ZoneReference.ts`'s `displayName`), not derived from the resolved
 * zone — "Seattle" and "Los Angeles" both resolve to the same IANA zone
 * (`America/Los_Angeles`), and deriving the label from the zone id alone
 * would silently rename whichever one the user didn't type.
 */
export function timeDifferenceHandler(args: Value[]): Value {
  const zoneRef1 = args[0].value as string;
  const zoneRef2 = args[1].value as string;
  const label1 = args[2].value as string;
  const label2 = args[3].value as string;
  const now = Date.now();

  const offset1 = resolveOffsetMinutes(zoneRef1, now);
  const offset2 = resolveOffsetMinutes(zoneRef2, now);
  const diff = offset2 - offset1;

  if (diff === 0) {
    return stringValue(`${label2} and ${label1} currently share the same UTC offset`);
  }
  const ahead = diff > 0 ? label2 : label1;
  const behind = diff > 0 ? label1 : label2;
  const absDiff = Math.abs(diff);
  const hours = Math.floor(absDiff / 60);
  const minutes = absDiff % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  return stringValue(`${ahead} is ${parts.join(" ")} ahead of ${behind}`);
}
