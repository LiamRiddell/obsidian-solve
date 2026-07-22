/**
 * Commit commands — state-driven result committing (plan Task 6).
 *
 * commitResults() reads the evaluator's DocumentModel and emits the same
 * WriteResultToActiveDocumentLine events a result-widget click produces —
 * no DOM queries, works headless.
 */

import { describe, expect, test, beforeEach, afterEach } from "@jest/globals";
import { MarkdownEditorViewPlugin } from "@app/codemirror/MarkdownEditorViewPlugin";
import { pluginEventBus } from "@app/eventbus/PluginEventBus";
import { EPluginEvent } from "@app/constants/EPluginEvent";

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

type CommitEvent = {
	lineNumber: number;
	expression: string;
	result: string;
	isInlineSolve?: boolean;
};

describe("MarkdownEditorViewPlugin.commitResults", () => {
	let captured: CommitEvent[];
	let plugin: MarkdownEditorViewPlugin | null = null;
	const listener = (
		lineNumber: number,
		expression: string,
		result: string,
		isInlineSolve?: boolean
	) => {
		captured.push({ lineNumber, expression, result, isInlineSolve });
	};

	beforeEach(() => {
		captured = [];
		pluginEventBus.on(EPluginEvent.WriteResultToActiveDocumentLine, listener);
	});

	afterEach(() => {
		pluginEventBus.removeListener(EPluginEvent.WriteResultToActiveDocumentLine, listener);
		plugin?.destroy();
		plugin = null;
	});

	test("commits an evaluated full-line expression", () => {
		plugin = new MarkdownEditorViewPlugin(createMockView(["1 + 2"]));

		const committed = plugin.commitResults(1, 1);

		expect(committed).toBe(1);
		expect(captured).toHaveLength(1);
		expect(captured[0].lineNumber).toBe(1);
		expect(captured[0].expression).toBe("1 + 2");
		expect(captured[0].result.length).toBeGreaterThan(0);
		expect(captured[0].result).toContain("3");
		expect(captured[0].isInlineSolve).toBe(false);
	});

	test("returns 0 for lines without results (empty / markdown-only)", () => {
		plugin = new MarkdownEditorViewPlugin(createMockView(["", "just prose"]));

		expect(plugin.commitResults(1, 2)).toBe(0);
		expect(captured).toHaveLength(0);
	});

	test("commits a range, one event per evaluated line", () => {
		plugin = new MarkdownEditorViewPlugin(
			createMockView(["1 + 2", "", "2 * 5"])
		);

		const committed = plugin.commitResults(1, 3);

		expect(committed).toBe(2);
		expect(captured.map((e) => e.lineNumber)).toEqual([1, 3]);
	});

	test("commitVisibleResults covers the whole mock viewport", () => {
		plugin = new MarkdownEditorViewPlugin(
			createMockView(["1 + 2", "2 + 3"])
		);

		expect(plugin.commitVisibleResults()).toBe(2);
	});
});
