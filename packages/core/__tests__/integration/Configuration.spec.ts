import { describe, expect, test } from "@jest/globals";
import { ConfigManager } from "@solve-js/constants/Configuration";
import { EngineError, ErrorCategory } from "@solve-js/errors/UnifiedErrorFramework";

describe("ConfigManager", () => {
  test("get throws EngineError with CONFIG category for missing path", () => {
    const mgr = new ConfigManager();
    try {
      mgr.get("nonexistent.property");
      expect(true).toBe(false); // should not reach here
    } catch (e) {
      expect(e).toBeInstanceOf(EngineError);
      const err = e as EngineError;
      expect(err.category).toBe(ErrorCategory.CONFIG);
      expect(err.code).toBe("CONFIG_PATH_NOT_FOUND");
    }
  });

  test("set throws EngineError with CONFIG category for invalid path format", () => {
    const mgr = new ConfigManager();
    try {
      mgr.set("justOnePart", 42);
      expect(true).toBe(false);
    } catch (e) {
      expect(e).toBeInstanceOf(EngineError);
      const err = e as EngineError;
      expect(err.category).toBe(ErrorCategory.CONFIG);
      expect(err.code).toBe("INVALID_CONFIG_PATH");
    }
  });

  test("set throws EngineError with CONFIG category for missing section", () => {
    const mgr = new ConfigManager();
    try {
      mgr.set("noSuchSection.property", 42);
      expect(true).toBe(false);
    } catch (e) {
      expect(e).toBeInstanceOf(EngineError);
      const err = e as EngineError;
      expect(err.category).toBe(ErrorCategory.CONFIG);
      expect(err.code).toBe("CONFIG_SECTION_NOT_FOUND");
    }
  });

  test("get returns value for valid path", () => {
    const mgr = new ConfigManager();
    const maxDepth = mgr.get<number>("validation.maxNestingDepth");
    expect(maxDepth).toBe(50);
  });
});
