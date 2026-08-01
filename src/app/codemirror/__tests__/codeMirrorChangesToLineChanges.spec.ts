import { describe, test, expect } from "@jest/globals";
import { codeMirrorChangesToLineChanges } from "@app/codemirror/MarkdownEditorViewPlugin";
import type { LineChange } from "@solve/core/engine";

/**
 * Direct, adversarial coverage for the CodeMirror-diff → LineChange bridge.
 *
 * `DocumentModel.applyChanges` treats each `insertLines[i]` as a line's
 * COMPLETE new text and wholesale discards `deleteCount` old lines' entire
 * state — it does no stitching of its own. This function is the ONLY place
 * that reconstructs a touched line's untouched prefix/suffix around an edit
 * before handing it to `applyChanges`. A previous version of this function
 * did not do that reconstruction at all: it used the raw CodeMirror-reported
 * byte range's inserted text as a line's full new content, which silently
 * truncated everything on a line outside the exact edited byte range —
 * e.g. replacing the "1" in "1 + 2" produced a line reading "9", not
 * "9 + 2". That bug was invisible to the existing plugin-level tests because
 * they only asserted `plugin.decorations` was defined, never the resulting
 * text. These tests assert on the actual `LineChange[]` shape instead.
 */

/** Minimal fake of CM6's `Text` — only `lineAt` is used by the function under test. */
function fakeDoc(lines: string[]) {
	return {
		lineAt(pos: number) {
			let accumulated = 0;
			for (let i = 0; i < lines.length; i++) {
				const lineLen = lines[i].length + (i < lines.length - 1 ? 1 : 0);
				if (pos < accumulated + lineLen || i === lines.length - 1) {
					return { number: i + 1, from: accumulated, to: accumulated + lines[i].length, text: lines[i] };
				}
				accumulated += lineLen;
			}
			// unreachable given the i === lines.length - 1 fallback above
			throw new Error(`position ${pos} out of range`);
		},
	};
}

/** Builds a fake ViewUpdate carrying exactly one iterChanges callback invocation. */
function fakeUpdate(lines: string[], fromA: number, toA: number, insertedText: string): any {
	return {
		startState: { doc: fakeDoc(lines) },
		changes: {
			iterChanges(cb: (fromA: number, toA: number, fromB: number, toB: number, inserted: { toString: () => string }) => void) {
				cb(fromA, toA, fromA, fromA + insertedText.length, { toString: () => insertedText });
			},
		},
	};
}

function apply(lines: string[], change: LineChange): string[] {
	const startIdx = change.startLine - 1;
	const result = lines.slice();
	result.splice(startIdx, change.deleteCount, ...change.insertLines);
	return result;
}

describe("codeMirrorChangesToLineChanges", () => {
	test("replacing a single character mid-line preserves the rest of the line — the core bug", () => {
		const lines = ["1 + 2"];
		const [change] = codeMirrorChangesToLineChanges(fakeUpdate(lines, 0, 1, "9"));
		expect(change).toEqual({ startLine: 1, deleteCount: 1, insertLines: ["9 + 2"] });
		expect(apply(lines, change)).toEqual(["9 + 2"]);
	});

	test("replacing a character in the middle of a line (not at the start) preserves both sides", () => {
		const lines = ["abc"];
		const [change] = codeMirrorChangesToLineChanges(fakeUpdate(lines, 1, 2, "X"));
		expect(change).toEqual({ startLine: 1, deleteCount: 1, insertLines: ["aXc"] });
		expect(apply(lines, change)).toEqual(["aXc"]);
	});

	test("pressing Enter at the very start of a line's text splits it into a blank line + the original content — the reported bug's exact shape", () => {
		const lines = ["roll(1, 6) + roll(1, 6)"];
		const [change] = codeMirrorChangesToLineChanges(fakeUpdate(lines, 0, 0, "\n"));
		expect(change).toEqual({ startLine: 1, deleteCount: 1, insertLines: ["", "roll(1, 6) + roll(1, 6)"] });
		expect(apply(lines, change)).toEqual(["", "roll(1, 6) + roll(1, 6)"]);
	});

	test("pressing Enter three times in a row (simulated as three sequential single-keystroke edits) shifts the expression down by exactly three lines", () => {
		let lines = ["10 + 5"];
		for (let i = 0; i < 3; i++) {
			const [change] = codeMirrorChangesToLineChanges(fakeUpdate(lines, 0, 0, "\n"));
			lines = apply(lines, change);
		}
		expect(lines).toEqual(["", "", "", "10 + 5"]);
	});

	test("pressing Enter in the middle of a line splits it into two lines, each keeping its own half", () => {
		const lines = ["abcdef"];
		const [change] = codeMirrorChangesToLineChanges(fakeUpdate(lines, 3, 3, "\n"));
		expect(change).toEqual({ startLine: 1, deleteCount: 1, insertLines: ["abc", "def"] });
		expect(apply(lines, change)).toEqual(["abc", "def"]);
	});

	test("pressing Enter at the very end of a line's text leaves the original content on line 1 and adds a blank line 2", () => {
		const lines = ["10 + 5"];
		const [change] = codeMirrorChangesToLineChanges(fakeUpdate(lines, 6, 6, "\n"));
		expect(change).toEqual({ startLine: 1, deleteCount: 1, insertLines: ["10 + 5", ""] });
		expect(apply(lines, change)).toEqual(["10 + 5", ""]);
	});

	test("typing a character at the absolute end of the document appends without disturbing earlier lines", () => {
		const lines = ["a", "b"];
		const [change] = codeMirrorChangesToLineChanges(fakeUpdate(lines, 3, 3, "c"));
		expect(change).toEqual({ startLine: 2, deleteCount: 1, insertLines: ["bc"] });
		expect(apply(lines, change)).toEqual(["a", "bc"]);
	});

	test("pasting multi-line text in the middle of a line stitches both the prefix and suffix onto the correct new lines", () => {
		const lines = ["aXbc"]; // insert "1\n2\n3" between 'a' and 'X'
		const [change] = codeMirrorChangesToLineChanges(fakeUpdate(lines, 1, 1, "1\n2\n3"));
		expect(change).toEqual({ startLine: 1, deleteCount: 1, insertLines: ["a1", "2", "3Xbc"] });
		expect(apply(lines, change)).toEqual(["a1", "2", "3Xbc"]);
	});

	test("deleting a whole line's content (select-all + delete) leaves an empty line, not zero lines", () => {
		const lines = ["abc"];
		const [change] = codeMirrorChangesToLineChanges(fakeUpdate(lines, 0, 3, ""));
		expect(change).toEqual({ startLine: 1, deleteCount: 1, insertLines: [""] });
		expect(apply(lines, change)).toEqual([""]);
	});

	test("deleting a line together with its trailing newline merges the remainder into the previous line correctly", () => {
		const lines = ["a", "b", "c"];
		// Select from the start of line 2 through the start of line 3 (deletes "b\n").
		const [change] = codeMirrorChangesToLineChanges(fakeUpdate(lines, 2, 4, ""));
		expect(change).toEqual({ startLine: 2, deleteCount: 2, insertLines: ["c"] });
		expect(apply(lines, change)).toEqual(["a", "c"]);
	});

	test("deleting a backslash-n mid-document (backspace at the start of a line) joins it with the previous line, preserving both sides' text", () => {
		const lines = ["abc", "def"];
		// Backspace at the start of line 2: deletes the newline between them.
		const [change] = codeMirrorChangesToLineChanges(fakeUpdate(lines, 3, 4, ""));
		expect(change).toEqual({ startLine: 1, deleteCount: 2, insertLines: ["abcdef"] });
		expect(apply(lines, change)).toEqual(["abcdef"]);
	});

	test("replacing a selection spanning three lines with a single line collapses them correctly", () => {
		const lines = ["one", "two", "three"];
		// Select from middle of line 1 through middle of line 3, replace with "X".
		const [change] = codeMirrorChangesToLineChanges(fakeUpdate(lines, 1, 11, "X"));
		expect(change).toEqual({ startLine: 1, deleteCount: 3, insertLines: ["oXee"] });
		expect(apply(lines, change)).toEqual(["oXee"]);
	});

	test("inserting a single blank line above content via a full-line insertion (paste of one line + newline) shifts it down by exactly one, with content intact", () => {
		const lines = ["10 + 5 * 2"];
		const [change] = codeMirrorChangesToLineChanges(fakeUpdate(lines, 0, 0, "\n"));
		expect(apply(lines, change)).toEqual(["", "10 + 5 * 2"]);
	});

	test("a no-op edit (empty range, empty insertion) round-trips the line unchanged", () => {
		const lines = ["10 + 5"];
		const [change] = codeMirrorChangesToLineChanges(fakeUpdate(lines, 3, 3, ""));
		expect(change).toEqual({ startLine: 1, deleteCount: 1, insertLines: ["10 + 5"] });
		expect(apply(lines, change)).toEqual(["10 + 5"]);
	});
});
