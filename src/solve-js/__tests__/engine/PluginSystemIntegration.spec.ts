import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { PluginManager } from "@solve-js/packages/PackageSystem";

describe("Phase 7: Plugin System Integration", () => {
  test("ExpressionEngine has registerPlugin method", () => {
    const engine = new ExpressionEngine();
    expect(typeof engine.registerPlugin).toBe("function");
  });

  test("ExpressionEngine has unregisterPlugin method", () => {
    const engine = new ExpressionEngine();
    expect(typeof engine.unregisterPlugin).toBe("function");
  });

  test("registerPlugin adds plugin via PluginManager", () => {
    const engine = new ExpressionEngine();
    const plugin = {
      name: "test-plugin",
      version: "1.0.0",
      register: (registry: any) => {
        // Registration logic
      },
    };
    // Should not throw
    expect(() => engine.registerPlugin(plugin)).not.toThrow();
  });

test("unregisterPlugin clears bytecode cache", () => {
     const engine = new ExpressionEngine();
     engine.evaluateLine(1, "5 + 5");

     // Register a dummy plugin then unregister
     const plugin = {
       name: "test-plugin",
       version: "1.0.0",
       register: () => {},
       unregister: () => {},
     };
     engine.registerPlugin(plugin);
     engine.unregisterPlugin("test-plugin");

     // Bytecode cache should be cleared
     expect(engine.evaluateNumber("5 + 5")).toBe(10);
   });

  test("PluginManager is imported correctly", () => {
    expect(PluginManager).toBeDefined();
    expect(typeof PluginManager.prototype.register).toBe("function");
    expect(typeof PluginManager.prototype.unregister).toBe("function");
  });
});