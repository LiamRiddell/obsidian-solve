import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { ClockTimeParselet } from "./parselets/ClockTimeParselet";
import { ClockTimeIntervalParselet } from "./parselets/ClockTimeIntervalParselet";
import { FpsRateParselet } from "./parselets/FpsRateParselet";
import { LaptimeParselet } from "./parselets/LaptimeParselet";
import { timeOrDateInZoneParselet } from "./parselets/TimeInZoneParselet";
import { TimeDifferenceParselet } from "./parselets/TimeDifferenceParselet";
import { VideoTimecodeParselet } from "./parselets/VideoTimecodeParselet";
import { FrameCountParselet } from "./parselets/FrameCountParselet";
import {
  ZONE_CONVERT_FN_IDX, TIME_IN_ZONE_FN_IDX, DATE_IN_ZONE_FN_IDX, TIME_DIFFERENCE_FN_IDX,
  zoneConvertHandler, timeInZoneHandler, dateInZoneHandler, timeDifferenceHandler,
} from "./parselets/TimezonePluginFunctions";
import { clockTimeNormalizerRule } from "./normalizer/ClockTimeNormalizerRule";
import { clockTimeIntervalNormalizerRule } from "./normalizer/ClockTimeIntervalNormalizerRule";
import { fpsRateNormalizerRule } from "./normalizer/FpsRateNormalizerRule";
import { laptimeNormalizerRule } from "./normalizer/LaptimeNormalizerRule";
import { videoTimecodeNormalizerRule } from "./normalizer/VideoTimecodeNormalizerRule";
import { frameCountNormalizerRule } from "./normalizer/FrameCountNormalizerRule";
import { MULTI_WORD_CITY_ZONES } from "./timezones/CityZones";

/**
 * Clock-time-of-day arithmetic: `9:00am`, `16:00`, `4pm` (anchored to
 * today's calendar date), `7:30 to 20:45` / `4pm to 3am` interval
 * durations (midnight-rollover aware), `30 fps` frame-rate literals (a
 * `Rate` value — see `vm/Value.ts`), and `03:04:05` / `00:00:01.5`
 * lap-time/stopwatch-split durations (two colons, vs clock-time's one).
 * Distinct from the Datetime package's calendar-date arithmetic — see
 * `packages/time/` vs `packages/datetime/`.
 *
 * Full HH:MM:SS:FF video-timecode literal parsing + fps-aware carry
 * arithmetic: `01:02:03:04 at 30 fps` / `... @ 30 fps` (a `Uom(totalFrames,
 * "timecode@<fps>")` value — see `vm/Value.ts`'s timecode section),
 * `timecode + N frames` / `+ <duration>` / `+ timecode` (sum) / `-
 * timecode` (difference) — all special-cased in `vm/VM.ts`'s ADD/SUB
 * dispatch (`combineTimecode()`) — plus `timecode in frames` and the
 * reverse `<N> frames @ <fps>` -> `HH:MM:SS:FF` string conversion (see
 * `parselets/VideoTimecodeParselet.ts`/`FrameCountParselet.ts` and
 * `timecode/TimecodeMath.ts`). `30 fps × <duration>` frame-count math
 * (below) composes with this unchanged — the fps literal itself is
 * unaffected by any of the above. Likewise, pretty-printing a duration
 * back as `"3 hours 15 min"` (`as timespan`) or `"03:04:05"` (`as
 * laptime`) is a `converters` package (Phase 1c) concern — this package
 * only produces the underlying `Uom` values.
 *
 * Also: timezone conversion (`6pm Sydney in Chicago`), current
 * time/date-in-a-zone queries (`time in Paris`, `date in Vancouver`), and
 * zone-offset deltas (`time difference between Seattle and Moscow`) — see
 * `timezones/CityZones.ts`/`ZoneMath.ts`. Built entirely on native
 * `Intl.DateTimeFormat`/IANA data, no external dependency. Results are
 * `String` values (formatted, human-readable), not `Datetime` — this
 * engine's `Datetime` representation is a bare epoch-ms number with no
 * zone tag, so there's no way to represent "this instant, but interpreted
 * through zone X" as anything other than a pre-formatted string; see
 * `ZoneMath.ts`'s doc comment.
 *
 * SCOPE DECISION: the alternate phrasing `<City> time` (e.g. "Tokyo
 * time", city first) is deliberately NOT implemented — it would need
 * "time" registered as a keyword reachable from a BARE city identifier's
 * infix position, and "time" is exactly the kind of common noun this
 * session found real trouble with (see MathPhrasesPackage.ts's "total"
 * regression note). `time in <city>` covers the same need unambiguously.
 */
export const TIME_PACKAGE: IEnginePackage = {
  name: "solve-time",
  phrases: {
    "time in": "TIME_IN",
    "date in": "DATE_IN",
    "time difference between": "TIME_DIFFERENCE_BETWEEN",
    ...Object.fromEntries(Object.keys(MULTI_WORD_CITY_ZONES).map((phrase) => [phrase, "CITY_NAME"])),
  },
  prefixParselets: [
    { tokenType: "CLOCK_TIME", parselet: new ClockTimeParselet() },
    { tokenType: "CLOCK_TIME_INTERVAL", parselet: new ClockTimeIntervalParselet() },
    { tokenType: "FPS_RATE", parselet: new FpsRateParselet() },
    { tokenType: "LAPTIME", parselet: new LaptimeParselet() },
    { tokenType: "TIME_IN", parselet: timeOrDateInZoneParselet(TIME_IN_ZONE_FN_IDX) },
    { tokenType: "DATE_IN", parselet: timeOrDateInZoneParselet(DATE_IN_ZONE_FN_IDX) },
    { tokenType: "TIME_DIFFERENCE_BETWEEN", parselet: new TimeDifferenceParselet() },
    { tokenType: "VIDEO_TIMECODE", parselet: new VideoTimecodeParselet() },
    { tokenType: "FRAME_COUNT", parselet: new FrameCountParselet() },
  ],
  normalizerRules: [
    clockTimeNormalizerRule(),
    clockTimeIntervalNormalizerRule(),
    fpsRateNormalizerRule(),
    laptimeNormalizerRule(),
    videoTimecodeNormalizerRule(),
    frameCountNormalizerRule(),
  ],
  pluginFunctions: [
    { index: ZONE_CONVERT_FN_IDX, handler: zoneConvertHandler },
    { index: TIME_IN_ZONE_FN_IDX, handler: timeInZoneHandler },
    { index: DATE_IN_ZONE_FN_IDX, handler: dateInZoneHandler },
    { index: TIME_DIFFERENCE_FN_IDX, handler: timeDifferenceHandler },
  ],
};
