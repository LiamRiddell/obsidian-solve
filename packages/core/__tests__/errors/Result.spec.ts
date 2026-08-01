import { describe, expect, test } from "@jest/globals";
import {
  ok,
  err,
  isOk,
  isErr,
  map,
  mapErr,
  andThen,
  unwrapOr,
  match,
  combine,
  throwIfErr,
  tryCatch,
  tryCatchAsync,
} from "@solve-js/errors/Result";
import { ErrorFactory, EngineError } from "@solve-js/errors/EngineError";

describe("Result combinators", () => {
  test("ok()/err() construct the right shape", () => {
    expect(ok(5)).toEqual({ ok: true, value: 5 });
    const e = ErrorFactory.internal("X", "boom");
    expect(err(e)).toEqual({ ok: false, error: e });
  });

  test("isOk()/isErr() narrow correctly", () => {
    const r = ok(5);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    const e = err(ErrorFactory.internal("X", "boom"));
    expect(isOk(e)).toBe(false);
    expect(isErr(e)).toBe(true);
  });

  test("map() transforms a success, passes an error through untouched", () => {
    expect(map(ok(5), (n) => n * 2)).toEqual(ok(10));
    const failure = err(ErrorFactory.internal("X", "boom"));
    expect(map(failure, (n: number) => n * 2)).toBe(failure);
  });

  test("mapErr() transforms an error, passes a success through untouched", () => {
    const success = ok(5);
    expect(mapErr(success, () => "mapped")).toBe(success);
    const mapped = mapErr(err(ErrorFactory.internal("X", "boom")), (e) => e.code);
    expect(mapped).toEqual(err("X"));
  });

  test("andThen() chains on success, short-circuits on error", () => {
    const double = (n: number) => ok(n * 2);
    expect(andThen(ok(5), double)).toEqual(ok(10));
    const failure = err(ErrorFactory.internal("X", "boom"));
    expect(andThen(failure, double)).toBe(failure);
  });

  test("unwrapOr() never throws", () => {
    expect(unwrapOr(ok(5), 0)).toBe(5);
    expect(unwrapOr(err(ErrorFactory.internal("X", "boom")), 0)).toBe(0);
  });

  test("match() dispatches to the right arm", () => {
    expect(match(ok(5), { ok: (v) => `value:${v}`, err: () => "error" })).toBe("value:5");
    expect(match(err(ErrorFactory.internal("X", "boom")), { ok: () => "value", err: (e) => `error:${e.code}` })).toBe("error:X");
  });

  test("combine() succeeds with a tuple iff every input succeeds", () => {
    expect(combine([ok(1), ok("a"), ok(true)])).toEqual(ok([1, "a", true]));
  });

  test("combine() fails with the FIRST error, left-to-right", () => {
    const e1 = ErrorFactory.internal("FIRST", "first error");
    const e2 = ErrorFactory.internal("SECOND", "second error");
    expect(combine([ok(1), err(e1), err(e2)])).toEqual(err(e1));
  });

  test("throwIfErr() returns the value on success", () => {
    expect(throwIfErr(ok(5))).toBe(5);
  });

  test("throwIfErr() throws the error as-is on failure", () => {
    const e = ErrorFactory.internal("X", "boom");
    expect(() => throwIfErr(err(e))).toThrow(e);
    try {
      throwIfErr(err(e));
      fail("expected throwIfErr to throw");
    } catch (thrown) {
      expect(thrown).toBe(e); // same instance, not re-wrapped
    }
  });

  test("tryCatch() wraps a successful call", () => {
    expect(tryCatch(() => 5)).toEqual(ok(5));
  });

  test("tryCatch() normalizes a thrown EngineError as-is", () => {
    const e = ErrorFactory.internal("X", "boom");
    const r = tryCatch(() => { throw e; });
    expect(isErr(r) && r.error).toBe(e);
  });

  test("tryCatch() normalizes a raw thrown Error via normalizeUnknownError", () => {
    const r = tryCatch(() => { throw new TypeError("native oops"); });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error).toBeInstanceOf(EngineError);
      expect(r.error.message).toBe("native oops");
      expect(r.error.recoverable).toBe(false); // internal() defaults recoverable:false
      expect(r.error.cause).toBeInstanceOf(TypeError);
    }
  });

  test("tryCatch() normalizes a thrown non-Error value", () => {
    const r = tryCatch(() => { throw "just a string"; });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error).toBeInstanceOf(EngineError);
      expect(r.error.code).toBe("UNKNOWN_ERROR");
    }
  });

  test("tryCatchAsync() wraps a resolved promise", async () => {
    expect(await tryCatchAsync(async () => 5)).toEqual(ok(5));
  });

  test("tryCatchAsync() normalizes a rejected promise", async () => {
    const r = await tryCatchAsync(async () => { throw new Error("async oops"); });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.message).toBe("async oops");
  });
});
