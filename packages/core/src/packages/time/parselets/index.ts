export { ClockTimeParselet } from "./ClockTimeParselet";
export { ClockTimeIntervalParselet } from "./ClockTimeIntervalParselet";
export { FpsRateParselet } from "./FpsRateParselet";
export { LaptimeParselet } from "./LaptimeParselet";
export { timeOrDateInZoneParselet } from "./TimeInZoneParselet";
export { TimeDifferenceParselet } from "./TimeDifferenceParselet";
export { VideoTimecodeParselet } from "./VideoTimecodeParselet";
export { FrameCountParselet } from "./FrameCountParselet";

import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { ClockTimeParselet } from "./ClockTimeParselet";
import { ClockTimeIntervalParselet } from "./ClockTimeIntervalParselet";
import { FpsRateParselet } from "./FpsRateParselet";
import { LaptimeParselet } from "./LaptimeParselet";
import { timeOrDateInZoneParselet } from "./TimeInZoneParselet";
import { TimeDifferenceParselet } from "./TimeDifferenceParselet";
import { VideoTimecodeParselet } from "./VideoTimecodeParselet";
import { FrameCountParselet } from "./FrameCountParselet";
import { TIME_IN_ZONE_FN_IDX, DATE_IN_ZONE_FN_IDX } from "./TimezonePluginFunctions";

/**
 * Registers parselets only — NOT the `pluginFunctions` handlers
 * (`ZONE_CONVERT_FN_IDX` etc.) that `ClockTimeParselet`'s zone-suffix and
 * `TimeDifferenceParselet` compile to via `CALL_PLUGIN`. A test using this
 * lightweight harness (not a real `ExpressionEngine`) needs to also
 * register those handlers into `pluginFunctionRegistry` itself — see
 * `TimeParselets.spec.ts`'s timezone describe block for the pattern.
 */
export function registerTimeParselets(registry: ParseletRegistry): void {
  registry.registerPrefix("CLOCK_TIME", new ClockTimeParselet());
  registry.registerPrefix("CLOCK_TIME_INTERVAL", new ClockTimeIntervalParselet());
  registry.registerPrefix("FPS_RATE", new FpsRateParselet());
  registry.registerPrefix("LAPTIME", new LaptimeParselet());
  registry.registerPrefix("TIME_IN", timeOrDateInZoneParselet(TIME_IN_ZONE_FN_IDX));
  registry.registerPrefix("DATE_IN", timeOrDateInZoneParselet(DATE_IN_ZONE_FN_IDX));
  registry.registerPrefix("TIME_DIFFERENCE_BETWEEN", new TimeDifferenceParselet());
  registry.registerPrefix("VIDEO_TIMECODE", new VideoTimecodeParselet());
  registry.registerPrefix("FRAME_COUNT", new FrameCountParselet());
}
