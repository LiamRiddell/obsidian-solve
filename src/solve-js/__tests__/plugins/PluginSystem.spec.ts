/**
 * PluginSystem — Unit Tests
 *
 * Tests the plugin management infrastructure:
 * - PluginManager: register/unregister, duplicate detection, error propagation
 * - LexerPlugin auto-registration on sharedLexer
 * - ProviderPackage wrapper
 * - PluginRegistry: config storage, enable/disable, settings
 */

import { describe, expect, test, jest } from "@jest/globals";
import { PluginManager, ProviderPackage } from "@solve-js/plugins/PluginSystem";
import { PluginRegistry } from "@solve-js/plugins/PluginSystem";
import type { SolvePlugin } from "@solve-js/plugins/PluginSystem";
import { sharedLexer } from "@solve-js/lexer/Lexer";

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

  test("register with lexerPlugin registers keywords on sharedLexer", () => {
    const registry = new (require("@solve-js/parser/registry/ParseletRegistry").ParseletRegistry)();
    const manager = new PluginManager(registry);

    const plugin: SolvePlugin = {
      name: "lexer-plugin-test",
      version: "1.0.0",
      lexerPlugin: {
        keywords: { "__test_plugin_ns__": "PLUGIN_TEST" },
      },
      register: jest.fn(),
    };

    manager.register(plugin);
    expect(plugin.register).toHaveBeenCalledWith(registry);

    // Verify the keyword was registered on sharedLexer
    sharedLexer.reset("__test_plugin_ns__");
    const tokens = Array.from(sharedLexer);
    expect(tokens.length).toBeGreaterThanOrEqual(1);
    expect(tokens[0].type).toBe("PLUGIN_TEST");
    expect(tokens[0].value).toBe("__test_plugin_ns__");
  });

  test("register with lexerPlugin registers operators on sharedLexer", () => {
    const registry = new (require("@solve-js/parser/registry/ParseletRegistry").ParseletRegistry)();
    const manager = new PluginManager(registry);

    const plugin: SolvePlugin = {
      name: "lexer-op-plugin-test",
      version: "1.0.0",
      lexerPlugin: {
        operators: { "~>": "PIPE_FWD" },
      },
      register: jest.fn(),
    };

    manager.register(plugin);
    expect(plugin.register).toHaveBeenCalledWith(registry);

    sharedLexer.reset("a~>b");
    const tokens = Array.from(sharedLexer);
    const pipeFwdToken = tokens.find(t => t.type === "PIPE_FWD");
    expect(pipeFwdToken).toBeDefined();
    expect(pipeFwdToken!.value).toBe("~>");
  });

  test("unregister removes lexerPlugin from sharedLexer", () => {
    const registry = new (require("@solve-js/parser/registry/ParseletRegistry").ParseletRegistry)();
    const manager = new PluginManager(registry);

    const plugin: SolvePlugin = {
      name: "lexer-unreg-test",
      version: "1.0.0",
      lexerPlugin: {
        keywords: { "__test_unreg__": "TEST_UNREG" },
      },
      register: jest.fn(),
    };

    manager.register(plugin);

    // Verify keyword is registered
    sharedLexer.reset("__test_unreg__");
    expect(Array.from(sharedLexer)[0].type).toBe("TEST_UNREG");

    manager.unregister("lexer-unreg-test");

    // Verify keyword is removed
    sharedLexer.reset("__test_unreg__");
    expect(Array.from(sharedLexer)[0].type).toBe("IDENT");
  });

  test("clear removes lexerPlugins from sharedLexer", () => {
    const registry = new (require("@solve-js/parser/registry/ParseletRegistry").ParseletRegistry)();
    const manager = new PluginManager(registry);

    const plugin: SolvePlugin = {
      name: "lexer-clear-test",
      version: "1.0.0",
      lexerPlugin: {
        keywords: { "__test_clear__": "TEST_CLEAR" },
      },
      register: jest.fn(),
    };

    manager.register(plugin);

    // Verify keyword is registered
    sharedLexer.reset("__test_clear__");
    expect(Array.from(sharedLexer)[0].type).toBe("TEST_CLEAR");

    manager.clear();

    // Verify keyword is removed
    sharedLexer.reset("__test_clear__");
    const tokens = Array.from(sharedLexer);
    expect(tokens[0].type).toBe("IDENT");
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
