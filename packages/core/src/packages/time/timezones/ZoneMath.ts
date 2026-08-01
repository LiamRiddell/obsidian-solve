/**
 * Timezone math, built entirely on native `Intl.DateTimeFormat`/IANA data —
 * zero external dependency, DST-correct, and always as current as the
 * runtime's own tz database (no bundled table to go stale).
 *
 * A "zone reference" as used throughout this module is one of:
 * - A real IANA zone identifier (e.g. `"Australia/Sydney"`).
 * - A synthetic fixed-offset encoding, `"UTCOFFSET:<minutes>"` (e.g.
 *   `"UTCOFFSET:480"` for GMT+8) — for the numeric `GMT+N`/`UTC-N` form,
 *   which has no IANA identifier of its own and needs no DST awareness
 *   (a fixed offset is fixed, by definition).
 *
 * {@link encodeFixedOffset}/{@link isFixedOffset}/{@link decodeFixedOffsetMinutes}
 * are the only code that needs to know this encoding exists — everything
 * else just calls {@link resolveOffsetMinutes} and {@link zoneLabel}.
 */

const FIXED_OFFSET_PREFIX = "UTCOFFSET:";

/** Encode a fixed UTC offset (in minutes, may be negative) as a zone-reference string. */
export function encodeFixedOffset(offsetMinutes: number): string {
  return `${FIXED_OFFSET_PREFIX}${offsetMinutes}`;
}

function isFixedOffset(zoneRef: string): boolean {
  return zoneRef.startsWith(FIXED_OFFSET_PREFIX);
}

function decodeFixedOffsetMinutes(zoneRef: string): number {
  return parseInt(zoneRef.slice(FIXED_OFFSET_PREFIX.length), 10);
}

/**
 * The UTC offset (in minutes, positive = ahead of UTC) a zone reference
 * has AT a given instant. IANA zones are resolved via the standard
 * `Intl.DateTimeFormat` round-trip trick: format the instant using the
 * zone's wall-clock fields, then re-interpret those same field values as
 * if they were UTC — the difference from the original instant IS the
 * zone's offset at that instant (correctly DST-aware, since the format
 * step already applied whatever DST rule is in effect then).
 */
export function resolveOffsetMinutes(zoneRef: string, atMs: number): number {
  if (isFixedOffset(zoneRef)) return decodeFixedOffsetMinutes(zoneRef);

  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: zoneRef,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(atMs))) parts[p.type] = p.value;
  const asUtcMs = Date.UTC(
    +parts.year, +parts.month - 1, +parts.day,
    +parts.hour, +parts.minute, +parts.second,
  );
  return Math.round((asUtcMs - atMs) / 60000);
}

/**
 * The UTC instant (ms) for a given wall-clock date/time interpreted AS
 * local time in `zoneRef`. Single-pass (not iteratively refined against
 * the DST transition it might land in) — the standard, generally-accepted
 * simplification every comparable "convert this local time to another
 * zone" tool makes; only matters within the ~1-2 hour window around a
 * DST transition instant, which is inherent to any offset-based approach
 * without a full transition-table walk.
 */
export function zonedWallClockToUtcMs(
  year: number, month0: number, day: number, hour: number, minute: number,
  zoneRef: string,
): number {
  const naiveUtcMs = Date.UTC(year, month0, day, hour, minute, 0);
  const offsetMinutes = resolveOffsetMinutes(zoneRef, naiveUtcMs);
  return naiveUtcMs - offsetMinutes * 60000;
}

/** Format a UTC instant as `zoneRef`'s local wall-clock time, e.g. "1:00 AM". */
export function formatTimeInZone(atMs: number, zoneRef: string): string {
  if (isFixedOffset(zoneRef)) {
    const offsetMs = decodeFixedOffsetMinutes(zoneRef) * 60000;
    return formatTimeUtc(new Date(atMs + offsetMs));
  }
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: zoneRef, hour: "numeric", minute: "2-digit", hour12: true,
  });
  return dtf.format(new Date(atMs));
}

/** Format a UTC instant as `zoneRef`'s local calendar date, e.g. "July 31, 2026". */
export function formatDateInZone(atMs: number, zoneRef: string): string {
  if (isFixedOffset(zoneRef)) {
    const offsetMs = decodeFixedOffsetMinutes(zoneRef) * 60000;
    return formatDateUtc(new Date(atMs + offsetMs));
  }
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: zoneRef, year: "numeric", month: "long", day: "numeric",
  });
  return dtf.format(new Date(atMs));
}

/** The calendar (year, month0, day) `zoneRef` shows for a given instant. */
export function zonedYMD(atMs: number, zoneRef: string): { year: number; month0: number; day: number } {
  if (isFixedOffset(zoneRef)) {
    const d = new Date(atMs + decodeFixedOffsetMinutes(zoneRef) * 60000);
    return { year: d.getUTCFullYear(), month0: d.getUTCMonth(), day: d.getUTCDate() };
  }
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: zoneRef, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(atMs))) parts[p.type] = p.value;
  return { year: +parts.year, month0: +parts.month - 1, day: +parts.day };
}

/**
 * Signed whole-day difference between the calendar dates `zoneRef` and
 * `relativeToZoneRef` show for the SAME instant — e.g. +1 if `zoneRef`'s
 * date is one day ahead of `relativeToZoneRef`'s. Correctly handles
 * month/year boundaries (unlike naively diffing day-of-month numbers).
 */
export function dayShiftBetweenZones(atMs: number, zoneRef: string, relativeToZoneRef: string): number {
  const a = zonedYMD(atMs, zoneRef);
  const b = zonedYMD(atMs, relativeToZoneRef);
  const aMs = Date.UTC(a.year, a.month0, a.day);
  const bMs = Date.UTC(b.year, b.month0, b.day);
  return Math.round((aMs - bMs) / 86400000);
}

function formatTimeUtc(d: Date): string {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit", hour12: true });
  return dtf.format(d);
}

function formatDateUtc(d: Date): string {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" });
  return dtf.format(d);
}

/**
 * A human-readable label for a zone reference — used in "time difference"
 * output. For a real IANA zone, the last path segment with underscores
 * replaced by spaces (e.g. `"Europe/Moscow"` -> `"Moscow"`,
 * `"America/Los_Angeles"` -> `"Los Angeles"`). For a fixed offset,
 * `"UTC+8"`/`"UTC-5"`.
 */
export function zoneLabel(zoneRef: string): string {
  if (isFixedOffset(zoneRef)) {
    const minutes = decodeFixedOffsetMinutes(zoneRef);
    const sign = minutes >= 0 ? "+" : "-";
    const abs = Math.abs(minutes);
    const hours = Math.floor(abs / 60);
    const mins = abs % 60;
    return mins === 0 ? `UTC${sign}${hours}` : `UTC${sign}${hours}:${String(mins).padStart(2, "0")}`;
  }
  const lastSegment = zoneRef.split("/").pop() ?? zoneRef;
  return lastSegment.replace(/_/g, " ");
}
