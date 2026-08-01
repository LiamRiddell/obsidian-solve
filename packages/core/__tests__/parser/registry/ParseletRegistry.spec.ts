/**
 * ParseletRegistry — collision-visibility resiliency tests.
 *
 * registerPrefix()/registerInfix() are plain Map.set() under the hood: a
 * second registration for the same token type silently overwrites the
 * first, with the old parselet becoming permanently unreachable. These
 * tests confirm that overwrite is now surfaced via console.warn, and that
 * the warning does NOT misfire on the normal idempotent case — the same
 * singleton parselet instance being re-registered when a second
 * ExpressionEngine is constructed in the same process (every built-in
 * package's parselets are module-level singletons re-registered into the
 * shared registry on every engine construction).
 */

import { describe, expect, test, jest, beforeEach, afterEach } from "@jest/globals";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import type { PrefixParselet, InfixParselet } from "@solve-js/parser/Parselet";

class FakePrefixParselet implements PrefixParselet {
  constructor(public readonly category: string) {}
  parse(): void {}
}

class FakeInfixParselet implements InfixParselet {
  public readonly bindingPower = 10;
  constructor(public readonly category: string) {}
  parse(): void {}
}

describe("ParseletRegistry — collision visibility", () => {
  let warnSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  test("registerPrefix: first registration for a token type warns nothing", () => {
    const registry = new ParseletRegistry();
    registry.registerPrefix("MY_TOKEN", new FakePrefixParselet("A"));
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("registerPrefix: re-registering the SAME instance (idempotent, e.g. a second engine construction) warns nothing", () => {
    const registry = new ParseletRegistry();
    const parselet = new FakePrefixParselet("Arithmetic");
    registry.registerPrefix("LPAREN", parselet);
    registry.registerPrefix("LPAREN", parselet);
    registry.registerPrefix("LPAREN", parselet);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("registerPrefix: a DIFFERENT parselet overwriting an existing one for the same token warns once", () => {
    const registry = new ParseletRegistry();
    registry.registerPrefix("MY_TOKEN", new FakePrefixParselet("A"));
    registry.registerPrefix("MY_TOKEN", new FakePrefixParselet("B"));
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message] = warnSpy.mock.calls[0] as [string];
    expect(message).toContain("MY_TOKEN");
    expect(message).toContain("A");
    expect(message).toContain("B");
  });

  test("registerPrefix: the later registration wins (documents existing overwrite semantics)", () => {
    const registry = new ParseletRegistry();
    const first = new FakePrefixParselet("A");
    const second = new FakePrefixParselet("B");
    registry.registerPrefix("MY_TOKEN", first);
    registry.registerPrefix("MY_TOKEN", second);
    expect(registry.getPrefix("MY_TOKEN")).toBe(second);
  });

  test("registerInfix: first registration for a token type warns nothing", () => {
    const registry = new ParseletRegistry();
    registry.registerInfix("MY_OP", new FakeInfixParselet("A"));
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("registerInfix: re-registering the SAME instance warns nothing", () => {
    const registry = new ParseletRegistry();
    const parselet = new FakeInfixParselet("Arithmetic");
    registry.registerInfix("PLUS", parselet);
    registry.registerInfix("PLUS", parselet);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("registerInfix: a DIFFERENT parselet overwriting an existing one warns once", () => {
    const registry = new ParseletRegistry();
    registry.registerInfix("MY_OP", new FakeInfixParselet("A"));
    registry.registerInfix("MY_OP", new FakeInfixParselet("B"));
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message] = warnSpy.mock.calls[0] as [string];
    expect(message).toContain("MY_OP");
  });

  test("registerInfix: the later registration wins (documents existing overwrite semantics)", () => {
    const registry = new ParseletRegistry();
    const first = new FakeInfixParselet("A");
    const second = new FakeInfixParselet("B");
    registry.registerInfix("MY_OP", first);
    registry.registerInfix("MY_OP", second);
    expect(registry.getInfix("MY_OP")).toBe(second);
  });

  test("distinct token types never collide", () => {
    const registry = new ParseletRegistry();
    registry.registerPrefix("TOKEN_A", new FakePrefixParselet("A"));
    registry.registerPrefix("TOKEN_B", new FakePrefixParselet("B"));
    expect(warnSpy).not.toHaveBeenCalled();
    expect(registry.prefixCount).toBe(2);
  });
});
