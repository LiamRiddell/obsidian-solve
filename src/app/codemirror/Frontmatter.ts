import type { LineChange } from "solve-engine/engine";

/**
 * A note's frontmatter, kept out of evaluation (#97).
 *
 * Frontmatter is the YAML metadata block Obsidian reads at the top of a note:
 * a `---` on the first line, the properties, and a closing `---`. It is not
 * calculation, but the evaluator saw it as lines like any other, so
 * `budget: 150` answered `= 150`, `created: 2026-01-05` answered a date, and
 * "Commit all visible results" would have written those answers into the YAML.
 *
 * The block's lines reach the evaluator as empty strings. An empty line gets
 * no result, and the line count is kept, so `line 9` still means the
 * editor's line 9 and every line below keeps its number.
 *
 * The boundary: inline solves inside frontmatter (#83) are not evaluated
 * either. That is a separate decision; this only stops the YAML being read as
 * calculation lines.
 */

/** A line that opens or closes the block: three hyphens and nothing else but trailing space. */
const MARKER = /^---\s*$/;

/**
 * How many lines at the top of a note are frontmatter, both markers included,
 * or 0 when the note has none. A block opens with `---` on the first line and
 * closes at the next `---`; an opening with no close is not frontmatter, as
 * Obsidian reads it.
 *
 * @param lineCount - The note's number of lines.
 * @param lineText - The text of a 1-based line.
 * @returns The block's line count.
 */
export function frontmatterLineCount(lineCount: number, lineText: (line: number) => string): number {
	if (lineCount < 2 || !MARKER.test(lineText(1))) return 0;
	for (let line = 2; line <= lineCount; line++) {
		if (MARKER.test(lineText(line))) return line;
	}
	return 0;
}

/**
 * A note's text with its frontmatter lines emptied, the line count unchanged.
 *
 * @param text - The note.
 * @returns The text the evaluator is given.
 */
export function maskFrontmatter(text: string): string {
	const lines = text.split("\n");
	const count = frontmatterLineCount(lines.length, (line) => lines[line - 1]);
	for (let i = 0; i < count; i++) lines[i] = "";
	return lines.join("\n");
}

/**
 * Line changes with every inserted line that lands inside the frontmatter
 * emptied. The changes are in the old document's line numbers, as CodeMirror
 * reports them and `DocumentModel.applyChanges` reads them, so each inserted
 * line's new number is found from the changes before it.
 *
 * @param changes - Non-overlapping changes, in ascending order.
 * @param frontmatterLines - The block's size in the new document.
 * @returns The changes the evaluator is given.
 */
export function maskLineChanges(changes: readonly LineChange[], frontmatterLines: number): LineChange[] {
	if (frontmatterLines === 0) return [...changes];
	let shift = 0;
	return changes.map((change) => {
		const firstNewLine = change.startLine + shift;
		shift += change.insertLines.length - change.deleteCount;
		if (firstNewLine > frontmatterLines) return change;
		return {
			...change,
			insertLines: change.insertLines.map((text, i) => (firstNewLine + i <= frontmatterLines ? "" : text)),
		};
	});
}

/**
 * The change that brings the top of the evaluated document back in step when
 * the block itself moved: it opened, closed, grew or shrank, so lines no edit
 * touched changed side. It re-sends every line the block covered before or
 * covers now, each emptied or not as the new block says, in the new
 * document's line numbers; it is applied on its own, after the edit.
 *
 * @param before - The block's size before the edit.
 * @param after - Its size after.
 * @param lineCount - The new document's number of lines.
 * @param lineText - The text of a 1-based line of the new document.
 * @returns The change, or `null` when the block did not move.
 */
export function frontmatterResync(before: number, after: number, lineCount: number, lineText: (line: number) => string): LineChange | null {
	if (before === after) return null;
	const span = Math.min(Math.max(before, after), lineCount);
	if (span === 0) return null;
	const insertLines: string[] = [];
	for (let line = 1; line <= span; line++) insertLines.push(line <= after ? "" : lineText(line));
	return { startLine: 1, deleteCount: span, insertLines };
}
