import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { BUILTIN_PACKAGES } from "@solve-js/packages/builtins";
import { BASIC_PACKAGE } from "@solve-js-examples/basic/BasicPackage";

/** BASIC_PACKAGE is example code, not a built-in — register it explicitly alongside the built-ins. */
function createEngineWithBasicExample(): ExpressionEngine {
  return new ExpressionEngine("en", false, undefined, undefined, [...BUILTIN_PACKAGES, BASIC_PACKAGE]);
}

describe("BASIC_PACKAGE — minimal IEnginePackage example", () => {
  test("reverse(\"hello\") reverses the string", () => {
    const engine = createEngineWithBasicExample();
    const [value] = engine.evaluateExpression('reverse("hello")');
    expect(value.value).toBe("olleh");
  });

  test("reverse(\"a\") — single character round-trips", () => {
    const engine = createEngineWithBasicExample();
    const [value] = engine.evaluateExpression('reverse("a")');
    expect(value.value).toBe("a");
  });

  test("built-in packages still work alongside the example package", () => {
    const engine = createEngineWithBasicExample();
    const [value] = engine.evaluateExpression("2 + 2 * 10");
    expect(value.toNumber()).toBe(22);
  });
});
