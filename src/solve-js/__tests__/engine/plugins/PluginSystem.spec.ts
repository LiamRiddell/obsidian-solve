import { describe, expect, test, jest } from "@jest/globals";
import { PluginManager, ProviderPackage } from "@solve-js/plugins/PluginSystem";
import { PluginRegistry } from "@solve-js/plugins/PluginSystem";
import type { SolvePlugin } from "@solve-js/plugins/PluginSystem";

describe("PluginManager", () => {
  test("register adds a plugin", () => {
    const registry = new (require("@solve-js/parser/registry/ParseletRegistry").ParseletRegistry)();
    const manager = new PluginManager(registry);

    const plugin: SolvePlugin = {
      name: "test-plugin",
      version: "1.0.0",
      register: jest.fn(),
    };

    manager.register(plugin);
    expect(manager.hasPlugin("test-plugin")).toBe(true);
    expect(plugin.register).toHaveBeenCalledWith(registry);
  });

  test("register throws when plugin name already registered", () => {
    const registry = new (require("@solve-js/parser/registry/ParseletRegistry").ParseletRegistry)();
    const manager = new PluginManager(registry);

    const plugin: SolvePlugin = {
      name: "test-plugin",
      version: "1.0.0",
      register: jest.fn(),
    };

    manager.register(plugin);
    expect(() => manager.register(plugin)).toThrow(/already registered/i);
  });

  test("register propagates plugin registration errors", () => {
    const registry = new (require("@solve-js/parser/registry/ParseletRegistry").ParseletRegistry)();
    const manager = new PluginManager(registry);

    const plugin: SolvePlugin = {
      name: "failing-plugin",
      version: "1.0.0",
      register: () => { throw new Error("fail"); },
    };

    expect(() => manager.register(plugin)).toThrow(/failed to register/i);
  });

  test("unregister removes a plugin and calls unregister callback", () => {
    const registry = new (require("@solve-js/parser/registry/ParseletRegistry").ParseletRegistry)();
    const manager = new PluginManager(registry);

    const unregister = jest.fn();
    const plugin: SolvePlugin = {
      name: "test-plugin",
      version: "1.0.0",
      register: jest.fn(),
      unregister,
    };

    manager.register(plugin);
    manager.unregister("test-plugin");

    expect(unregister).toHaveBeenCalledWith(registry);
    expect(manager.hasPlugin("test-plugin")).toBe(false);
  });

  test("unregister throws when plugin not found", () => {
    const registry = new (require("@solve-js/parser/registry/ParseletRegistry").ParseletRegistry)();
    const manager = new PluginManager(registry);

    expect(() => manager.unregister("nonexistent")).toThrow(/not registered/i);
  });

  test("getPlugin returns the plugin by name", () => {
    const registry = new (require("@solve-js/parser/registry/ParseletRegistry").ParseletRegistry)();
    const manager = new PluginManager(registry);

    const plugin: SolvePlugin = {
      name: "test-plugin",
      version: "1.0.0",
      register: jest.fn(),
    };

    manager.register(plugin);
    expect(manager.getPlugin("test-plugin")).toBe(plugin);
  });

  test("getPlugin returns undefined for missing plugin", () => {
    const registry = new (require("@solve-js/parser/registry/ParseletRegistry").ParseletRegistry)();
    const manager = new PluginManager(registry);

    expect(manager.getPlugin("nonexistent")).toBeUndefined();
  });

  test("hasPlugin returns false for unregistered name", () => {
    const registry = new (require("@solve-js/parser/registry/ParseletRegistry").ParseletRegistry)();
    const manager = new PluginManager(registry);

    expect(manager.hasPlugin("nonexistent")).toBe(false);
  });

  test("getPlugins returns all registered plugins", () => {
    const registry = new (require("@solve-js/parser/registry/ParseletRegistry").ParseletRegistry)();
    const manager = new PluginManager(registry);

    const p1: SolvePlugin = { name: "a", version: "1.0.0", register: jest.fn() };
    const p2: SolvePlugin = { name: "b", version: "1.0.0", register: jest.fn() };
    manager.register(p1);
    manager.register(p2);

    const all = manager.getPlugins();
    expect(all).toHaveLength(2);
    expect(all).toContain(p1);
    expect(all).toContain(p2);
  });

  test("registerPackage registers all plugins in a package", () => {
    const registry = new (require("@solve-js/parser/registry/ParseletRegistry").ParseletRegistry)();
    const manager = new PluginManager(registry);

    const p1: SolvePlugin = { name: "pkg:a", version: "1.0.0", register: jest.fn() };
    const p2: SolvePlugin = { name: "pkg:b", version: "1.0.0", register: jest.fn() };

    manager.registerPackage({ name: "test-pkg", version: "1.0.0", plugins: [p1, p2] });
    expect(manager.hasPlugin("pkg:a")).toBe(true);
    expect(manager.hasPlugin("pkg:b")).toBe(true);
  });

  test("clear unregisters all plugins", () => {
    const registry = new (require("@solve-js/parser/registry/ParseletRegistry").ParseletRegistry)();
    const manager = new PluginManager(registry);
    const unregister = jest.fn();

    const p1: SolvePlugin = { name: "a", version: "1.0.0", register: jest.fn(), unregister };
    const p2: SolvePlugin = { name: "b", version: "1.0.0", register: jest.fn() }; // no unregister
    manager.register(p1);
    manager.register(p2);

    manager.clear();
    expect(manager.hasPlugin("a")).toBe(false);
    expect(manager.hasPlugin("b")).toBe(false);
    // Only p1 has unregister — should have been called once
    expect(unregister).toHaveBeenCalledTimes(1);
  });
});

describe("ProviderPackage", () => {
  test("register calls the registration function", () => {
    const registry = new (require("@solve-js/parser/registry/ParseletRegistry").ParseletRegistry)();
    const registrationFn = jest.fn();
    const pkg = new ProviderPackage("test-pkg", "1.0.0", "A test package", registrationFn);

    pkg.register(registry);
    expect(registrationFn).toHaveBeenCalledWith(registry);
  });

  test("register does nothing when no registration function provided", () => {
    const registry = new (require("@solve-js/parser/registry/ParseletRegistry").ParseletRegistry)();
    const pkg = new ProviderPackage("noop-pkg", "1.0.0");

    expect(() => pkg.register(registry)).not.toThrow();
  });

  test("unregister is optional and does nothing", () => {
    const registry = new (require("@solve-js/parser/registry/ParseletRegistry").ParseletRegistry)();
    const pkg = new ProviderPackage("test-pkg", "1.0.0");
    expect(() => pkg.unregister?.(registry)).not.toThrow();
  });
});

describe("PluginRegistry", () => {
  test("registerConfig and getConfig round-trip", () => {
    const pluginRegistry = new PluginRegistry();
    pluginRegistry.registerConfig({ name: "my-plugin", enabled: true });

    const config = pluginRegistry.getConfig("my-plugin");
    expect(config).toBeDefined();
    expect(config!.name).toBe("my-plugin");
    expect(config!.enabled).toBe(true);
  });

  test("getConfig returns undefined for unknown plugin", () => {
    const pluginRegistry = new PluginRegistry();
    expect(pluginRegistry.getConfig("unknown")).toBeUndefined();
  });

  test("isEnabled returns true for plugins without config", () => {
    const pluginRegistry = new PluginRegistry();
    expect(pluginRegistry.isEnabled("unknown")).toBe(true);
  });

  test("isEnabled returns false for disabled plugins", () => {
    const pluginRegistry = new PluginRegistry();
    pluginRegistry.registerConfig({ name: "disabled-plugin", enabled: false });
    expect(pluginRegistry.isEnabled("disabled-plugin")).toBe(false);
  });

  test("setEnabled enables/disables an existing config", () => {
    const pluginRegistry = new PluginRegistry();
    pluginRegistry.registerConfig({ name: "my-plugin", enabled: true });
    pluginRegistry.setEnabled("my-plugin", false);
    expect(pluginRegistry.isEnabled("my-plugin")).toBe(false);
  });

  test("setEnabled creates config if not existing", () => {
    const pluginRegistry = new PluginRegistry();
    pluginRegistry.setEnabled("new-plugin", true);
    expect(pluginRegistry.isEnabled("new-plugin")).toBe(true);
  });

  test("registerConfig with settings", () => {
    const pluginRegistry = new PluginRegistry();
    pluginRegistry.registerConfig({ name: "config-plugin", enabled: true, settings: { key: "value" } });
    const config = pluginRegistry.getConfig("config-plugin");
    expect(config!.settings).toEqual({ key: "value" });
  });
});
