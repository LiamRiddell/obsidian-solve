/**
 * Frontmatter stays out of evaluation (#97): its lines reach the evaluator
 * empty, get no result and no decoration, and every line below keeps its
 * number. The pane tests drive real CodeMirror state, so an edit that opens,
 * closes or moves the block goes through the same change set the editor
 * produces.
 */

import { afterEach, describe, expect, test } from "@jest/globals";
import { EditorState } from "@codemirror/state";
import { MarkdownEditorViewPlugin } from "@app/codemirror/MarkdownEditorViewPlugin";
import { frontmatterLineCount, frontmatterResync, maskFrontmatter, maskLineChanges } from "@app/codemirror/Frontmatter";
import { EngineProvider } from "@app/engine/EngineProvider";

const NOTE = ["---", "title: Groceries", "budget: 150", "discount: 10%", "version: 3", "created: 2026-01-05", "tags: [food, weekly]", "---", "Milk: 2", "Bread: 3", "total above"];

const count = (lines: string[]) => frontmatterLineCount(lines.length, (n) => lines[n - 1]);

describe("frontmatterLineCount", () => {
	test("a block from the first line to the next marker, both markers included", () => {
		expect(count(NOTE)).toBe(8);
		expect(count(["---", "---", "1 + 1"])).toBe(2);
		expect(count(["---  ", "a: 1", "---\t", "x"])).toBe(3);
	});

	test("no block: no opening marker, an opening with no close, or a marker not on the first line", () => {
		expect(count(["1 + 1", "---", "a: 1", "---"])).toBe(0);
		expect(count(["---", "a: 1", "b: 2"])).toBe(0);
		expect(count(["", "---", "a: 1", "---"])).toBe(0);
		expect(count(["---"])).toBe(0);
		expect(count([])).toBe(0);
		expect(count(["----", "a: 1", "---"])).toBe(0);
		expect(count([" ---", "a: 1", "---"])).toBe(0);
	});
});

describe("maskFrontmatter", () => {
	test("empties the block and keeps the line count", () => {
		const masked = maskFrontmatter(NOTE.join("\n")).split("\n");
		expect(masked).toHaveLength(NOTE.length);
		expect(masked.slice(0, 8)).toEqual(["", "", "", "", "", "", "", ""]);
		expect(masked.slice(8)).toEqual(["Milk: 2", "Bread: 3", "total above"]);
	});

	test("a note with no frontmatter is unchanged", () => {
		for (const text of ["", "1 + 1", "a\n---\nb\n---", "---\nno close"]) expect(maskFrontmatter(text)).toBe(text);
	});
});

describe("maskLineChanges and frontmatterResync", () => {
	test("an inserted line that lands in the block is emptied, one below it is not", () => {
		const masked = maskLineChanges([{ startLine: 2, deleteCount: 1, insertLines: ["title: Food", "budget: 9"] }], 9);
		expect(masked).toEqual([{ startLine: 2, deleteCount: 1, insertLines: ["", ""] }]);
		const below = maskLineChanges([{ startLine: 10, deleteCount: 1, insertLines: ["Milk: 5"] }], 8);
		expect(below[0].insertLines).toEqual(["Milk: 5"]);
	});

	test("a later change's new line number counts the lines the changes before it added", () => {
		// Two lines inserted at line 2 push the change at old line 9 down to new line 11.
		const changes = [
			{ startLine: 2, deleteCount: 0, insertLines: ["a: 1", "b: 2"] },
			{ startLine: 9, deleteCount: 1, insertLines: ["c: 3"] },
		];
		expect(maskLineChanges(changes, 10).map((c) => c.insertLines)).toEqual([["", ""], ["c: 3"]]);
		expect(maskLineChanges(changes, 11).map((c) => c.insertLines)).toEqual([["", ""], [""]]);
	});

	test("a change straddling the block's end empties only the part inside it", () => {
		const masked = maskLineChanges([{ startLine: 7, deleteCount: 2, insertLines: ["tags: []", "---", "Milk: 2"] }], 8);
		expect(masked[0].insertLines).toEqual(["", "", "Milk: 2"]);
	});

	test("no block, no masking; the input is not mutated", () => {
		const changes = [{ startLine: 1, deleteCount: 1, insertLines: ["x"] }];
		const out = maskLineChanges(changes, 0);
		expect(out).toEqual(changes);
		const out2 = maskLineChanges(changes, 1);
		expect(out2[0].insertLines).toEqual([""]);
		expect(changes[0].insertLines).toEqual(["x"]);
	});

	test("the resync re-sends every line the block covered before or covers now", () => {
		const doc = ["---", "a: 1", "Milk: 2", "Bread: 3"];
		const text = (n: number) => doc[n - 1];
		// The closing marker was deleted: the old block of 3 lines is no block now.
		expect(frontmatterResync(3, 0, doc.length, text)).toEqual({ startLine: 1, deleteCount: 3, insertLines: ["---", "a: 1", "Milk: 2"] });
		// A block appeared: its lines are emptied.
		expect(frontmatterResync(0, 2, doc.length, text)).toEqual({ startLine: 1, deleteCount: 2, insertLines: ["", ""] });
		expect(frontmatterResync(4, 4, doc.length, text)).toBeNull();
		// Clamped to the new document's length.
		expect(frontmatterResync(9, 0, doc.length, text)?.deleteCount).toBe(4);
	});
});

// ── The pane, on real CodeMirror state ──────────────────────────────

/** A view-shaped object over a real EditorState, as the plugin reads one. */
function viewOf(state: EditorState): any {
	return { state, visibleRanges: [{ from: 0, to: state.doc.length }] };
}

/** Each line's result widget text, by line number. */
function results(plugin: MarkdownEditorViewPlugin): Map<number, string> {
	const out = new Map<number, string>();
	(plugin.decorations as any).between(0, 1e9, (_f: number, _t: number, deco: any) => {
		const w = deco?.spec?.widget;
		if (w) out.set(w.lineNumber, w.result);
	});
	return out;
}

/** Apply an edit as the editor does, and hand the plugin the update. */
function edit(plugin: MarkdownEditorViewPlugin, view: any, change: { from: number; to?: number; insert?: string }): any {
	const tr = view.state.update({ changes: change });
	const next = viewOf(tr.state);
	plugin.update({ docChanged: true, viewportChanged: false, view: next, state: tr.state, startState: tr.startState, changes: tr.changes, transactions: [tr] } as any);
	return next;
}

describe("in a pane", () => {
	afterEach(() => EngineProvider.reset());

	test("the issue's note: no result in the frontmatter, and the lines below keep theirs", () => {
		const view = viewOf(EditorState.create({ doc: NOTE.join("\n") }));
		const plugin = new MarkdownEditorViewPlugin(view);
		const r = results(plugin);
		for (let line = 1; line <= 8; line++) expect({ line, result: r.get(line) }).toEqual({ line, result: undefined });
		expect(r.get(9)).toBe("= 2");
		expect(r.get(10)).toBe("= 3");
		expect(r.get(11)).toBe("= 5");
		plugin.destroy();
	});

	test("line numbers below the block still mean the editor's lines", () => {
		const doc = [...NOTE.slice(0, 8), "Milk: 2", "Bread: 3", "line 9 * 10"].join("\n");
		const plugin = new MarkdownEditorViewPlugin(viewOf(EditorState.create({ doc })));
		expect(results(plugin).get(11)).toBe("= 20");
		plugin.destroy();
	});

	test("deleting the closing marker turns the block back into calculation lines", () => {
		const doc = ["---", "budget: 150", "---", "Milk: 2"].join("\n");
		let view = viewOf(EditorState.create({ doc }));
		const plugin = new MarkdownEditorViewPlugin(view);
		expect(results(plugin).get(2)).toBeUndefined();
		// Delete "---\n" on line 3.
		const line3 = view.state.doc.line(3);
		view = edit(plugin, view, { from: line3.from, to: line3.to + 1 });
		expect(results(plugin).get(2)).toBe("= 150");
		expect(results(plugin).get(3)).toBe("= 2");
		plugin.destroy();
	});

	test("typing the opening marker on the first line hides what becomes frontmatter", () => {
		const doc = ["budget: 150", "---", "Milk: 2"].join("\n");
		let view = viewOf(EditorState.create({ doc }));
		const plugin = new MarkdownEditorViewPlugin(view);
		expect(results(plugin).get(1)).toBe("= 150");
		view = edit(plugin, view, { from: 0, insert: "---\n" });
		const r = results(plugin);
		expect(r.get(1)).toBeUndefined();
		expect(r.get(2)).toBeUndefined();
		expect(r.get(4)).toBe("= 2");
		plugin.destroy();
	});

	test("an edit inside the block stays out of evaluation, and one below it is evaluated", () => {
		let view = viewOf(EditorState.create({ doc: NOTE.join("\n") }));
		const plugin = new MarkdownEditorViewPlugin(view);
		const budget = view.state.doc.line(3);
		view = edit(plugin, view, { from: budget.from, to: budget.to, insert: "budget: 999" });
		expect(results(plugin).get(3)).toBeUndefined();
		const milk = view.state.doc.line(9);
		view = edit(plugin, view, { from: milk.from, to: milk.to, insert: "Milk: 7" });
		expect(results(plugin).get(9)).toBe("= 7");
		expect(results(plugin).get(11)).toBe("= 10");
		plugin.destroy();
	});

	test("adversarial: markup, prototype words and a huge block are read as YAML text, not evaluated", () => {
		const yaml = ["<script>alert(1)</script>: 1", "constructor: 2", "__proto__: 3", "$(touch x): 4", ...Array.from({ length: 2000 }, (_, i) => `k${i}: ${i}`)];
		const doc = ["---", ...yaml, "---", "1 + 1"].join("\n");
		const before = Object.getOwnPropertyNames(Object.prototype).sort();
		const plugin = new MarkdownEditorViewPlugin(viewOf(EditorState.create({ doc })));
		const r = results(plugin);
		expect([...r.keys()]).toEqual([yaml.length + 3]);
		expect(r.get(yaml.length + 3)).toBe("= 2");
		expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(before);
		plugin.destroy();
	});
});
