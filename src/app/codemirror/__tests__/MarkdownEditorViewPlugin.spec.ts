import { describe, expect, test, afterEach, jest } from "@jest/globals";
import { MarkdownEditorViewPlugin } from "@app/codemirror/MarkdownEditorViewPlugin";
import { EngineProvider } from "@app/engine/EngineProvider";
import UserSettings from "@app/settings/UserSettings";
import { ValueType } from "solve-engine/vm";

/** Counts widget decorations (result badges) anywhere in a plugin's current decoration set. */
function countResultWidgets(plugin: MarkdownEditorViewPlugin): number {
	let count = 0;
	(plugin.decorations as any).between(0, 1e9, (_from: number, _to: number, deco: any) => {
		if (deco?.spec?.widget) count++;
	});
	return count;
}

/** Returns the formatted result text of the first widget decoration found, or undefined if none. */
function firstResultWidgetText(plugin: MarkdownEditorViewPlugin): string | undefined {
	let text: string | undefined;
	(plugin.decorations as any).between(0, 1e9, (_from: number, _to: number, deco: any) => {
		if (text === undefined && deco?.spec?.widget) text = deco.spec.widget.result;
	});
	return text;
}

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

	test("a successful expression renders a result widget", () => {
		const view = createMockView(["1 + 2"]);
		const plugin = new MarkdownEditorViewPlugin(view as any);

		const docModel = (plugin as any).docModel;
		expect(docModel.getLineAt(1).results[0][0].type).not.toBe(ValueType.Error);
		expect(countResultWidgets(plugin)).toBe(1);
	});

	test("an expression that evaluates to a graceful Error value renders no result widget", () => {
		// An undefined-variable reference is a "recoverable" error the engine
		// returns as an Error-type Value (not a thrown exception) — most
		// lines in a note are prose, not calculations, so a visible error
		// badge under every non-expression or half-typed line would be far
		// noisier than useful. Only a successful (or pending) result gets a
		// widget; see MarkdownEditorViewPlugin.ts's full-line result branch.
		const view = createMockView(["thisVariableIsNeverDefined + 1"]);
		const plugin = new MarkdownEditorViewPlugin(view as any);

		const docModel = (plugin as any).docModel;
		expect(docModel.getLineAt(1).results[0][0].type).toBe(ValueType.Error);
		expect(countResultWidgets(plugin)).toBe(0);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Explicit mode — only lines ending in "=" show a result
// ═══════════════════════════════════════════════════════════════════════════

describe("MarkdownEditorViewPlugin — explicit mode", () => {
	afterEach(() => {
		EngineProvider.reset();
		// UserSettings is a singleton backed by the shared DEFAULT_SETTINGS
		// object — restore it so this doesn't leak into other tests in this
		// file/run.
		UserSettings.getInstance().engine.explicitMode = false;
	});

	test("a line ending in '=' shows the result of the expression before it", () => {
		UserSettings.getInstance().engine.explicitMode = true;
		const view = createMockView(["5 + 5 ="]);
		const plugin = new MarkdownEditorViewPlugin(view as any);

		expect(countResultWidgets(plugin)).toBe(1);
	});

	test("a line NOT ending in '=' shows nothing, even though it evaluates fine", () => {
		UserSettings.getInstance().engine.explicitMode = true;
		const view = createMockView(["5 + 5"]);
		const plugin = new MarkdownEditorViewPlugin(view as any);

		// Sanity check: this expression genuinely does evaluate — explicit
		// mode is suppressing it, not a coincidental parse failure.
		const docModel = (plugin as any).docModel;
		expect(docModel.getLineAt(1).results[0][0].type).not.toBe(ValueType.Error);
		expect(countResultWidgets(plugin)).toBe(0);
	});

	test("explicit mode off (default): a bare expression shows its result as usual", () => {
		const view = createMockView(["5 + 5"]);
		const plugin = new MarkdownEditorViewPlugin(view as any);

		expect(countResultWidgets(plugin)).toBe(1);
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

// ═══════════════════════════════════════════════════════════════════════════
// Result formatting settings — confirms FormattingSettingsMapper actually
// reaches formatValue(), not just that the settings exist in the UI.
// ═══════════════════════════════════════════════════════════════════════════

describe("MarkdownEditorViewPlugin — result formatting settings are wired", () => {
	afterEach(() => {
		EngineProvider.reset();
		UserSettings.getInstance().hexResult.enablePadding = false;
		UserSettings.getInstance().hexResult.paddingZeros = 8;
		UserSettings.getInstance().floatResult.decimalPlaces = 2;
	});

	test("hexResult.paddingZeros changes the padded width of a hex result (when enablePadding is on)", () => {
		UserSettings.getInstance().hexResult.enablePadding = true;
		UserSettings.getInstance().hexResult.paddingZeros = 4;
		const view = createMockView(["10 as hex"]);
		const plugin = new MarkdownEditorViewPlugin(view as any);

		expect(firstResultWidgetText(plugin)).toBe("= 0x000A");
	});

	test("floatResult.decimalPlaces changes how many decimals a result shows", () => {
		UserSettings.getInstance().floatResult.decimalPlaces = 4;
		const view = createMockView(["1 / 3"]);
		const plugin = new MarkdownEditorViewPlugin(view as any);

		expect(firstResultWidgetText(plugin)).toBe("= 0.3333");
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Result animation settings — confirms interface.animateResults/animationClass/
// animationDuration actually reach the ExpressionResultWidget, not just that
// the settings exist and animate.css is loaded.
// ═══════════════════════════════════════════════════════════════════════════

/** Returns the first widget decoration found (not just its text), or undefined if none. */
function firstResultWidget(plugin: MarkdownEditorViewPlugin): any {
	let widget: any;
	(plugin.decorations as any).between(0, 1e9, (_from: number, _to: number, deco: any) => {
		if (widget === undefined && deco?.spec?.widget) widget = deco.spec.widget;
	});
	return widget;
}

describe("MarkdownEditorViewPlugin — result animation settings are wired", () => {
	afterEach(() => {
		EngineProvider.reset();
		UserSettings.getInstance().interface.animateResults = true;
		UserSettings.getInstance().interface.animationClass = "animate__pulse";
		UserSettings.getInstance().interface.animationDuration = "200ms";
	});

	test("passes the configured animation class and duration to the result widget when animateResults is enabled", () => {
		UserSettings.getInstance().interface.animateResults = true;
		UserSettings.getInstance().interface.animationClass = "animate__flash";
		UserSettings.getInstance().interface.animationDuration = "500ms";
		const view = createMockView(["1 + 1"]);
		const plugin = new MarkdownEditorViewPlugin(view as any);

		const widget = firstResultWidget(plugin);

		expect((widget as any).animation).toEqual({
			enabled: true,
			className: "animate__flash",
			duration: "500ms",
		});
	});

	test("passes enabled: false to the result widget when animateResults is disabled", () => {
		UserSettings.getInstance().interface.animateResults = false;
		const view = createMockView(["1 + 1"]);
		const plugin = new MarkdownEditorViewPlugin(view as any);

		const widget = firstResultWidget(plugin);

		expect((widget as any).animation.enabled).toBe(false);
	});
});
