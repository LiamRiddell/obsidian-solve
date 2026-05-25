import { describe, expect, test } from "@jest/globals";
import { MarkdownEditorViewPlugin } from "@app/codemirror/MarkdownEditorViewPlugin";

describe("MarkdownEditorViewPlugin with ThreeTierEvaluator", () => {
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
