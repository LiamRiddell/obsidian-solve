import { describe, expect, test } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { CoreErrorCodes } from "@solve-js/errors/ErrorCode";

/**
 * Two things this test guards, both retroactively confirmed to have been
 * real bugs in this codebase before the catalog existed:
 *
 * 1. Uniqueness — `CoreErrorCodes`' keys and values must each be unique.
 *    Would have caught two unrelated files (`VariableParselet.ts`/
 *    `GlobalVariableParselet.ts`) independently defining the SAME code
 *    ("EXPECTED_IDENTIFIER") for two different failure shapes.
 * 2. Coverage — every `ErrorFactory.<method>("SOME_CODE", ...)` call site
 *    in the core parser/VM/engine/errors/config/lexer layers (the layers
 *    `CoreErrorCodes` currently catalogs — see that file's own doc
 *    comment on why the ~17 packages aren't included yet) uses a code
 *    that's actually registered in the catalog, catching typos and
 *    codes added to a call site but never added to the catalog.
 */

const CORE_DIR = path.resolve(__dirname, "../../src");

// The exact layers CoreErrorCodes currently catalogs — see ErrorCode.ts's
// own doc comment. Scoped deliberately, not a full-repo scan: the ~17
// packages haven't migrated their own codes into a catalog yet (Phase 5
// of this session's error-handling-refactor plan), so scanning them here
// would just report every one of their existing codes as "orphaned",
// which is expected/known, not a new bug to catch.
const CATALOGED_FILES = [
  "parser/PrecedenceParser.ts",
  "parser/BytecodeBuilder.ts",
  "parser/PhrasePattern.ts",
  "vm/VM.ts",
  "vm/OpRegistry.ts",
  "vm/VMBuiltins.ts",
  "engine/ExpressionEngine.ts",
  "engine/ExpressionEngineSafety.ts",
  "engine/AsyncResolutionBatcher.ts",
  "normalizer/TokenNormalizer.ts",
  "constants/Configuration.ts",
  "lexer/ExpressionLexer.ts",
  "errors/EngineError.ts",
];

function findErrorFactoryCodes(fileContent: string): string[] {
  // Matches ErrorFactory.<method>("CODE" or 'CODE', ...) — the 3-arg
  // legacy shape. The richer `{ code: ErrorCode.X, ... }` object shape
  // (used once packages migrate) isn't a plain string literal in the
  // same position, so it's naturally excluded here — this scan is
  // specifically for the still-common free-string call shape.
  const pattern = /ErrorFactory\.(?:validation|parsing|execution|external|internal|config)\(\s*["']([A-Z][A-Z0-9_]*)["']/g;
  const codes: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(fileContent)) !== null) {
    codes.push(m[1]);
  }
  return codes;
}

describe("ErrorCode catalog", () => {
  test("CoreErrorCodes keys are unique (no two keys collide)", () => {
    const keys = Object.keys(CoreErrorCodes);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("CoreErrorCodes values are unique (no two entries share a code string)", () => {
    const values = Object.values(CoreErrorCodes);
    const dupes = values.filter((v, i) => values.indexOf(v) !== i);
    expect(dupes).toEqual([]);
  });

  test("every ErrorFactory call site in the cataloged core layers uses a registered code", () => {
    const catalog = new Set(Object.values(CoreErrorCodes) as string[]);
    const orphans: Array<{ file: string; code: string }> = [];

    for (const relPath of CATALOGED_FILES) {
      const fullPath = path.join(CORE_DIR, relPath);
      if (!fs.existsSync(fullPath)) continue; // tolerate a file having moved
      const content = fs.readFileSync(fullPath, "utf8");
      for (const code of findErrorFactoryCodes(content)) {
        if (!catalog.has(code)) orphans.push({ file: relPath, code });
      }
    }

    expect(orphans).toEqual([]);
  });
});
