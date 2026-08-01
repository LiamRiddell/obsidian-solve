/**
 * Video-timecode display formatting — converting a total frame count back
 * into `HH:MM:SS:FF` notation. The reverse direction (`HH:MM:SS:FF` ->
 * total frames) is simple arithmetic done inline in
 * `parselets/VideoTimecodeParselet.ts` (`((h*3600 + m*60 + s) * fps) + f`);
 * this file only has the "put the carry back" direction, matching
 * `timezones/ZoneMath.ts`'s "compute then return a formatted String Value"
 * pattern for the same kind of display-only conversion.
 */

/**
 * Convert a total frame count (at a given fps) into `HH:MM:SS:FF` display
 * notation.
 *
 * SCOPE DECISION: buckets frames-per-second by `Math.round(fps)`
 * regardless of whether fps is a whole number (e.g. NTSC's 29.97fps).
 * This is plain non-drop-frame timecode math — exact for integer fps
 * (24/25/30/60/...) and a reasonable, clearly-scoped-down approximation
 * for fractional fps. It does NOT implement SMPTE drop-frame timecode
 * notation, which periodically skips frame NUMBERS (not actual frames) to
 * keep 29.97fps timecode approximately in sync with wall-clock time —
 * that's a real, separate piece of the SMPTE spec this pass doesn't take
 * on, matching this session's established pattern of documenting a
 * deliberate simplification rather than silently guessing.
 */
export function framesToTimecodeString(totalFrames: number, fps: number): string {
  const fpsWhole = Math.max(1, Math.round(fps));
  const pad = (n: number) => String(n).padStart(2, "0");

  const frameCount = Math.trunc(totalFrames);
  // Modulo can return a negative result in JS for a negative dividend —
  // the double-modulo pattern keeps the frame field in [0, fpsWhole).
  const frames = ((frameCount % fpsWhole) + fpsWhole) % fpsWhole;
  const totalSeconds = Math.floor(frameCount / fpsWhole);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
}
