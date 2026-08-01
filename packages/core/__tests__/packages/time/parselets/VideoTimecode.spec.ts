/**
 * Time package — video timecode & frame rates.
 *
 * A timecode literal (`HH:MM:SS:FF at/@ <N> fps`) depends on phrase-
 * independent normalizer rules (`videoTimecodeNormalizerRule`,
 * `frameCountNormalizerRule`, plus the pre-existing `fpsRateNormalizerRule`
 * for the `N fps` suffix), which only run inside a real, fully-constructed
 * `ExpressionEngine` (TokenNormalizer isn't wired into the lightweight
 * isolated tokenize+parse-registry harness used elsewhere in this
 * codebase) — every test below goes through `evalReal()`, matching
 * `WorkdaysAndTimestamps.spec.ts`'s same reasoning.
 *
 * Represented internally as `Uom(totalFrames, "timecode@<fps>")` (see
 * `vm/Value.ts`'s timecode section) — storing the TOTAL frame count means
 * carry/borrow arithmetic (e.g. "frame 29 + 2 frames" at 30fps landing on
 * frame 1 of the next second) is exercised implicitly by every arithmetic
 * test below, not tested as a separate code path.
 */

import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { ValueType } from "@solve-js/vm/Value";

function evalReal(expr: string) {
  const engine = new ExpressionEngine("en");
  const [value] = engine.evaluateExpression(expr);
  return value;
}

describe("HH:MM:SS:FF at/@ <N> fps — literal construction", () => {
  test('"01:02:03:04 at 30 fps" -> Uom(111694, "timecode@30")', () => {
    const v = evalReal("01:02:03:04 at 30 fps");
    expect(v.type).toBe(ValueType.Uom);
    expect(v.unit).toBe("timecode@30");
    // ((1*3600 + 2*60 + 3) * 30) + 4 = (3723 * 30) + 4 = 111690 + 4
    expect(v.toNumber()).toBe(111694);
  });

  test('"@" is accepted as an alternate separator, identical result to "at"', () => {
    const withAt = evalReal("01:02:03:04 at 30 fps");
    const withSymbol = evalReal("01:02:03:04 @ 30 fps");
    expect(withSymbol.toNumber()).toBe(withAt.toNumber());
    expect(withSymbol.unit).toBe(withAt.unit);
  });

  test("00:00:00:00 at 24 fps -> 0 total frames", () => {
    expect(evalReal("00:00:00:00 at 24 fps").toNumber()).toBe(0);
  });

  test("00:00:01:00 at 30 fps -> 30 total frames (1 second)", () => {
    expect(evalReal("00:00:01:00 at 30 fps").toNumber()).toBe(30);
  });

  test("a video timecode with no frame rate at all (end of input) is a clear parse error", () => {
    expect(() => evalReal("01:02:03:04")).toThrow(/frame rate/i);
  });

  test("a video timecode followed by neither 'at'/'@'/fps throws a clear error", () => {
    let threw = false;
    try {
      evalReal("01:02:03:04 + 1");
    } catch (e) {
      threw = true;
      expect(String(e)).toMatch(/frame rate/i);
    }
    expect(threw).toBe(true);
  });

  test("a frame number out of range for the given fps is a parse error", () => {
    let threw = false;
    try {
      evalReal("00:00:00:30 at 30 fps"); // valid frame indices are 0-29 at 30fps
    } catch (e) {
      threw = true;
      expect(String(e)).toMatch(/out of range/i);
    }
    expect(threw).toBe(true);
  });
});

describe("timecode in frames / timecode @ fps in frames", () => {
  test('"01:02:03:04 at 30 fps in frames" re-tags as a plain Uom("frames") with the SAME number', () => {
    const v = evalReal("01:02:03:04 at 30 fps in frames");
    expect(v.type).toBe(ValueType.Uom);
    expect(v.unit).toBe("frames");
    expect(v.toNumber()).toBe(111694);
  });

  test('works identically with the "@" separator', () => {
    const v = evalReal("01:02:03:04 @ 30 fps in frames");
    expect(v.unit).toBe("frames");
    expect(v.toNumber()).toBe(111694);
  });
});

describe("<N> frames @ <fps> — reverse conversion to HH:MM:SS:FF", () => {
  test('"900 frames @ 30 fps" -> "00:00:30:00" (900 frames / 30fps = 30 seconds)', () => {
    const v = evalReal("900 frames @ 30 fps");
    expect(v.type).toBe(ValueType.String);
    expect(v.value).toBe("00:00:30:00");
  });

  test('"111694 frames at 30 fps" round-trips the literal construction example back to HH:MM:SS:FF', () => {
    const v = evalReal("111694 frames at 30 fps");
    expect(v.value).toBe("01:02:03:04");
  });

  test('a bare "<N> frames" with no "@ fps" stays a plain Uom("frames") duration', () => {
    const v = evalReal("10 frames");
    expect(v.type).toBe(ValueType.Uom);
    expect(v.unit).toBe("frames");
    expect(v.toNumber()).toBe(10);
  });
});

describe("timecode arithmetic — carry/borrow via plain frame-count addition", () => {
  test("frame 29 + 2 frames at 30fps carries into frame 1 of the next second", () => {
    const v = evalReal("00:00:00:29 at 30 fps + 2 frames");
    expect(v.type).toBe(ValueType.Uom);
    expect(v.unit).toBe("timecode@30");
    expect(v.toNumber()).toBe(31);
    // Convert back to display notation to show the carry landed correctly.
    const display = evalReal("31 frames at 30 fps");
    expect(display.value).toBe("00:00:01:01");
  });

  test("timecode + duration (10 minutes) converts the duration to frames at the timecode's own fps", () => {
    const v = evalReal("00:00:00:29 at 30 fps + 10 minutes");
    // 10 min = 600s * 30fps = 18000 frames, + 29 = 18029
    expect(v.toNumber()).toBe(18029);
    expect(v.unit).toBe("timecode@30");
  });

  test("timecode - timecode (difference) yields a plain Uom(\"frames\") count, not another timecode", () => {
    const v = evalReal("00:01:00:00 at 30 fps - 00:00:30:00 at 30 fps");
    expect(v.type).toBe(ValueType.Uom);
    expect(v.unit).toBe("frames");
    expect(v.toNumber()).toBe(900); // 1800 - 900
  });

  test("timecode + timecode (sum) stays a timecode value (clip-duration concatenation semantics)", () => {
    const v = evalReal("00:00:30:00 at 30 fps + 00:00:30:00 at 30 fps");
    expect(v.type).toBe(ValueType.Uom);
    expect(v.unit).toBe("timecode@30");
    expect(v.toNumber()).toBe(1800); // 900 + 900 = 1 minute
    const display = evalReal("1800 frames at 30 fps");
    expect(display.value).toBe("00:01:00:00");
  });

  test("combining timecodes at DIFFERENT frame rates is a clear error, not silently wrong math", () => {
    const v = evalReal("00:00:01:00 at 30 fps - 00:00:01:00 at 25 fps");
    expect(v.type).toBe(ValueType.Error);
  });
});

describe("30 fps x <duration> — pre-existing Rate composition is unaffected", () => {
  test('"30 fps * 3 minutes" -> 5,400 frames (already-shipped behavior, still works)', () => {
    const v = evalReal("30 fps * 3 minutes");
    expect(v.type).toBe(ValueType.Uom);
    expect(v.unit).toBe("frames");
    expect(v.toNumber()).toBe(5400);
  });
});

describe("regression guard: 'frames'/'fps' stay usable as plain identifiers/variables", () => {
  // Neither "frames" nor "fps" were added to the locale keywordMap or
  // lexer/units.ts's known-unit set (see FrameCountNormalizerRule.ts's doc
  // comment) — both are matched as plain IDENT tokens only when they
  // immediately follow a number, so a bare use elsewhere is untouched.
  test(":frames = 2 still assigns as a plain variable", () => {
    const v = evalReal(":frames = 2");
    expect(v.type).toBe(ValueType.Number);
    expect(v.toNumber()).toBe(2);
  });

  test(":fps = 5 still assigns as a plain variable", () => {
    const v = evalReal(":fps = 5");
    expect(v.toNumber()).toBe(5);
  });
});
