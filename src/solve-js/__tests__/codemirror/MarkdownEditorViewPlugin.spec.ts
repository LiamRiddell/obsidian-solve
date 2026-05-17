import { describe, expect, test } from "@jest/globals";
import { MarkdownEditorViewPlugin } from "@app/codemirror/MarkdownEditorViewPlugin";

describe("MarkdownEditorViewPlugin dirty-line tracking", () => {
  function createMockView(lines: string[], overrides?: any): any {
    const text = lines.join("\n");
    const doc = {
      toString: () => text,
      lineAt: (pos: number) => {
        let accumulated = 0;
        for (let i = 0; i < lines.length; i++) {
          const lineLen = lines[i].length + (i < lines.length - 1 ? 1 : 0);
          if (pos < accumulated + lineLen) {
            return {
              number: i + 1,
              from: accumulated,
              to: accumulated + lines[i].length,
              text: lines[i],
            };
          }
          accumulated += lineLen;
        }
        return { number: lines.length, from: 0, to: 0, text: "" };
      },
      iterRange: (_from: number, _to: number) => {
        return {
          [Symbol.iterator]: function* () {
            for (let i = 0; i < lines.length; i++) {
              yield lines[i] + (i < lines.length - 1 ? "\n" : "");
            }
          },
        };
      },
    };
    return {
      state: {
        doc,
      },
      visibleRanges: [{ from: 0, to: text.length }],
    };
  }

  test("creates plugin and builds initial decorations", () => {
    const view = createMockView(["1 + 2"]);
    const plugin = new MarkdownEditorViewPlugin(view as any);
    expect(plugin.decorations).toBeDefined();
  });

  test("caches decorations for unchanged lines", () => {
    const view = createMockView(["1 + 2", "3 + 4"]);
    const plugin = new MarkdownEditorViewPlugin(view as any);

    // Build again without doc changes (simulating viewport change only)
    const update = {
      docChanged: false,
      viewportChanged: true,
      view,
      changes: { iterChanges: () => {} },
    };
    plugin.update(update as any);
    expect(plugin.decorations).toBeDefined();
  });

  test("marks lines dirty on doc change", () => {
    const view = createMockView(["1 + 2"]);
    const plugin = new MarkdownEditorViewPlugin(view as any);

    // @ts-expect-error accessing private for test
    expect(plugin.dirtyLines.size).toBe(0);

    // Simulate a doc change
    const update = {
      docChanged: true,
      viewportChanged: true,
      view,
      changes: {
        iterChanges: (cb: (fromA: number, toA: number, fromB: number, toB: number) => void) => {
          cb(0, 3, 0, 3);
        },
      },
    };
    plugin.update(update as any);

    // After update, dirtyLines should have been cleared (lines were processed)
    // @ts-expect-error accessing private for test
    expect(plugin.dirtyLines.size).toBe(0);
  });

  test("reuses cache for non-dirty lines across viewport changes", () => {
    const view = createMockView(["1 + 2", "3 + 4", "5 + 6"]);
    const plugin = new MarkdownEditorViewPlugin(view as any);

    // @ts-expect-error accessing private for test
    const cacheSizeAfterFirstBuild = plugin.lineDecorationCache.size;
    expect(cacheSizeAfterFirstBuild).toBeGreaterThan(0);

    // Simulate viewport change with no doc changes
    const update = {
      docChanged: false,
      viewportChanged: true,
      view,
      changes: { iterChanges: () => {} },
    };
    plugin.update(update as any);

    // Cache should still have entries (no dirty lines to evict)
    // @ts-expect-error accessing private for test
    expect(plugin.lineDecorationCache.size).toBe(cacheSizeAfterFirstBuild);
  });
});
