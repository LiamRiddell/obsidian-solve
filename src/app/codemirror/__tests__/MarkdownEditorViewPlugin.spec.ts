import { describe, expect, test, afterEach, jest } from "@jest/globals";
import { MarkdownEditorViewPlugin } from "@app/codemirror/MarkdownEditorViewPlugin";
import { EngineProvider } from "@app/engine/EngineProvider";

function createMockView(lines: string[]): any {
	const text = lines.join("\n");
	return {
		state: {
			doc: {
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
			},
		},
		visibleRanges: [{ from: 0, to: text.length }],
	};
}

describe("MarkdownEditorViewPlugin with ThreeTierEvaluator", () => {
	// Each test creates a MarkdownEditorViewPlugin which locks the engine's
	// event stream via getReader(). Reset the engine between tests so each
	// gets a fresh unlocked stream.
	afterEach(() => {
		EngineProvider.reset();
	});

	test("creates plugin and builds initial decorations", () => {
		const view = createMockView(["1 + 2"]);
		const plugin = new MarkdownEditorViewPlugin(view as any);
		expect(plugin.decorations).toBeDefined();
	});

	test("handles viewport-only changes (scroll) without errors", () => {
		const view = createMockView(["1 + 2", "3 + 4"]);
		const plugin = new MarkdownEditorViewPlugin(view as any);

		// Simulate viewport change with no doc changes (scroll)
		const update = {
			docChanged: false,
			viewportChanged: true,
			view,
			startState: { doc: view.state.doc },
			changes: { iterChanges: () => {} },
		};
		plugin.update(update as any);
		expect(plugin.decorations).toBeDefined();
	});

	test("handles doc changes with re-evaluation", () => {
		const view = createMockView(["1 + 2"]);
		const plugin = new MarkdownEditorViewPlugin(view as any);

		// Simulate a doc change: byte 0→3 deleted ("1 +"), byte 0→0 inserted ("2 +")
		// This effectively changes line 1 from "1 + 2" to "2 + 2"
		const update = {
			docChanged: true,
			viewportChanged: true,
			view,
			startState: { doc: view.state.doc },
			changes: {
				iterChanges: (cb: (fromA: number, toA: number, fromB: number, toB: number, inserted: { toString: () => string }) => void) => {
					cb(0, 3, 0, 0, { toString: () => "2 +" });
				},
			},
		};
		plugin.update(update as any);

		// Plugin should still have valid decorations after re-evaluation
		expect(plugin.decorations).toBeDefined();

		// The rest of the line ("+ 2"/" 2") must survive a mid-line edit —
		// a previous bug in codeMirrorChangesToLineChanges dropped every
		// character outside the exact edited byte range.
		const docModel = (plugin as any).docModel;
		expect(docModel.getLineAt(1).text).toBe("2 + 2");
	});

	test("a single-character mid-line edit preserves the rest of the line and re-evaluates it correctly", () => {
		const view = createMockView(["1 + 2"]);
		const plugin = new MarkdownEditorViewPlugin(view as any);

		// Replace the "1" with "9": "1 + 2" -> "9 + 2"
		const update = {
			docChanged: true,
			viewportChanged: true,
			view,
			startState: { doc: view.state.doc },
			changes: {
				iterChanges: (cb: (fromA: number, toA: number, fromB: number, toB: number, inserted: { toString: () => string }) => void) => {
					cb(0, 1, 0, 1, { toString: () => "9" });
				},
			},
		};
		plugin.update(update as any);

		const docModel = (plugin as any).docModel;
		expect(docModel.getLineAt(1).text).toBe("9 + 2");
		expect(docModel.getLineAt(1).results[0][0].toNumber()).toBe(11);
	});

	test("pressing Enter at the start of an expression's line shifts it to line 2 without losing any of its text", () => {
		const view = createMockView(["10 + 5 * 2"]);
		const plugin = new MarkdownEditorViewPlugin(view as any);

		// Insert a bare newline at position 0 (Enter at the start of the line).
		const update = {
			docChanged: true,
			viewportChanged: true,
			view,
			startState: { doc: view.state.doc },
			changes: {
				iterChanges: (cb: (fromA: number, toA: number, fromB: number, toB: number, inserted: { toString: () => string }) => void) => {
					cb(0, 0, 0, 1, { toString: () => "\n" });
				},
			},
		};
		plugin.update(update as any);

		// Note: the mock view's `state.doc`/`visibleRanges` are fixed at
		// createMockView() time and don't grow with the document the way a
		// real CodeMirror EditorView does, so the post-edit viewport here
		// still only covers the original (now line 1) span — evaluation of
		// the shifted line 2 is already covered end-to-end at the engine
		// level by StructuralEditLineTracking.spec.ts. What this test proves
		// is specifically that the DocumentModel's line TEXT survived the
		// shift intact through the real CM6-diff conversion path.
		const docModel = (plugin as any).docModel;
		expect(docModel.lineCount).toBe(2);
		expect(docModel.getLineAt(1).text).toBe("");
		expect(docModel.getLineAt(2).text).toBe("10 + 5 * 2");
	});

	test("re-evaluates correctly across viewport changes with no doc changes", () => {
		const view = createMockView(["1 + 2", "3 + 4", "5 + 6"]);
		const plugin = new MarkdownEditorViewPlugin(view as any);

		// Simulate viewport change with no doc changes
		const update = {
			docChanged: false,
			viewportChanged: true,
			view,
			startState: { doc: view.state.doc },
			changes: { iterChanges: () => {} },
		};
		plugin.update(update as any);

		// Decorations should remain valid
		expect(plugin.decorations).toBeDefined();
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// abortKeystroke lifecycle tests
// ═══════════════════════════════════════════════════════════════════════════

describe("MarkdownEditorViewPlugin — abortKeystroke Lifecycle", () => {
	// Each test creates a MarkdownEditorViewPlugin which locks the engine's
	// event stream via getReader(). Reset the engine between tests so each
	// gets a fresh unlocked stream.
	afterEach(() => {
		EngineProvider.reset();
	});

	test("constructor creates a non-aborted keystroke controller", () => {
		const view = createMockView(["1 + 2"]);
		const plugin = new MarkdownEditorViewPlugin(view as any);

		const kc = (plugin as any).keystrokeController as AbortController;
		expect(kc).toBeDefined();
		expect(kc.signal.aborted).toBe(false);
	});

	test("docChanged update aborts old keystroke controller and creates fresh one", () => {
		const view = createMockView(["1 + 2"]);
		const plugin = new MarkdownEditorViewPlugin(view as any);

		// Capture the original controller
		const originalKc = (plugin as any).keystrokeController as AbortController;
		expect(originalKc.signal.aborted).toBe(false);

		// Simulate a doc change
		const update = {
			docChanged: true,
			viewportChanged: true,
			view,
			startState: { doc: view.state.doc },
			changes: {
				iterChanges: (cb: (fromA: number, toA: number, fromB: number, toB: number, inserted: { toString: () => string }) => void) => {
					cb(0, 1, 0, 0, { toString: () => "2" });
				},
			},
		};
		plugin.update(update as any);

		// Old controller should be aborted
		expect(originalKc.signal.aborted).toBe(true);

		// New controller should exist and be non-aborted
		const newKc = (plugin as any).keystrokeController as AbortController;
		expect(newKc).toBeDefined();
		expect(newKc.signal.aborted).toBe(false);
		expect(newKc).not.toBe(originalKc);
	});

	test("document switch aborts old keystroke controller and creates fresh one", () => {
		const view = createMockView(["1 + 2"]);
		const plugin = new MarkdownEditorViewPlugin(view as any);

		// Capture the original controller
		const originalKc = (plugin as any).keystrokeController as AbortController;
		expect(originalKc.signal.aborted).toBe(false);

		// Simulate a document switch (new doc object)
		const newView = createMockView(["5 + 5"]);
		const update = {
			docChanged: false,
			viewportChanged: false,
			view: newView,
			startState: { doc: view.state.doc },
			state: { doc: newView.state.doc },
			changes: { iterChanges: () => {} },
		};
		plugin.update(update as any);

		// Old controller should be aborted
		expect(originalKc.signal.aborted).toBe(true);

		// New controller should exist and be non-aborted
		const newKc = (plugin as any).keystrokeController as AbortController;
		expect(newKc).toBeDefined();
		expect(newKc.signal.aborted).toBe(false);
		expect(newKc).not.toBe(originalKc);
	});

	test("destroy aborts keystroke controller and sets it to null", () => {
		const view = createMockView(["1 + 2"]);
		const plugin = new MarkdownEditorViewPlugin(view as any);

		const originalKc = (plugin as any).keystrokeController as AbortController;
		expect(originalKc.signal.aborted).toBe(false);

		plugin.destroy();

		// Controller should be aborted
		expect(originalKc.signal.aborted).toBe(true);

		// keystrokeController should be nulled after abort
		expect((plugin as any).keystrokeController).toBeNull();
	});

	test("multiple docChanged updates: each aborts only its predecessor", () => {
		const view = createMockView(["1 + 1"]);
		const plugin = new MarkdownEditorViewPlugin(view as any);

		// Track all controllers
		const controllers: AbortController[] = [];
		controllers.push((plugin as any).keystrokeController as AbortController);

		for (let i = 0; i < 3; i++) {
			const update = {
				docChanged: true,
				viewportChanged: true,
				view,
				startState: { doc: view.state.doc },
				changes: {
					iterChanges: (cb: (fromA: number, toA: number, fromB: number, toB: number, inserted: { toString: () => string }) => void) => {
						cb(0, 1, 0, 0, { toString: () => String(i + 2) });
					},
				},
			};
			plugin.update(update as any);

			const newKc = (plugin as any).keystrokeController as AbortController;
			controllers.push(newKc);
		}

		// Each controller except the last should be aborted
		for (let i = 0; i < controllers.length - 1; i++) {
			expect(controllers[i].signal.aborted).toBe(true);
		}
		// Last controller should NOT be aborted (current keystroke)
		expect(controllers[controllers.length - 1].signal.aborted).toBe(false);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Autocomplete: completionSource + independent highlighting/completions toggles
// ═══════════════════════════════════════════════════════════════════════════

function createMockCompletionContext(view: any, pos: number, matchText: string, explicit = false): any {
	return {
		pos,
		explicit,
		state: view.state,
		matchBefore: () => (matchText ? { from: pos - matchText.length, to: pos } : null),
	};
}

describe("MarkdownEditorViewPlugin — completionSource", () => {
	afterEach(() => {
		EngineProvider.reset();
	});

	test("returns completions for a matched prefix when enabled", () => {
		// A second (empty) line avoids the mock lineAt() helper's boundary
		// quirk on the LAST line of a document (see below).
		const view = createMockView(["sq", ""]);
		const plugin = new MarkdownEditorViewPlugin(view as any);
		(plugin as any).userSettings.completions.enabled = true;

		const context = createMockCompletionContext(view, 2, "sq");
		const result = plugin.completionSource(context);

		expect(result).not.toBeNull();
		expect(result!.from).toBe(0);
		expect(result!.options.some((o: any) => o.label === "sqrt")).toBe(true);
	});

	test("returns null when there's no word match and the trigger wasn't explicit", () => {
		const view = createMockView(["1 + 2"]);
		const plugin = new MarkdownEditorViewPlugin(view as any);
		(plugin as any).userSettings.completions.enabled = true;

		const context = createMockCompletionContext(view, 5, "");
		expect(plugin.completionSource(context)).toBeNull();
	});

	test("returns null and never calls the language service when completions are disabled — zero cost when off", () => {
		const view = createMockView(["sq"]);
		const plugin = new MarkdownEditorViewPlugin(view as any);
		(plugin as any).userSettings.completions.enabled = false;

		const spy = jest.spyOn((plugin as any).languageService, "getCompletions");
		const context = createMockCompletionContext(view, 2, "sq");
		expect(plugin.completionSource(context)).toBeNull();
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
	});
});

describe("MarkdownEditorViewPlugin — highlighting and completions toggle independently", () => {
	afterEach(() => {
		EngineProvider.reset();
	});

	test("completions work normally while highlighting is disabled (no highlight-token calls)", () => {
		const view = createMockView(["sq", ""]);
		const plugin = new MarkdownEditorViewPlugin(view as any);
		(plugin as any).userSettings.syntaxHighlight.enabled = false;
		(plugin as any).userSettings.completions.enabled = true;

		const tokenSpy = jest.spyOn((plugin as any).languageService, "getSemanticTokens");
		plugin.buildDecorations(view as any);
		expect(tokenSpy).not.toHaveBeenCalled();
		tokenSpy.mockRestore();

		const context = createMockCompletionContext(view, 2, "sq");
		const result = plugin.completionSource(context);
		expect(result).not.toBeNull();
		expect(result!.options.some((o: any) => o.label === "sqrt")).toBe(true);
	});

	test("highlighting works normally while completions are disabled (no getCompletions calls)", () => {
		const view = createMockView(["1 + 2"]);
		const plugin = new MarkdownEditorViewPlugin(view as any);
		(plugin as any).userSettings.syntaxHighlight.enabled = true;
		(plugin as any).userSettings.completions.enabled = false;

		const completionSpy = jest.spyOn((plugin as any).languageService, "getCompletions");
		const context = createMockCompletionContext(view, 5, "");
		expect(plugin.completionSource(context)).toBeNull();
		expect(completionSpy).not.toHaveBeenCalled();
		completionSpy.mockRestore();

		expect(() => plugin.buildDecorations(view as any)).not.toThrow();
	});

	test("a doc change never touches the highlight cache when highlighting is disabled — zero cost, not just hidden output", () => {
		const view = createMockView(["1 + 2"]);
		const plugin = new MarkdownEditorViewPlugin(view as any);
		(plugin as any).userSettings.syntaxHighlight.enabled = false;

		const invalidateSpy = jest.spyOn((plugin as any).languageService, "invalidateLines");
		const update = {
			docChanged: true,
			viewportChanged: true,
			view,
			startState: { doc: view.state.doc },
			changes: {
				iterChanges: (cb: (fromA: number, toA: number, fromB: number, toB: number, inserted: { toString: () => string }) => void) => {
					cb(0, 1, 0, 1, { toString: () => "9" });
				},
			},
		};
		plugin.update(update as any);

		expect(invalidateSpy).not.toHaveBeenCalled();
		invalidateSpy.mockRestore();
	});

	test("a doc change DOES invalidate the touched line's highlight cache when highlighting is enabled", () => {
		const view = createMockView(["1 + 2"]);
		const plugin = new MarkdownEditorViewPlugin(view as any);
		(plugin as any).userSettings.syntaxHighlight.enabled = true;

		const invalidateSpy = jest.spyOn((plugin as any).languageService, "invalidateLines");
		const update = {
			docChanged: true,
			viewportChanged: true,
			view,
			startState: { doc: view.state.doc },
			changes: {
				iterChanges: (cb: (fromA: number, toA: number, fromB: number, toB: number, inserted: { toString: () => string }) => void) => {
					cb(0, 1, 0, 1, { toString: () => "9" });
				},
			},
		};
		plugin.update(update as any);

		expect(invalidateSpy).toHaveBeenCalledTimes(1);
		expect(invalidateSpy.mock.calls[0][0]).toEqual(new Set([1]));
		invalidateSpy.mockRestore();
	});
});
