/**
 * Rate value primitive — RATE_DIV / RATE_MUL / RATE_CONVERT.
 *
 * Phase 0 foundational primitive for SoulverCore feature parity (see the
 * approved plan): "$99/week", "3 hours/day", "30 fps" style values. Built
 * and tested standalone here, BEFORE any consuming package (Time,
 * Finance) exists, per the plan's explicit sequencing.
 *
 * Bytecode is constructed by hand (no lexer/parser involved) — these
 * tests exercise the VM opcodes directly, matching the level this
 * primitive actually operates at. A real package's parselet is
 * responsible for deciding WHEN to emit RATE_DIV vs plain DIV, etc.
 */

import { describe, expect, test } from "@jest/globals";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { createVM, executeBytecode, unwrapEvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { ValueType, Value, isRateUnit, splitRateUnit, joinRateUnit } from "@solve-js/vm/Value";

function run(build: (b: BytecodeBuilder) => void): Value {
  const builder = new BytecodeBuilder();
  build(builder);
  const program = builder.build();
  const vm = createVM(sharedOpRegistry);
  const result = executeBytecode(
    { opcodes: new Uint8Array(program.opcodes), numbers: new Float64Array(program.numbers), strings: program.strings },
    vm
  );
  return unwrapEvalResult(result);
}

function pushUom(b: BytecodeBuilder, value: number, unit: string): void {
  b.emitOpcode(OpCode.PUSH_NUMBER);
  b.emitNumber(value);
  b.emitOpcode(OpCode.PUSH_STRING);
  b.emitString(unit);
  b.emitOpcode(OpCode.UOM_CONVERT); // number + unit-name string -> Uom(value, unit), no target conversion
}

function pushString(b: BytecodeBuilder, s: string): void {
  b.emitOpcode(OpCode.PUSH_STRING);
  b.emitString(s);
}

describe("Value.ts — rate unit string helpers", () => {
  test("isRateUnit distinguishes compound units from plain ones", () => {
    expect(isRateUnit("USD/week")).toBe(true);
    expect(isRateUnit("USD")).toBe(false);
    expect(isRateUnit(undefined)).toBe(false);
  });

  test("splitRateUnit / joinRateUnit round-trip", () => {
    expect(splitRateUnit("frames/s")).toEqual({ numerator: "frames", denominator: "s" });
    expect(joinRateUnit("frames", "s")).toBe("frames/s");
  });

  test("splitRateUnit throws on a non-rate unit", () => {
    expect(() => splitRateUnit("USD")).toThrow(/not a rate unit/i);
  });
});

describe("RATE_DIV — rate construction", () => {
  test("90 km / 3 day -> 30 km/day", () => {
    const result = run((b) => {
      pushUom(b, 90, "km");
      pushUom(b, 3, "day");
      b.emitOpcode(OpCode.RATE_DIV);
    });
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("km/day");
    expect(result.toNumber()).toBeCloseTo(30);
  });

  test("a bare Number numerator produces an empty-string (dimensionless) numerator", () => {
    const result = run((b) => {
      b.emitOpcode(OpCode.PUSH_NUMBER);
      b.emitNumber(500);
      pushUom(b, 1, "day");
      b.emitOpcode(OpCode.RATE_DIV);
    });
    expect(result.unit).toBe("/day");
    expect(result.toNumber()).toBe(500);
  });

  test("errors cleanly when the denominator has no unit", () => {
    const result = run((b) => {
      pushUom(b, 90, "km");
      b.emitOpcode(OpCode.PUSH_NUMBER);
      b.emitNumber(3);
      b.emitOpcode(OpCode.RATE_DIV);
    });
    expect(result.type).toBe(ValueType.Error);
  });
});

describe("RATE_MUL — rate × matching-measure quantity", () => {
  test("$50/week × 12 weeks -> $600", () => {
    const result = run((b) => {
      pushUom(b, 50, "USD/week");
      pushUom(b, 12, "weeks");
      b.emitOpcode(OpCode.RATE_MUL);
    });
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("USD");
    expect(result.toNumber()).toBeCloseTo(600);
  });

  test("30 fps × 3 minutes -> 5,400 frames", () => {
    const result = run((b) => {
      pushUom(b, 30, "frames/s");
      pushUom(b, 3, "minutes");
      b.emitOpcode(OpCode.RATE_MUL);
    });
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("frames");
    expect(result.toNumber()).toBeCloseTo(5400);
  });

  test("errors cleanly on a measure mismatch (rate/day × kg)", () => {
    const result = run((b) => {
      pushUom(b, 10, "USD/day");
      pushUom(b, 5, "kg");
      b.emitOpcode(OpCode.RATE_MUL);
    });
    expect(result.type).toBe(ValueType.Error);
  });

  test("errors cleanly when the left-hand side isn't actually a rate", () => {
    const result = run((b) => {
      pushUom(b, 10, "USD");
      pushUom(b, 5, "day");
      b.emitOpcode(OpCode.RATE_MUL);
    });
    expect(result.type).toBe(ValueType.Error);
  });
});

describe("RATE_CONVERT — rescale a rate's denominator", () => {
  test("30/week as /month scales up (fewer, bigger periods)", () => {
    const result = run((b) => {
      pushUom(b, 30, "/week");
      pushString(b, "month");
      b.emitOpcode(OpCode.RATE_CONVERT);
    });
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("/month");
    // Not asserting an exact SoulverCore-matching constant (this repo's
    // `convert` package uses its own day-count-based month length) — just
    // that a month's worth is meaningfully larger than a week's.
    expect(result.toNumber()).toBeGreaterThan(30);
  });

  test("round-trips: convert to /month and back to /week returns (approximately) the original", () => {
    const toMonth = run((b) => {
      pushUom(b, 30, "/week");
      pushString(b, "month");
      b.emitOpcode(OpCode.RATE_CONVERT);
    });
    const backToWeek = run((b) => {
      pushUom(b, toMonth.toNumber(), toMonth.unit!);
      pushString(b, "week");
      b.emitOpcode(OpCode.RATE_CONVERT);
    });
    expect(backToWeek.toNumber()).toBeCloseTo(30, 5);
  });

  test("errors cleanly on a measure mismatch (rate/day -> /kg)", () => {
    const result = run((b) => {
      pushUom(b, 10, "USD/day");
      pushString(b, "kg");
      b.emitOpcode(OpCode.RATE_CONVERT);
    });
    expect(result.type).toBe(ValueType.Error);
  });

  test("errors cleanly when the value isn't a rate at all", () => {
    const result = run((b) => {
      pushUom(b, 10, "USD");
      pushString(b, "week");
      b.emitOpcode(OpCode.RATE_CONVERT);
    });
    expect(result.type).toBe(ValueType.Error);
  });
});

describe("Composing RATE_CONVERT + ADD — mixed-denominator rate addition", () => {
  test("$20/day + $300/week -> a single /day rate (normalize denominators first, then plain ADD)", () => {
    // Mirrors how a real parselet would need to handle "$20/day +
    // $300/week": generic ADD only combines Uom operands with an
    // EXACTLY-matching unit string (or a getMeasure()-recognized plain
    // unit) — a compound rate unit like "USD/week" isn't independently
    // recognized by getMeasure(), so the two rates must be normalized to
    // the SAME denominator via RATE_CONVERT first; after that, their unit
    // strings match exactly and plain ADD combines them correctly.
    const result = run((b) => {
      pushUom(b, 20, "USD/day");
      // Convert $300/week -> $X/day
      pushUom(b, 300, "USD/week");
      pushString(b, "day");
      b.emitOpcode(OpCode.RATE_CONVERT);
      b.emitOpcode(OpCode.ADD);
    });
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("USD/day");
    // 300/week converted to /day is 300/7 ≈ 42.86; total ≈ 62.86/day.
    expect(result.toNumber()).toBeCloseTo(20 + 300 / 7, 2);
  });
});

describe("Plain MUL/DIV auto-detect rate operands (no explicit RATE_MUL/RATE_DIV needed)", () => {
  test("rate × matching Uom via plain MUL: $50/week × 12 weeks -> $600", () => {
    const result = run((b) => {
      pushUom(b, 50, "USD/week");
      pushUom(b, 12, "weeks");
      b.emitOpcode(OpCode.MUL);
    });
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("USD");
    expect(result.toNumber()).toBeCloseTo(600);
  });

  test("commutative: matching Uom × rate also works: 3 minutes × 30 fps -> 5,400 frames", () => {
    const result = run((b) => {
      pushUom(b, 3, "minutes");
      pushUom(b, 30, "frames/s");
      b.emitOpcode(OpCode.MUL);
    });
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("frames");
    expect(result.toNumber()).toBeCloseTo(5400);
  });

  test("Uom × Uom with neither side a rate is unaffected (plain unit scaling, not rate logic)", () => {
    const result = run((b) => {
      pushUom(b, 5, "USD");
      pushUom(b, 3, "USD");
      b.emitOpcode(OpCode.MUL);
    });
    // Not a rate case — falls through to the pre-existing generic binaryOp
    // path exactly as before this change (behavior unchanged, not a
    // regression target of this test beyond "still doesn't crash/misfire").
    expect(result.type).not.toBe(ValueType.Error);
  });

  test("different-measure Uom ÷ Uom via plain DIV constructs a Rate: 90 km / 3 day -> 30 km/day", () => {
    const result = run((b) => {
      pushUom(b, 90, "km");
      pushUom(b, 3, "day");
      b.emitOpcode(OpCode.DIV);
    });
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("km/day");
    expect(result.toNumber()).toBeCloseTo(30);
  });

  test("same-measure Uom ÷ Uom via plain DIV still divides to a plain number (unaffected)", () => {
    const result = run((b) => {
      pushUom(b, 10, "km");
      pushUom(b, 2, "km");
      b.emitOpcode(OpCode.DIV);
    });
    expect(result.type).toBe(ValueType.Number);
    expect(result.toNumber()).toBe(5);
  });

  test("two currencies with no live rate still error honestly via DIV, not silently become a rate", () => {
    const result = run((b) => {
      pushUom(b, 1, "BTC");
      pushUom(b, 1, "ETH");
      b.emitOpcode(OpCode.DIV);
    });
    expect(result.type).toBe(ValueType.Error);
  });
});
